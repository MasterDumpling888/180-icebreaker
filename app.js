const EVENT_URL = "./event.json";

class Html {
  static escape(value = "") {
    return String(value).replace(/[&<>"]/g, character => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[character]
    ));
  }

  static formatDate(dateString) {
    return new Intl.DateTimeFormat("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(new Date(`${dateString}T00:00:00`));
  }
}

class EventConfiguration {
  static async load(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Event file returned status ${response.status}.`);
    return new EventConfiguration(await response.json());
  }

  constructor(data) {
    this.#validate(data);
    this.event = Object.freeze({ ...data.event });
    this.questions = Object.freeze(
      data.questions
        .filter(question => question.active)
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map(question => Object.freeze({ ...question }))
    );
  }

  #validate(data) {
    const event = data?.event;
    const questions = data?.questions;
    if (!event?.id || !event?.title || !event?.date || !Number.isInteger(event.questionCount)) {
      throw new Error("The event details are incomplete.");
    }
    if (!Array.isArray(questions)) throw new Error("The question list is missing.");

    const active = questions.filter(question => question.active);
    if (active.length !== event.questionCount) {
      throw new Error(`Expected ${event.questionCount} active questions but found ${active.length}.`);
    }
    if (new Set(active.map(question => question.id)).size !== active.length) {
      throw new Error("Question IDs must be unique.");
    }
    if (active.some(question => !["icebreaker", "message_discussion"].includes(question.type) || !question.text?.trim())) {
      throw new Error("A question has an invalid type or missing text.");
    }

    const counts = active.reduce((result, question) => {
      result[question.type] = (result[question.type] ?? 0) + 1;
      return result;
    }, {});
    if (counts.icebreaker !== event.mix.icebreaker || (counts.message_discussion ?? 0) !== event.mix.message_discussion) {
      throw new Error("The configured question mix does not match the active questions.");
    }
    if (!event.messageDiscussionEnabled && active.some(question => question.type === "message_discussion")) {
      throw new Error("Message discussion questions are present but disabled.");
    }
  }

  findQuestion(questionId) {
    return this.questions.find(question => question.id === questionId);
  }
}

class ProgressStore {
  constructor(eventId, storage = window.localStorage) {
    this.key = `180-famdinner:${eventId}`;
    this.storage = storage;
    this.state = this.#load();
  }

  static emptyState() {
    return { started: false, completed: [], notes: {}, answerers: {} };
  }

  #load() {
    try {
      const saved = JSON.parse(this.storage.getItem(this.key));
      if (!saved || !Array.isArray(saved.completed) || typeof saved.notes !== "object") {
        return ProgressStore.emptyState();
      }
      const answerers = saved.answerers && typeof saved.answerers === "object" ? saved.answerers : {};
      return {
        started: Boolean(saved.started),
        completed: saved.completed.filter(questionId => answerers[questionId]?.trim()),
        notes: saved.notes ?? {},
        answerers
      };
    } catch {
      return ProgressStore.emptyState();
    }
  }

  save() {
    try { this.storage.setItem(this.key, JSON.stringify(this.state)); } catch { /* Continue without persistence. */ }
  }

  start() {
    this.state.started = true;
    this.save();
  }

  complete(questionId, { answerer, note }) {
    this.state.answerers[questionId] = answerer;
    if (note) this.state.notes[questionId] = note;
    else delete this.state.notes[questionId];
    if (!this.state.completed.includes(questionId)) this.state.completed.push(questionId);
    this.save();
  }

  markIncomplete(questionId, { answerer, note }) {
    if (answerer) this.state.answerers[questionId] = answerer;
    else delete this.state.answerers[questionId];
    if (note) this.state.notes[questionId] = note;
    else delete this.state.notes[questionId];
    this.state.completed = this.state.completed.filter(id => id !== questionId);
    this.save();
  }

  isComplete(questionId) {
    return this.state.completed.includes(questionId);
  }

  clear() {
    try { this.storage.removeItem(this.key); } catch { /* Nothing else to clear. */ }
    this.state = ProgressStore.emptyState();
  }
}

class ThemeManager {
  constructor(root = document.documentElement, storage = window.localStorage) {
    this.root = root;
    this.storage = storage;
    this.key = "180-famdinner:theme";
    this.media = window.matchMedia("(prefers-color-scheme: dark)");
    this.preference = this.#loadPreference();
    this.apply();
    this.media.addEventListener?.("change", () => {
      if (!this.preference) this.apply();
    });
  }

  #loadPreference() {
    try {
      const value = this.storage.getItem(this.key);
      return ["light", "dark"].includes(value) ? value : null;
    } catch {
      return null;
    }
  }

  get mode() {
    return this.preference ?? (this.media.matches ? "dark" : "light");
  }

  get nextMode() {
    return this.mode === "dark" ? "light" : "dark";
  }

  toggle() {
    this.preference = this.nextMode;
    try { this.storage.setItem(this.key, this.preference); } catch { /* Theme still applies for this visit. */ }
    this.apply();
  }

  apply() {
    this.root.dataset.theme = this.mode;
    this.root.style.colorScheme = this.mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      this.mode === "dark" ? "#181512" : "#fff5e5"
    );
  }
}

class FamDinnerApp {
  constructor(root, { eventUrl = EVENT_URL } = {}) {
    this.root = root;
    this.eventUrl = eventUrl;
    this.theme = new ThemeManager();
    this.config = null;
    this.progress = null;
    this.activeQuestionId = null;
    this.eventsBound = false;
    this.handleClick = this.handleClick.bind(this);
    this.handleKeydown = this.handleKeydown.bind(this);
  }

  async initialize() {
    this.bindEvents();
    try {
      this.config = await EventConfiguration.load(this.eventUrl);
      this.progress = new ProgressStore(this.config.event.id);
      this.renderWelcome();
    } catch (error) {
      this.renderError(error instanceof Error ? error.message : "Unknown error");
    }
  }

  bindEvents() {
    if (this.eventsBound) return;
    document.addEventListener("click", this.handleClick);
    document.addEventListener("keydown", this.handleKeydown);
    this.eventsBound = true;
  }

  themeControl() {
    return `<button class="theme-toggle" data-action="toggle-theme" aria-label="Switch to ${this.theme.nextMode} mode" title="Switch to ${this.theme.nextMode} mode">
      <span aria-hidden="true">${this.theme.mode === "dark" ? "☀" : "☾"}</span>
      <span>${this.theme.nextMode} mode</span>
    </button>`;
  }

  renderWelcome() {
    const { event } = this.config;
    const { state } = this.progress;
    this.root.innerHTML = `
      ${this.themeControl()}
      <section class="panel welcome-panel">
        <p class="eyebrow">A connection card for your table</p>
        <h1>${Html.escape(event.title)}</h1>
        <div class="event-meta">
          <span class="pill">${Html.escape(Html.formatDate(event.date))}</span>
          <span class="pill">${Html.escape(event.topic)}</span>
        </div>
        <p class="lede">${Html.escape(event.introduction)}</p>
        ${event.placeholderContent ? `<div class="notice placeholder-notice"><strong>Preview questions:</strong> These prompts are temporary and still need ministry-team approval before the event.</div>` : ""}
        <div class="notice"><strong>Your privacy:</strong> First names and optional notes stay in this browser and are never sent to 180 or MGC. Avoid adding sensitive details or pastoral-care information.</div>
        <div class="actions">
          <button class="button button-primary" data-action="start">${state.started ? "Continue connecting" : "Start connecting"}</button>
          ${state.started ? `<button class="button button-quiet" data-action="clear">Clear names, progress, and notes</button>` : ""}
        </div>
      </section>`;
  }

  renderGame({ allowComplete = false } = {}) {
    const { questions } = this.config;
    const completedCount = questions.filter(question => this.progress.isComplete(question.id)).length;
    if (completedCount === questions.length && !allowComplete) return this.renderCompletion();

    this.root.innerHTML = `
      ${this.themeControl()}
      <section class="panel">
        <header class="game-header">
          <div><p class="eyebrow">${Html.escape(this.config.event.title)}</p><h1>Choose a question</h1></div>
          <div>
            <p class="progress-copy">${completedCount} of ${questions.length} conversations complete</p>
            <div class="progress-track" role="progressbar" aria-label="Card progress" aria-valuemin="0" aria-valuemax="${questions.length}" aria-valuenow="${completedCount}">
              <div class="progress-bar" style="width: ${(completedCount / questions.length) * 100}%"></div>
            </div>
          </div>
        </header>
        <div class="card-grid" aria-label="Connection questions">
          ${questions.map(question => this.renderQuestionTile(question)).join("")}
        </div>
        <footer class="game-footer">
          <p class="game-tip">Try to hear from someone different each round.</p>
          <button class="button button-quiet" data-action="home">Home</button>
        </footer>
      </section>`;
  }

  renderQuestionTile(question) {
    const isComplete = this.progress.isComplete(question.id);
    const answerer = this.progress.state.answerers[question.id];
    return `
      <button class="prompt-tile ${question.type === "message_discussion" ? "is-discussion" : ""} ${isComplete ? "is-complete" : ""}"
        data-question-id="${Html.escape(question.id)}" aria-pressed="${isComplete}">
        <span class="tile-question">${Html.escape(question.text)}</span>
        ${answerer ? `<span class="answered-by">Answered by ${Html.escape(answerer)}</span>` : ""}
      </button>`;
  }

  openQuestion(questionId) {
    const question = this.config.findQuestion(questionId);
    if (!question) return;
    this.activeQuestionId = questionId;
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.dataset.modal = "true";
    backdrop.innerHTML = `
      <section class="prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="prompt-title">
        <p class="type-label">${question.type === "message_discussion" ? "Message discussion" : "Icebreaker"}</p>
        <h2 class="question-text" id="prompt-title">${Html.escape(question.text)}</h2>
        <label for="answerer-name">Who answered?</label>
        <input id="answerer-name" type="text" maxlength="60" autocomplete="off" placeholder="First name" value="${Html.escape(this.progress.state.answerers[questionId] ?? "")}" aria-describedby="name-help name-error">
        <p class="help-text" id="name-help">Enter the name they’d like you to remember.</p>
        <p class="field-error" id="name-error" role="alert" hidden>Please enter the person’s name.</p>
        <label for="private-note">Private note <span class="help-text">(optional)</span></label>
        <textarea id="private-note" maxlength="500" placeholder="A short reminder for yourself…">${Html.escape(this.progress.state.notes[questionId] ?? "")}</textarea>
        <p class="help-text">Saved only in this browser. Please don’t enter sensitive or identifying information.</p>
        <div class="actions">
          <button class="button button-primary" data-action="complete-question">${this.progress.isComplete(questionId) ? "Save response" : "Mark conversation complete"}</button>
          ${this.progress.isComplete(questionId) ? `<button class="button button-secondary" data-action="undo-question">Mark incomplete</button>` : ""}
          <button class="button button-quiet" data-action="close-question">Back to card</button>
        </div>
      </section>`;
    document.body.append(backdrop);
    backdrop.querySelector("#answerer-name").focus();
  }

  closeQuestion() {
    document.querySelector("[data-modal]")?.remove();
    this.activeQuestionId = null;
  }

  readActiveResponse({ requireName = false } = {}) {
    const nameInput = document.querySelector("#answerer-name");
    const answerer = nameInput?.value.trim() ?? "";
    if (requireName && !answerer) {
      const error = document.querySelector("#name-error");
      error.hidden = false;
      nameInput.setAttribute("aria-invalid", "true");
      nameInput.focus();
      return null;
    }
    return {
      answerer,
      note: document.querySelector("#private-note")?.value.trim() ?? ""
    };
  }

  renderCompletion() {
    this.root.innerHTML = `
      ${this.themeControl()}
      <section class="panel welcome-panel">
        <div class="completion-mark" aria-hidden="true">✓</div>
        <p class="eyebrow">Card complete</p>
        <h1>Great conversations start here.</h1>
        <p class="lede">You finished all ${this.config.questions.length} prompts. Put the phone away and keep enjoying your table.</p>
        <div class="actions">
          <button class="button button-secondary" data-action="review">Review my card</button>
          <button class="button button-quiet" data-action="clear">Clear names, progress, and notes</button>
        </div>
      </section>`;
  }

  renderError(message) {
    this.root.innerHTML = `
      ${this.themeControl()}
      <section class="panel welcome-panel">
        <p class="eyebrow">We couldn’t load the card</p>
        <h1>Please reconnect and try again.</h1>
        <p class="lede">The event questions may be temporarily unavailable. If this continues, ask a table leader for help.</p>
        <p class="error-details">${Html.escape(message)}</p>
        <button class="button button-primary" data-action="retry">Try again</button>
      </section>`;
  }

  handleClick(event) {
    const target = event.target.closest("button");
    if (!target) return;
    const { action } = target.dataset;
    if (target.dataset.questionId) return this.openQuestion(target.dataset.questionId);
    if (action === "toggle-theme") {
      this.theme.toggle();
      target.setAttribute("aria-label", `Switch to ${this.theme.nextMode} mode`);
      target.setAttribute("title", `Switch to ${this.theme.nextMode} mode`);
      target.innerHTML = `<span aria-hidden="true">${this.theme.mode === "dark" ? "☀" : "☾"}</span><span>${this.theme.nextMode} mode</span>`;
      return;
    }
    if (action === "start") {
      this.progress.start();
      return this.renderGame();
    }
    if (action === "review") return this.renderGame({ allowComplete: true });
    if (action === "home") return this.renderWelcome();
    if (action === "retry") return this.initialize();
    if (action === "close-question") return this.closeQuestion();
    if (action === "complete-question") {
      const response = this.readActiveResponse({ requireName: true });
      if (!response) return;
      this.progress.complete(this.activeQuestionId, response);
      this.closeQuestion();
      return this.renderGame();
    }
    if (action === "undo-question") {
      const response = this.readActiveResponse();
      this.progress.markIncomplete(this.activeQuestionId, response);
      this.closeQuestion();
      return this.renderGame();
    }
    if (action === "clear" && window.confirm("Clear all names, progress, and private notes for this event on this browser?")) {
      this.progress.clear();
      return this.renderWelcome();
    }
  }

  handleKeydown(event) {
    if (event.key === "Escape" && this.activeQuestionId) this.closeQuestion();
  }
}

new FamDinnerApp(document.querySelector("#app")).initialize();
