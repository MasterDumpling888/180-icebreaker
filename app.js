const app = document.querySelector("#app");
const EVENT_URL = "./event.json";
let config;
let state;
let activeQuestionId = null;

function storageKey() {
  return `180-famdinner:${config.event.id}`;
}

function emptyState() {
  return { started: false, completed: [], notes: {}, answerers: {} };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey()));
    if (!saved || !Array.isArray(saved.completed) || typeof saved.notes !== "object") return emptyState();
    const answerers = saved.answerers && typeof saved.answerers === "object" ? saved.answerers : {};
    return {
      started: Boolean(saved.started),
      completed: saved.completed.filter(questionId => answerers[questionId]?.trim()),
      notes: saved.notes ?? {},
      answerers
    };
  } catch {
    return emptyState();
  }
}

function saveState() {
  try { localStorage.setItem(storageKey(), JSON.stringify(state)); } catch { /* The app still works without persistence. */ }
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[character]);
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "long", day: "numeric" })
    .format(new Date(`${dateString}T00:00:00`));
}

function activeQuestions() {
  return config.questions.filter(question => question.active).sort((a, b) => a.displayOrder - b.displayOrder);
}

function renderWelcome() {
  const event = config.event;
  app.innerHTML = `
    <section class="panel welcome-panel">
      <p class="eyebrow">A connection card for your table</p>
      <h1>${escapeHtml(event.title)}</h1>
      <div class="event-meta">
        <span class="pill">${escapeHtml(formatDate(event.date))}</span>
        <span class="pill">${escapeHtml(event.topic)}</span>
      </div>
      <p class="lede">${escapeHtml(event.introduction)}</p>
      ${event.placeholderContent ? `<div class="notice placeholder-notice"><strong>Preview questions:</strong> These prompts are temporary and still need ministry-team approval before the event.</div>` : ""}
      <div class="notice"><strong>Your privacy:</strong> First names and optional notes stay in this browser and are never sent to 180 or MGC. Avoid adding sensitive details or pastoral-care information.</div>
      <div class="actions">
        <button class="button button-primary" data-action="start">${state.started ? "Continue connecting" : "Start connecting"}</button>
        ${state.started ? `<button class="button button-quiet" data-action="clear">Clear names, progress, and notes</button>` : ""}
      </div>
    </section>`;
}

function renderGame({ allowComplete = false } = {}) {
  const questions = activeQuestions();
  const completedCount = questions.filter(question => state.completed.includes(question.id)).length;
  if (completedCount === questions.length && !allowComplete) return renderCompletion();
  app.innerHTML = `
    <section class="panel">
      <header class="game-header">
        <div><p class="eyebrow">${escapeHtml(config.event.title)}</p><h1>Choose a question</h1></div>
        <div>
          <p class="progress-copy">${completedCount} of ${questions.length} conversations complete</p>
          <div class="progress-track" role="progressbar" aria-label="Card progress" aria-valuemin="0" aria-valuemax="${questions.length}" aria-valuenow="${completedCount}">
            <div class="progress-bar" style="width: ${(completedCount / questions.length) * 100}%"></div>
          </div>
        </div>
      </header>
      <div class="card-grid" aria-label="Connection questions">
        ${questions.map(question => `
          <button class="prompt-tile ${question.type === "message_discussion" ? "is-discussion" : ""} ${state.completed.includes(question.id) ? "is-complete" : ""}"
            data-question-id="${escapeHtml(question.id)}" aria-pressed="${state.completed.includes(question.id)}">
            <span class="tile-question">${escapeHtml(question.text)}</span>
            ${state.answerers[question.id] ? `<span class="answered-by">Answered by ${escapeHtml(state.answerers[question.id])}</span>` : ""}
          </button>`).join("")}
      </div>
      <footer class="game-footer">
        <p class="game-tip">Try to hear from someone different each round.</p>
        <button class="button button-quiet" data-action="home">Home</button>
      </footer>
    </section>`;
}

function openQuestion(questionId) {
  const question = activeQuestions().find(item => item.id === questionId);
  if (!question) return;
  activeQuestionId = questionId;
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.dataset.modal = "true";
  backdrop.innerHTML = `
    <section class="prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="prompt-title">
      <p class="type-label">${question.type === "message_discussion" ? "Message discussion" : "Icebreaker"}</p>
      <h2 class="question-text" id="prompt-title">${escapeHtml(question.text)}</h2>
      <label for="answerer-name">Who answered?</label>
      <input id="answerer-name" type="text" maxlength="60" autocomplete="off" placeholder="First name" value="${escapeHtml(state.answerers[questionId] ?? "")}" aria-describedby="name-help name-error">
      <p class="help-text" id="name-help">Enter the name they’d like you to remember.</p>
      <p class="field-error" id="name-error" role="alert" hidden>Please enter the person’s name.</p>
      <label for="private-note">Private note <span class="help-text">(optional)</span></label>
      <textarea id="private-note" maxlength="500" placeholder="A short reminder for yourself…">${escapeHtml(state.notes[questionId] ?? "")}</textarea>
      <p class="help-text">Saved only in this browser. Please don’t enter sensitive or identifying information.</p>
      <div class="actions">
        <button class="button button-primary" data-action="complete-question">${state.completed.includes(questionId) ? "Save note" : "Mark conversation complete"}</button>
        ${state.completed.includes(questionId) ? `<button class="button button-secondary" data-action="undo-question">Mark incomplete</button>` : ""}
        <button class="button button-quiet" data-action="close-question">Back to card</button>
      </div>
    </section>`;
  document.body.append(backdrop);
  backdrop.querySelector("#answerer-name").focus();
}

