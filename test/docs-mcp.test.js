import test from "node:test";
import assert from "node:assert/strict";
import { classifyAnswer, extractSources, normalizeQuestion } from "../src/docs-mcp.js";

test("extracts unique official documentation sources", () => {
  const answer = "See [Network](https://docs.pharos.xyz/getting-started/network) and [Network again](https://docs.pharos.xyz/getting-started/network).";
  assert.deepEqual(extractSources(answer), [{ title: "Network", url: "https://docs.pharos.xyz/getting-started/network" }]);
});

test("classifies the explicit unsupported response", () => {
  assert.equal(classifyAnswer("weather?", "No good answer found.").status, "no_answer");
});

test("rejects empty and oversized questions", () => {
  assert.throws(() => normalizeQuestion("   "), /Please enter/);
  assert.throws(() => normalizeQuestion("x".repeat(501)), /500 characters/);
});
