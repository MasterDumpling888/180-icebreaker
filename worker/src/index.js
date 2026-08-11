import eventData from "../../event.json" with { type: "json" };

const encoder = new TextEncoder();
const activeQuestions = new Set(eventData.questions.filter(question => question.active).map(question => question.id));
const collection = eventData.event.responseCollection;

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
  });
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map(value => value.trim()).filter(Boolean);
  return origin && allowed.includes(origin) ? origin : null;
}

function corsHeaders(origin) {
  return origin ? {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  } : {};
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64url(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

async function safeEqual(left, right) {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right))
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

async function createSession(env) {
  const payload = base64url(encoder.encode(JSON.stringify({ scope: "results:manage", exp: Date.now() + (2 * 60 * 60 * 1000) })));
  return `${payload}.${base64url(await hmac(payload, env.SESSION_SECRET))}`;
}

async function isAuthorized(request, env) {
  try {
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token || !env.SESSION_SECRET) return false;
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return false;
    const expected = await hmac(payload, env.SESSION_SECRET);
    const received = fromBase64url(signature);
    if (expected.length !== received.length) return false;
    let difference = 0;
    for (let index = 0; index < expected.length; index += 1) difference |= expected[index] ^ received[index];
    if (difference !== 0) return false;
    const data = JSON.parse(new TextDecoder().decode(fromBase64url(payload)));
    return data.scope === "results:manage" && data.exp > Date.now();
  } catch {
    return false;
  }
}

async function readBody(request) {
  if (!request.headers.get("Content-Type")?.toLowerCase().includes("application/json")) throw new Error("JSON_REQUIRED");
  return request.json();
}

async function submitResponse(request, env) {
  if (!collection?.enabled) return json({ error: "Response collection is disabled." }, 503);
  if (Date.now() >= Date.parse(collection.expiresAt)) return json({ error: "This event is no longer accepting responses." }, 410);
  let body;
  try { body = await readBody(request); } catch { return json({ error: "A valid JSON body is required." }, 400); }
  const responseText = typeof body.response === "string" ? body.response.trim() : "";
  if (body.eventId !== eventData.event.id || !activeQuestions.has(body.questionId)) return json({ error: "Unknown event or question." }, 404);
  if (typeof body.submissionId !== "string" || !/^[a-zA-Z0-9-]{10,80}$/.test(body.submissionId)) return json({ error: "Invalid submission ID." }, 400);
  if (!responseText || responseText.length > collection.maxLength) return json({ error: `Responses must be 1–${collection.maxLength} characters.` }, 400);
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO responses (id, event_id, question_id, response_text, status, created_at, updated_at, expires_at)
    VALUES (?1, ?2, ?3, ?4, 'pending', ?5, ?5, ?6)
    ON CONFLICT(id) DO UPDATE SET response_text = excluded.response_text, status = 'pending', updated_at = excluded.updated_at
    WHERE responses.event_id = excluded.event_id AND responses.question_id = excluded.question_id
  `).bind(body.submissionId, body.eventId, body.questionId, responseText, now, collection.expiresAt).run();
  return json({ ok: true }, 201);
}

async function createAdminSession(request, env) {
  let body;
  try { body = await readBody(request); } catch { return json({ error: "A valid JSON body is required." }, 400); }
  if (!env.ADMIN_PASSCODE || !env.SESSION_SECRET) return json({ error: "Officer access is not configured." }, 503);
  if (typeof body.passcode !== "string" || !(await safeEqual(body.passcode, env.ADMIN_PASSCODE))) return json({ error: "Incorrect passcode." }, 401);
  return json({ token: await createSession(env), expiresIn: 7200 });
}

async function listResponses(env) {
  const result = await env.DB.prepare(`
    SELECT id, question_id AS questionId, response_text AS response, status, created_at AS createdAt, updated_at AS updatedAt
    FROM responses WHERE event_id = ?1 AND expires_at > ?2 ORDER BY created_at ASC
  `).bind(eventData.event.id, new Date().toISOString()).all();
  return json({ eventId: eventData.event.id, responses: result.results ?? [] });
}

async function updateResponse(request, env, id) {
  let body;
  try { body = await readBody(request); } catch { return json({ error: "A valid JSON body is required." }, 400); }
  if (!["approved", "hidden", "pending"].includes(body.status)) return json({ error: "Invalid moderation status." }, 400);
  const result = await env.DB.prepare("UPDATE responses SET status = ?1, updated_at = ?2 WHERE id = ?3 AND event_id = ?4")
    .bind(body.status, new Date().toISOString(), id, eventData.event.id).run();
  return result.meta.changes ? json({ ok: true }) : json({ error: "Response not found." }, 404);
}

async function approveResponses(request, env) {
  let body = {};
  try { body = await readBody(request); } catch { return json({ error: "A valid JSON body is required." }, 400); }
  const questionId = body.questionId;
  if (questionId && !activeQuestions.has(questionId)) return json({ error: "Unknown question." }, 404);
  const statement = questionId
    ? env.DB.prepare("UPDATE responses SET status = 'approved', updated_at = ?1 WHERE event_id = ?2 AND question_id = ?3 AND status = 'pending'").bind(new Date().toISOString(), eventData.event.id, questionId)
    : env.DB.prepare("UPDATE responses SET status = 'approved', updated_at = ?1 WHERE event_id = ?2 AND status = 'pending'").bind(new Date().toISOString(), eventData.event.id);
  const result = await statement.run();
  return json({ ok: true, changed: result.meta.changes ?? 0 });
}

async function deleteEventResponses(env) {
  const result = await env.DB.prepare("DELETE FROM responses WHERE event_id = ?1").bind(eventData.event.id).run();
  return json({ ok: true, deleted: result.meta.changes ?? 0 });
}

async function route(request, env) {
  const url = new URL(request.url);
  if (request.method === "POST" && url.pathname === "/v1/responses") return submitResponse(request, env);
  if (request.method === "POST" && url.pathname === "/v1/admin/session") return createAdminSession(request, env);
  if (url.pathname.startsWith("/v1/admin/") && !(await isAuthorized(request, env))) return json({ error: "Officer authorization is required." }, 401);
  if (request.method === "GET" && url.pathname === "/v1/admin/responses") return listResponses(env);
  if (request.method === "POST" && url.pathname === "/v1/admin/responses/approve") return approveResponses(request, env);
  const responseMatch = url.pathname.match(/^\/v1\/admin\/responses\/([a-zA-Z0-9-]+)$/);
  if (request.method === "PATCH" && responseMatch) return updateResponse(request, env, responseMatch[1]);
  if (request.method === "DELETE" && url.pathname === `/v1/admin/events/${eventData.event.id}/responses`) return deleteEventResponses(env);
  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (request.headers.has("Origin") && !origin) return json({ error: "Origin not allowed." }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    const response = await route(request, env);
    for (const [key, value] of Object.entries(corsHeaders(origin))) response.headers.set(key, value);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  },

  async scheduled(_controller, env) {
    await env.DB.prepare("DELETE FROM responses WHERE expires_at <= ?1").bind(new Date().toISOString()).run();
  }
};
