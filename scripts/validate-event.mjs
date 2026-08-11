import { readFile } from "node:fs/promises";

const data = JSON.parse(await readFile(new URL("../event.json", import.meta.url), "utf8"));
const { event, questions } = data;
const errors = [];
const allowedTypes = new Set(["icebreaker", "message_discussion"]);

if (!event?.id || !event?.title || !/^\d{4}-\d{2}-\d{2}$/.test(event?.date ?? "")) errors.push("Event ID, title, and a YYYY-MM-DD date are required.");
if (event?.subheader !== undefined && typeof event.subheader !== "string") errors.push("Event subheader must be text when provided.");
if (!Number.isInteger(event?.questionCount) || event.questionCount < 1) errors.push("questionCount must be a positive integer.");
if (event?.responseCollection?.enabled) {
  const collection = event.responseCollection;
  if (typeof collection.apiBaseUrl !== "string" || !/^https?:\/\//.test(collection.apiBaseUrl)) errors.push("responseCollection.apiBaseUrl must be an HTTP(S) URL.");
  if (!Number.isInteger(collection.maxLength) || collection.maxLength < 20 || collection.maxLength > 500) errors.push("responseCollection.maxLength must be between 20 and 500.");
  if (Number.isNaN(Date.parse(collection.expiresAt))) errors.push("responseCollection.expiresAt must be a valid timestamp.");
}
if (!Array.isArray(questions)) errors.push("questions must be an array.");

if (Array.isArray(questions)) {
  const active = questions.filter(question => question.active);
  const ids = active.map(question => question.id);
  if (active.length !== event.questionCount) errors.push(`Expected ${event.questionCount} active questions, found ${active.length}.`);
  if (new Set(ids).size !== ids.length) errors.push("Active question IDs must be unique.");
  if (active.some(question => !question.id || !question.text?.trim() || !allowedTypes.has(question.type))) errors.push("Every active question needs an ID, text, and supported type.");
  const icebreakers = active.filter(question => question.type === "icebreaker").length;
  const discussions = active.filter(question => question.type === "message_discussion").length;
  if (event.mix?.icebreaker !== icebreakers || event.mix?.message_discussion !== discussions) errors.push("event.mix does not match the active questions.");
  if (!event.messageDiscussionEnabled && discussions > 0) errors.push("Discussion questions exist while messageDiscussionEnabled is false.");
  if (event.messageDiscussionEnabled && discussions === 0) errors.push("Discussion is enabled but no discussion questions exist.");
}

if (event?.placeholderContent) console.warn("WARNING: event.json still contains placeholder content and is not event-ready.");
if (errors.length) {
  errors.forEach(error => console.error(`ERROR: ${error}`));
  process.exitCode = 1;
} else {
  console.log(`event.json is valid: ${event.questionCount} active questions for ${event.id}.`);
}
