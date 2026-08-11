import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.js";

function createEnvironment() {
  const calls = [];
  return {
    calls,
    env: {
      ADMIN_PASSCODE: "test-officer-passcode",
      SESSION_SECRET: "test-session-secret-that-is-long",
      ALLOWED_ORIGINS: "http://localhost:8000",
      DB: {
        prepare(sql) {
          const call = { sql, values: [] };
          calls.push(call);
          return {
            bind(...values) { call.values = values; return this; },
            async run() { return { meta: { changes: 1 } }; },
            async all() { return { results: [] }; }
          };
        }
      }
    }
  };
}

test("accepts a valid anonymous response without identity fields", async () => {
  const { env, calls } = createEnvironment();
  const request = new Request("https://api.example/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:8000" },
    body: JSON.stringify({
      submissionId: "12345678-1234-4123-8123-123456789012",
      eventId: "fam-dinner-2026-09-05",
      questionId: "ice-001",
      response: "  Paul  ",
      answerer: "must not be stored",
      note: "must not be stored"
    })
  });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 201);
  assert.deepEqual(calls[0].values.slice(0, 4), ["12345678-1234-4123-8123-123456789012", "fam-dinner-2026-09-05", "ice-001", "Paul"]);
  assert.equal(calls[0].values.includes("must not be stored"), false);
});

test("rejects unknown questions and disallowed origins", async () => {
  const { env } = createEnvironment();
  const unknown = await worker.fetch(new Request("https://api.example/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:8000" },
    body: JSON.stringify({ submissionId: "12345678-1234-4123-8123-123456789012", eventId: "fam-dinner-2026-09-05", questionId: "unknown", response: "Paul" })
  }), env);
  assert.equal(unknown.status, 404);

  const forbidden = await worker.fetch(new Request("https://api.example/v1/responses", { method: "POST", headers: { Origin: "https://evil.example" } }), env);
  assert.equal(forbidden.status, 403);
});

test("creates an officer session and rejects malformed tokens", async () => {
  const { env } = createEnvironment();
  const login = await worker.fetch(new Request("https://api.example/v1/admin/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passcode: "test-officer-passcode" })
  }), env);
  assert.equal(login.status, 200);
  assert.match((await login.json()).token, /^[^.]+\.[^.]+$/);

  const protectedResponse = await worker.fetch(new Request("https://api.example/v1/admin/responses", {
    headers: { Authorization: "Bearer malformed.token" }
  }), env);
  assert.equal(protectedResponse.status, 401);
});