function closeQuestion() {
  document.querySelector("[data-modal]")?.remove();
  activeQuestionId = null;
}

function saveActiveResponse({ requireName = false } = {}) {
  const nameInput = document.querySelector("#answerer-name");
  const name = nameInput?.value.trim() ?? "";
  const error = document.querySelector("#name-error");
  if (requireName && !name) {
    error.hidden = false;
    nameInput.setAttribute("aria-invalid", "true");
    nameInput.focus();
    return false;
  }
  if (name) state.answerers[activeQuestionId] = name;
  else delete state.answerers[activeQuestionId];
  const note = document.querySelector("#private-note")?.value.trim() ?? "";
  if (note) state.notes[activeQuestionId] = note;
  else delete state.notes[activeQuestionId];
  return true;
}

function renderCompletion() {
  app.innerHTML = `
    <section class="panel welcome-panel">
      <div class="completion-mark" aria-hidden="true">✓</div>
      <p class="eyebrow">Card complete</p>
      <h1>Great conversations start here.</h1>
      <p class="lede">You finished all ${activeQuestions().length} prompts. Put the phone away and keep enjoying your table.</p>
      <div class="actions">
        <button class="button button-secondary" data-action="review">Review my card</button>
        <button class="button button-quiet" data-action="clear">Clear names, progress, and notes</button>
      </div>
    </section>`;
}

function renderError(message) {
  app.innerHTML = `
    <section class="panel welcome-panel">
      <p class="eyebrow">We couldn’t load the card</p>
      <h1>Please reconnect and try again.</h1>
      <p class="lede">The event questions may be temporarily unavailable. If this continues, ask a table leader for help.</p>
      <p class="error-details">${escapeHtml(message)}</p>
      <button class="button button-primary" data-action="retry">Try again</button>
    </section>`;
}

function validateConfig(data) {
  const event = data?.event;
  const questions = data?.questions;
  if (!event?.id || !event?.title || !event?.date || !Number.isInteger(event.questionCount)) throw new Error("The event details are incomplete.");
  if (!Array.isArray(questions)) throw new Error("The question list is missing.");
  const active = questions.filter(question => question.active);
  if (active.length !== event.questionCount) throw new Error(`Expected ${event.questionCount} active questions but found ${active.length}.`);
  if (new Set(active.map(question => question.id)).size !== active.length) throw new Error("Question IDs must be unique.");
  if (active.some(question => !["icebreaker", "message_discussion"].includes(question.type) || !question.text?.trim())) throw new Error("A question has an invalid type or missing text.");
  const counts = active.reduce((result, question) => ({ ...result, [question.type]: (result[question.type] ?? 0) + 1 }), {});
  if (counts.icebreaker !== event.mix.icebreaker || (counts.message_discussion ?? 0) !== event.mix.message_discussion) throw new Error("The configured question mix does not match the active questions.");
  if (!event.messageDiscussionEnabled && active.some(question => question.type === "message_discussion")) throw new Error("Message discussion questions are present but disabled.");
  return data;
}

async function initialize() {
  try {
    const response = await fetch(EVENT_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Event file returned status ${response.status}.`);
    config = validateConfig(await response.json());
    state = loadState();
    renderWelcome();
  } catch (error) {
    renderError(error instanceof Error ? error.message : "Unknown error");
  }
}

document.addEventListener("click", event => {
  const target = event.target.closest("button");
  if (!target) return;
  const action = target.dataset.action;
  if (target.dataset.questionId) return openQuestion(target.dataset.questionId);
  if (action === "start") { state.started = true; saveState(); renderGame(); }
  if (action === "review") renderGame({ allowComplete: true });
  if (action === "home") renderWelcome();
  if (action === "retry") initialize();
  if (action === "close-question") closeQuestion();
  if (action === "complete-question") {
    if (!saveActiveResponse({ requireName: true })) return;
    if (!state.completed.includes(activeQuestionId)) state.completed.push(activeQuestionId);
    saveState(); closeQuestion(); renderGame();
  }
  if (action === "undo-question") {
    saveActiveResponse();
    state.completed = state.completed.filter(id => id !== activeQuestionId);
    saveState(); closeQuestion(); renderGame();
  }
  if (action === "clear" && window.confirm("Clear all names, progress, and private notes for this event on this browser?")) {
    try { localStorage.removeItem(storageKey()); } catch { /* Nothing else to clear. */ }
    state = emptyState(); renderWelcome();
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && activeQuestionId) closeQuestion();
});

initialize();
