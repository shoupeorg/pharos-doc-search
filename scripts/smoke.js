import { askDocs } from "../src/docs-mcp.js";

const result = await askDocs("What is the Pharos Pacific Mainnet chain ID?", { verifyTools: true });
if (result.status !== "success" || !result.answer.includes("1672") || result.sources.length === 0) {
  throw new Error("Live Developer Docs MCP smoke test returned an unexpected answer.");
}
console.log(JSON.stringify(result, null, 2));
