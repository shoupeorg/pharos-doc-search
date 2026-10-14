import DOMPurify from "dompurify";
import { Marked } from "marked";

const DOCS_BASE_URL = "https://docs.pharos.xyz/";
const form = document.querySelector("#search-form");
const questionInput = document.querySelector("#question");
const searchButton = document.querySelector("#search-button");
const resultPanel = document.querySelector(".result-panel");
const resultState = document.querySelector("#result-state");
const result = document.querySelector("#result");
const sources = document.querySelector("#sources");
const sourceList = document.querySelector("#source-list");
const systemStatus = document.querySelector("#system-status");
const endpointStatus = document.querySelector("#endpoint-status");

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

function safeUrl(value, officialOnly = false) {
  try {
    const url = new URL(value, DOCS_BASE_URL);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (officialOnly && (url.protocol !== "https:" || url.hostname !== "docs.pharos.xyz")) return null;
    return url.href;
  } catch {
    return null;
  }
}

const renderer = {
  html({ text }) {
    return escapeHtml(text);
  },
  link({ href, title, text, tokens }) {
    const safeHref = safeUrl(href);
    if (!safeHref) return escapeHtml(text || href);
    const label = tokens?.length ? this.parser.parseInline(tokens) : escapeHtml(text || safeHref);
    const safeTitle = title ? ` title="${escapeHtml(title)}"` : "";
    return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer"${safeTitle}>${label}</a>`;
  },
};

const marked = new Marked({ gfm: true, breaks: false, renderer });

function renderMarkdown(markdown) {
  const parsed = marked.parse(String(markdown ?? ""));
  const clean = DOMPurify.sanitize(parsed, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "input", "button"],
    FORBID_ATTR: ["style", "srcdoc"],
    ADD_ATTR: ["target", "rel"],
  });
  const container = document.createElement("div");
  container.innerHTML = clean;
  container.querySelectorAll("a").forEach((link) => {
    const href = safeUrl(link.getAttribute("href"));
    if (!href) {
      link.removeAttribute("href");
      link.removeAttribute("target");
      link.removeAttribute("rel");
      return;
    }
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  });
  return container.innerHTML;
}

function setState(state, message) {
  resultPanel.dataset.state = state;
  resultState.textContent = state.replace("_", " ").toUpperCase();
  systemStatus.textContent = `SYSTEM ${state === "success" ? "COMPLETE" : state.toUpperCase()}`;
  endpointStatus.textContent = message;
  resultPanel.setAttribute("aria-busy", state === "loading" ? "true" : "false");
}

function showSources(items) {
  sourceList.replaceChildren();
  for (const item of items) {
    const href = safeUrl(item.url, true);
    if (!href) continue;
    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = item.title;
    const li = document.createElement("li");
    li.append(link);
    sourceList.append(li);
  }
  sources.hidden = sourceList.childElementCount === 0;
  return sourceList.childElementCount;
}

async function search(question) {
  searchButton.disabled = true;
  questionInput.disabled = true;
  sources.hidden = true;
  result.className = "loading";
  result.innerHTML = "<strong>SEARCHING DEVELOPER DOCS MCP…</strong><p>Retrieving full official pages and a grounded answer from docs.pharos.xyz.</p>";
  setState("loading", "MCP REQUEST IN FLIGHT");
  try {
    const response = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
      signal: AbortSignal.timeout(70000),
    });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || `Request failed (${response.status})`), { kind: data.kind });
    if (data.status === "no_answer") {
      result.className = "no-answer";
      result.innerHTML = "<strong>NO GOOD ANSWER FOUND</strong><p>The retrieved Pharos documentation did not support an answer to this question.</p>";
      showSources([]);
      setState("no_answer", "DOCUMENTATION SUPPORT NOT FOUND");
      return;
    }
    result.className = "success";
    result.innerHTML = `<div class="answer-label">MCP SYNTHESIZED ANSWER · FULL PAGES VERIFIED</div><div class="answer">${renderMarkdown(data.answer)}</div>`;
    const sourceCount = showSources(data.sources);
    setState("success", `${sourceCount} VERIFIED OFFICIAL SOURCE${sourceCount === 1 ? "" : "S"}`);
  } catch (error) {
    const timedOut = error.name === "TimeoutError" || error.kind === "timeout";
    result.className = "error";
    result.innerHTML = `<strong>${timedOut ? "REQUEST TIMED OUT" : "CONNECTION ERROR"}</strong><p>${escapeHtml(error.message)}</p>`;
    showSources([]);
    setState("error", timedOut ? "MCP TIMEOUT" : "MCP CONNECTION FAILED");
  } finally {
    searchButton.disabled = false;
    questionInput.disabled = false;
    questionInput.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (question) search(question);
});

document.querySelectorAll("[data-question]").forEach((button) => {
  button.addEventListener("click", () => {
    questionInput.value = button.dataset.question;
    form.requestSubmit();
  });
});
