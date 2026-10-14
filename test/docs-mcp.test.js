import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSearchQuery,
  classifyAnswer,
  extractSources,
  normalizeQuestion,
  parseSearchResults,
  rankSearchResults,
  stripSourcesSection,
  toOfficialDocsUrl,
} from "../src/docs-mcp.js";

test("extracts unique official documentation sources", () => {
  const answer = "See [Network](/getting-started/network) and [Network again](https://docs.pharos.xyz/getting-started/network).";
  assert.deepEqual(extractSources(answer), [{ title: "Network", url: "https://docs.pharos.xyz/getting-started/network" }]);
});

test("rejects non-Pharos sources and unsafe URL protocols", () => {
  assert.equal(toOfficialDocsUrl("javascript:alert(1)"), null);
  assert.equal(toOfficialDocsUrl("https://example.com/docs"), null);
});

test("parses and ranks full-page candidates for a coherent Hardhat example", () => {
  const search = [
    "Title: Validator Node Deployment\nLink: https://docs.pharos.xyz/node-and-validator-guide/validator-node-deployment\nContent: Deploy a node.",
    "Title: Write Your First Token\nLink: https://docs.pharos.xyz/developer-guide/hardhat/write-your-first-token\nContent: Deploy the Contract with hardhat ignition.",
  ].join("\n");
  const ranked = rankSearchResults(parseSearchResults(search), "How do I deploy a contract with Hardhat on Pharos?");
  assert.equal(ranked[0].title, "Write Your First Token");
  assert.match(buildSearchQuery("How do I deploy a contract with Hardhat on Pharos?"), /Ignition hardhat\.config/);
});

test("removes the duplicate MCP sources appendix from the displayed answer", () => {
  assert.equal(stripSourcesSection("Answer.\n\n# Sources\n- [Page](/page)"), "Answer.");
});

test("classifies the explicit unsupported response", () => {
  assert.equal(classifyAnswer("weather?", "No good answer found.").status, "no_answer");
});

test("rejects empty and oversized questions", () => {
  assert.throws(() => normalizeQuestion("   "), /Please enter/);
  assert.throws(() => normalizeQuestion("x".repeat(501)), /500 characters/);
});
