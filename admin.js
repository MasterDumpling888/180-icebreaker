const EVENT_URL = "./event.json";

class Html {
  static escape(value = "") {
    return String(value).replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[character]));
  }
}

class AdminApi {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = sessionStorage.getItem("180-famdinner:admin-token") ?? "";
  }

  async request(path, options = {}) {
    if (this.baseUrl.includes("YOUR-SUBDOMAIN")) throw new Error("Set responseCollection.apiBaseUrl in event.json after deploying the Worker.");
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...options.headers
      }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && path !== "/v1/admin/session") this.logout();
      throw new Error(body.error ?? "The results service could not complete the request.");
    }
    return body;
  }

  async login(passcode) {
    const body = await this.request("/v1/admin/session", { method: "POST", body: JSON.stringify({ passcode }) });
    this.token = body.token;
    sessionStorage.setItem("180-famdinner:admin-token", body.token);
  }

  logout() {
    this.token = "";
    sessionStorage.removeItem("180-famdinner:admin-token");
  }
}

class AnswerVisualizer {
  static aggregate(responses) {
    const groups = new Map();
    for (const item of responses.filter(response => response.status === "approved")) {
      const display = item.response.trim().replace(/\s+/g, " ");
      const key = display.normalize("NFKC").toLocaleLowerCase("en-PH");
      const group = groups.get(key) ?? { text: display, count: 0 };
      group.count += 1;
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
  }

  static downloadPng(question, groups) {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 900;
    const context = canvas.getContext("2d");
    context.fillStyle = "#3166a8";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.font = "700 64px 'Titillium Web', sans-serif";
    this.wrapText(context, question, 800, 95, 1400, 72);
    const max = Math.max(...groups.map(group => group.count), 1);
    let x = 120;
    let y = 300;
    let rowHeight = 0;
    for (const group of groups) {
      const fontSize = 30 + (group.count / max) * 42;
      context.font = `600 ${fontSize}px 'Titillium Web', sans-serif`;
      const phrase = group.text.length > 42 ? `${group.text.slice(0, 41)}…` : group.text;
      const label = `${phrase}${group.count > 1 ? ` ×${group.count}` : ""}`;
      const width = Math.min(context.measureText(label).width + 70, 1360);
      const height = fontSize + 42;
      if (x + width > 1480) { x = 120; y += rowHeight + 32; rowHeight = 0; }
      if (y + height > 810) break;
      context.fillStyle = "#162f50";
      context.beginPath();
      context.roundRect(x, y, width, height, height / 2);
      context.fill();
      context.fillStyle = "#ffffff";
      context.textAlign = "left";
      context.fillText(label, x + 35, y + height - 27);
      x += width + 28;
      rowHeight = Math.max(rowHeight, height);
    }
    const link = document.createElement("a");
    link.download = `180-results-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  static wrapText(context, text, x, y, maxWidth, lineHeight) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = "";
    for (const word of words) {
      const test = `${line} ${word}`.trim();
      if (context.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test;
    }
    lines.push(line);
    lines.slice(0, 2).forEach((value, index) => context.fillText(value, x, y + (index * lineHeight)));
  }
}

class ResultsDashboard {
  constructor(root) {
    this.root = root;
    this.config = null;
    this.api = null;
    this.responses = [];
    this.activePresentation = null;
    document.addEventListener("click", event => this.handleClick(event));
    document.addEventListener("submit", event => this.handleSubmit(event));
  }

  async initialize() {
    try {
      const response = await fetch(EVENT_URL, { cache: "no-store" });
      this.config = await response.json();
      this.api = new AdminApi(this.config.event.responseCollection.apiBaseUrl);
      if (this.api.token) {
        try { await this.loadDashboard(); } catch (error) {
          if (!this.api.token) this.renderLogin("Your officer session expired. Please enter the passcode again.");
          else throw error;
        }
      } else this.renderLogin();
    } catch (error) {
      this.renderError(error.message);
    }
  }

  renderLogin(message = "") {
    this.root.innerHTML = `<section class="panel login-card">
      <p class="eyebrow">Officer access</p>
      <h1>Event results</h1>
      <p class="lede">Enter the shared officer passcode. No attendee or officer account is created.</p>
      <form data-form="login">
        <label for="admin-passcode">Officer passcode</label>
        <input id="admin-passcode" name="passcode" type="password" required autocomplete="current-password">
        <button class="button button-primary" type="submit">Open results</button>
      </form>
      ${message ? `<p class="admin-message" role="alert">${Html.escape(message)}</p>` : ""}
    </section>`;
  }

  async loadDashboard() {
    const data = await this.api.request("/v1/admin/responses");
    this.responses = data.responses;
    this.renderDashboard();
  }

  renderDashboard(message = "") {
    const counts = this.responses.reduce((result, response) => ({ ...result, [response.status]: (result[response.status] ?? 0) + 1 }), {});
    this.root.innerHTML = `<section class="panel admin-panel">
      <header class="admin-header">
        <div><p class="eyebrow">${Html.escape(this.config.event.title)}</p><h1>Attendee results</h1><p>${Html.escape(this.config.event.topic)} · responses expire ${new Date(this.config.event.responseCollection.expiresAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</p></div>
        <div class="dashboard-actions">
          <button class="button button-secondary" data-action="refresh">Refresh</button>
          <button class="button button-secondary" data-action="approve-all">Approve all pending</button>
          <button class="button button-quiet" data-action="logout">Log out</button>
          <button class="button button-quiet danger-link" data-action="delete-all">Delete event responses</button>
        </div>
      </header>
      <div class="summary-grid">
        <div class="summary-card"><strong>${counts.pending ?? 0}</strong><span>Pending review</span></div>
        <div class="summary-card"><strong>${counts.approved ?? 0}</strong><span>Approved</span></div>
        <div class="summary-card"><strong>${counts.hidden ?? 0}</strong><span>Hidden</span></div>
      </div>
      ${message ? `<p class="admin-message is-success" role="status">${Html.escape(message)}</p>` : ""}
      <div class="results-list">${this.config.questions.filter(question => question.active).map(question => this.renderQuestion(question)).join("")}</div>
    </section>`;
  }

  renderQuestion(question) {
    const responses = this.responses.filter(response => response.questionId === question.id);
    const approved = responses.filter(response => response.status === "approved").length;
    return `<section class="question-results">
      <h2>${Html.escape(question.text)}</h2>
      <p class="question-meta">${responses.length} submitted · ${approved} approved</p>
      <div class="question-actions">
        <button class="button button-secondary" data-action="approve-question" data-question-id="${Html.escape(question.id)}" ${responses.some(item => item.status === "pending") ? "" : "disabled"}>Approve pending</button>
        <button class="button button-primary" data-action="present" data-question-id="${Html.escape(question.id)}" ${approved ? "" : "disabled"}>Present word visual</button>
      </div>
      ${responses.length ? `<ul class="response-list">${responses.map(response => `<li class="response-item">
        <div><p class="response-copy">${Html.escape(response.response)}</p><span class="response-status">${Html.escape(response.status)}</span></div>
        <div class="response-controls">
          ${response.status !== "approved" ? `<button class="button button-secondary" data-action="moderate" data-id="${response.id}" data-status="approved">Approve</button>` : ""}
          ${response.status !== "hidden" ? `<button class="button button-quiet" data-action="moderate" data-id="${response.id}" data-status="hidden">Hide</button>` : ""}
        </div>
      </li>`).join("")}</ul>` : `<p class="empty-results">No responses yet.</p>`}
    </section>`;
  }

  renderPresentation(questionId) {
    const question = this.config.questions.find(item => item.id === questionId);
    const groups = AnswerVisualizer.aggregate(this.responses.filter(response => response.questionId === questionId));
    this.activePresentation = { question, groups };
    document.body.insertAdjacentHTML("beforeend", `<section class="presentation" data-presentation role="dialog" aria-modal="true" aria-labelledby="presentation-title">
      <header class="presentation-header"><p class="eyebrow">180 FamDinner</p><h1 id="presentation-title">${Html.escape(question.text)}</h1><p>${groups.reduce((sum, group) => sum + group.count, 0)} approved responses</p></header>
      <div class="bubble-cloud">${groups.map(group => `<span class="answer-bubble" style="--weight:${group.count}">${Html.escape(group.text)}${group.count > 1 ? `<small>×${group.count}</small>` : ""}</span>`).join("")}</div>
      <div class="presentation-actions"><button class="button button-primary" data-action="download">Download PNG</button><button class="button button-secondary" data-action="fullscreen">Full screen</button><button class="button button-quiet" data-action="close-presentation">Back to dashboard</button></div>
    </section>`);
  }

  renderError(message) {
    this.root.innerHTML = `<section class="panel login-card"><p class="eyebrow">Results unavailable</p><h1>Something went wrong.</h1><p class="admin-message">${Html.escape(message)}</p><button class="button button-primary" data-action="retry">Try again</button></section>`;
  }

  async handleSubmit(event) {
    if (event.target.dataset.form !== "login") return;
    event.preventDefault();
    const button = event.target.querySelector("button");
    button.disabled = true;
    try { await this.api.login(new FormData(event.target).get("passcode")); await this.loadDashboard(); }
    catch (error) { this.renderLogin(error.message); }
  }

  async handleClick(event) {
    const button = event.target.closest("button");
    if (!button) return;
    const { action } = button.dataset;
    try {
      if (action === "retry") return this.initialize();
      if (action === "logout") { this.api.logout(); return this.renderLogin(); }
      if (action === "refresh") return this.loadDashboard();
      if (action === "moderate") {
        await this.api.request(`/v1/admin/responses/${button.dataset.id}`, { method: "PATCH", body: JSON.stringify({ status: button.dataset.status }) });
        return this.loadDashboard();
      }
      if (action === "approve-all" || action === "approve-question") {
        await this.api.request("/v1/admin/responses/approve", { method: "POST", body: JSON.stringify({ questionId: button.dataset.questionId || undefined }) });
        return this.loadDashboard();
      }
      if (action === "delete-all") {
        if (!confirm(`Permanently delete all live responses for ${this.config.event.title}?`)) return;
        await this.api.request(`/v1/admin/events/${this.config.event.id}/responses`, { method: "DELETE" });
        await this.loadDashboard();
        return this.renderDashboard("All live event responses were deleted.");
      }
      if (action === "present") return this.renderPresentation(button.dataset.questionId);
      if (action === "download") return AnswerVisualizer.downloadPng(this.activePresentation.question.text, this.activePresentation.groups);
      if (action === "fullscreen") return document.querySelector("[data-presentation]")?.requestFullscreen?.();
      if (action === "close-presentation") { if (document.fullscreenElement) await document.exitFullscreen(); document.querySelector("[data-presentation]")?.remove(); this.activePresentation = null; }
    } catch (error) {
      if (!this.api.token) this.renderLogin(error.message); else this.renderError(error.message);
    }
  }
}

new ResultsDashboard(document.querySelector("#admin-app")).initialize();
