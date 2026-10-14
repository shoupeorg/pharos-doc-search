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

function renderText(text) {
  return escapeHtml(text)
    .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/^# Sources[\s\S]*$/m, "")
    .replace(/\n/g, "<br>");
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
    const link = document.createElement("a");
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = item.title;
    const li = document.createElement("li");
    li.append(link);
    sourceList.append(li);
  }
  sources.hidden = items.length === 0;
}

async function search(question) {
  searchButton.disabled = true;
  questionInput.disabled = true;
  sources.hidden = true;
  result.className = "loading";
  result.innerHTML = "<strong>SEARCHING DEVELOPER DOCS MCP…</strong><p>Retrieving a grounded answer from docs.pharos.xyz.</p>";
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
    result.innerHTML = `<div class="answer-label">MCP SYNTHESIZED ANSWER</div><div class="answer">${renderText(data.answer)}</div>`;
    showSources(data.sources);
    setState("success", `${data.sources.length} OFFICIAL SOURCE${data.sources.length === 1 ? "" : "S"}`);
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
