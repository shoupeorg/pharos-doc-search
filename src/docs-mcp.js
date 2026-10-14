import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export const DOCS_MCP_URL = "https://docs.pharos.xyz/~gitbook/mcp";
export const DOCS_BASE_URL = "https://docs.pharos.xyz/";
export const REQUIRED_TOOLS = ["searchDocumentation", "getPage", "askQuestion"];

const MAX_INITIAL_PAGES = 2;
const MAX_CITED_PAGES = 8;

export class DocsMcpError extends Error {
  constructor(kind, message, cause) {
    super(message, { cause });
    this.name = "DocsMcpError";
    this.kind = kind;
  }
}

export function normalizeQuestion(value) {
  const question = String(value ?? "").trim();
  if (!question) throw new DocsMcpError("invalid", "Please enter a documentation question.");
  if (question.length > 500) throw new DocsMcpError("invalid", "Questions must be 500 characters or fewer.");
  return question;
}

export function extractText(result) {
  return (result?.content ?? [])
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function toOfficialDocsUrl(value) {
  try {
    const url = new URL(value, DOCS_BASE_URL);
    if (url.protocol !== "https:" || url.hostname !== "docs.pharos.xyz") return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

export function extractSources(text) {
  const seen = new Set();
  const sources = [];
  for (const match of String(text ?? "").matchAll(/\[([^\]]+)]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)) {
    const url = toOfficialDocsUrl(match[2]);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    sources.push({ title: match[1], url });
  }
  return sources;
}

export function parseSearchResults(text) {
  const blocks = String(text ?? "").split(/(?=^Title:\s*)/gm);
  const results = [];
  const seen = new Set();
  for (const block of blocks) {
    const title = block.match(/^Title:\s*(.+)$/m)?.[1]?.trim();
    const rawUrl = block.match(/^Link:\s*(\S+)$/m)?.[1]?.trim();
    const url = toOfficialDocsUrl(rawUrl);
    if (!title || !url || seen.has(url)) continue;
    seen.add(url);
    results.push({ title, url, snippet: block.match(/^Content:\s*([\s\S]*)$/m)?.[1]?.trim() ?? "" });
  }
  return results;
}

export function buildSearchQuery(question) {
  const lower = question.toLowerCase();
  if (lower.includes("hardhat") && /deploy|contract|ignition/.test(lower)) {
    return `${question} Write Your First Token Ignition hardhat.config example repository`;
  }
  if (/mainnet|pacific/.test(lower) && /setting|network|rpc|chain/.test(lower)) {
    return `${question} Pacific Mainnet chain ID RPC explorer`;
  }
  return `${question} official guide configuration example`;
}

export function rankSearchResults(results, question) {
  const lower = question.toLowerCase();
  return results
    .map((result, index) => {
      const haystack = `${result.title} ${result.url} ${result.snippet}`.toLowerCase();
      let score = -index;
      for (const term of lower.match(/[a-z0-9]+/g) ?? []) {
        if (term.length >= 4 && haystack.includes(term)) score += 2;
      }
      if (lower.includes("hardhat") && result.url.includes("/developer-guide/hardhat/")) score += 12;
      if (lower.includes("hardhat") && /validator|foundry/.test(result.url)) score -= 20;
      if (/deploy|contract/.test(lower) && /deploy the contract|hardhat ignition/.test(haystack)) score += 7;
      if (lower.includes("hardhat") && result.url.endsWith("/write-your-first-token")) score += 4;
      if (/mainnet|pacific/.test(lower) && result.url.endsWith("/pacific-mainnet")) score += 15;
      return { ...result, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ score: _score, ...result }) => result);
}

export function stripSourcesSection(text) {
  return String(text ?? "").replace(/\n#{1,6}\s+Sources\s*\n[\s\S]*$/i, "").trim();
}

export function classifyAnswer(question, text, sources = extractSources(text)) {
  const answer = stripSourcesSection(text);
  if (!answer || /^no good answer found\.?/i.test(answer)) {
    return { status: "no_answer", question, answer: "No good answer found.", sources: [] };
  }
  return { status: "success", question, answer, sources };
}

function withTimeout(promise, timeoutMs) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new DocsMcpError("timeout", `Developer Docs MCP timed out after ${timeoutMs / 1000} seconds.`)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function callTextTool(client, name, args, timeoutMs) {
  const result = await withTimeout(client.callTool({ name, arguments: args }), timeoutMs);
  if (result?.isError) throw new DocsMcpError("connection", extractText(result) || `Developer Docs MCP ${name} failed.`);
  return extractText(result);
}

async function retrievePage(client, source, timeoutMs) {
  const content = await callTextTool(client, "getPage", { url: source.url }, timeoutMs);
  if (!content) throw new DocsMcpError("connection", `Developer Docs MCP returned an empty page for ${source.url}`);
  return { ...source, content };
}

function answerGoal(pages, question) {
  const pageList = pages.map((page) => `- ${page.url}`).join("\n") || "- None";
  const hardhatRequirements = question.toLowerCase().includes("hardhat")
    ? "For Hardhat deployment, use one example only. State prerequisites, repo/directory, known version/config syntax, network/RPC, key setup, dependencies, compile command, Ignition path and selected network. Flag missing version details or confusing step order; do not mix examples."
    : "";
  const networkRequirements = /mainnet|pacific/i.test(question)
    ? "For network settings, include the documented network name, chain ID, currency, RPC and explorer."
    : "";
  return [
    "Answer in concise Markdown using only the complete Pharos pages retrieved with getPage below.",
    "Preserve commands/config exactly. Do not fill missing details from memory or claim independent testing. State uncertainties.",
    "Link only to these pages. If unsupported, say exactly: No good answer found.",
    hardhatRequirements,
    networkRequirements,
    "Retrieved full pages:",
    pageList,
  ].filter(Boolean).join("\n");
}

export async function askDocs(questionInput, { timeoutMs = 60000 } = {}) {
  const question = normalizeQuestion(questionInput);
  const client = new Client({ name: "pharos-doc-search", version: "1.1.0" });
  try {
    await withTimeout(client.connect(new StreamableHTTPClientTransport(new URL(DOCS_MCP_URL))), timeoutMs);

    const available = (await withTimeout(client.listTools(), timeoutMs)).tools.map((tool) => tool.name);
    const missing = REQUIRED_TOOLS.filter((tool) => !available.includes(tool));
    if (missing.length) throw new DocsMcpError("connection", `Developer Docs MCP is missing required tools: ${missing.join(", ")}`);

    const searchText = await callTextTool(client, "searchDocumentation", { query: buildSearchQuery(question) }, timeoutMs);
    const candidates = rankSearchResults(parseSearchResults(searchText), question).slice(0, MAX_INITIAL_PAGES);
    const pages = [];
    for (const candidate of candidates) pages.push(await retrievePage(client, candidate, timeoutMs));

    const answerText = await callTextTool(client, "askQuestion", { question, goal: answerGoal(pages, question) }, timeoutMs);
    const provisional = classifyAnswer(question, answerText);
    if (provisional.status === "no_answer") return provisional;

    const verified = new Map(pages.map((page) => [page.url, page]));
    // GitBook may append a broad "Sources" recommendation list to askQuestion.
    // Ground the UI in links actually cited in the answer body, not that appendix.
    const cited = extractSources(stripSourcesSection(answerText)).slice(0, MAX_CITED_PAGES);
    for (const source of cited) {
      if (!verified.has(source.url)) verified.set(source.url, await retrievePage(client, source, timeoutMs));
    }

    const sources = cited
      .filter((source) => verified.has(source.url))
      .map((source) => ({ title: source.title, url: source.url }));
    if (!sources.length) {
      return { status: "no_answer", question, answer: "No good answer found.", sources: [] };
    }
    return classifyAnswer(question, answerText, sources);
  } catch (error) {
    if (error instanceof DocsMcpError) throw error;
    throw new DocsMcpError("connection", `Developer Docs MCP connection failed: ${error?.message || "unknown error"}`, error);
  } finally {
    await client.close().catch(() => {});
  }
}
