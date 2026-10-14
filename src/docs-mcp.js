import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export const DOCS_MCP_URL = "https://docs.pharos.xyz/~gitbook/mcp";
export const ANSWER_TOOL = "askQuestion";
export const REQUIRED_TOOLS = ["searchDocumentation", "getPage", "askQuestion"];

const ANSWER_GOAL =
  "Give a concise answer supported only by docs.pharos.xyz. Include relevant source links or section references. " +
  "If the documentation does not support an answer, say exactly: No good answer found.";

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

export function extractSources(text) {
  const seen = new Set();
  const sources = [];
  for (const match of text.matchAll(/\[([^\]]+)]\((https:\/\/docs\.pharos\.xyz\/[^)]+)\)/g)) {
    if (seen.has(match[2])) continue;
    seen.add(match[2]);
    sources.push({ title: match[1], url: match[2] });
  }
  return sources;
}

export function classifyAnswer(question, text) {
  if (!text || /^no good answer found\.?$/i.test(text.trim())) {
    return { status: "no_answer", question, answer: "No good answer found.", sources: [] };
  }
  return { status: "success", question, answer: text, sources: extractSources(text) };
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

export async function askDocs(questionInput, { timeoutMs = 60000, verifyTools = false } = {}) {
  const question = normalizeQuestion(questionInput);
  const client = new Client({ name: "pharos-doc-search", version: "1.0.0" });
  try {
    await withTimeout(
      client.connect(new StreamableHTTPClientTransport(new URL(DOCS_MCP_URL))),
      timeoutMs,
    );
    if (verifyTools) {
      const available = (await withTimeout(client.listTools(), timeoutMs)).tools.map((tool) => tool.name);
      const missing = REQUIRED_TOOLS.filter((tool) => !available.includes(tool));
      if (missing.length) throw new DocsMcpError("connection", `Developer Docs MCP is missing required tools: ${missing.join(", ")}`);
    }
    const result = await withTimeout(
      client.callTool({ name: ANSWER_TOOL, arguments: { question, goal: ANSWER_GOAL } }),
      timeoutMs,
    );
    if (result?.isError) throw new DocsMcpError("connection", extractText(result) || "Developer Docs MCP returned an error.");
    return classifyAnswer(question, extractText(result));
  } catch (error) {
    if (error instanceof DocsMcpError) throw error;
    throw new DocsMcpError("connection", `Developer Docs MCP connection failed: ${error?.message || "unknown error"}`, error);
  } finally {
    await client.close().catch(() => {});
  }
}
