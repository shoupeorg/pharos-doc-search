#!/usr/bin/env node
import { askDocs, DocsMcpError } from "../src/docs-mcp.js";

const question = process.argv.slice(2).join(" ").trim();
if (!question) {
  console.error('Usage: pharos-docs "how do I deploy a contract?"');
  process.exitCode = 1;
} else {
  try {
    const result = await askDocs(question);
    if (result.status === "no_answer") {
      console.log("No good answer found.");
    } else {
      console.log(result.answer);
    }
  } catch (error) {
    const label = error instanceof DocsMcpError && error.kind === "timeout" ? "Timeout" : "Connection error";
    console.error(`${label}: ${error.message}`);
    process.exitCode = 1;
  }
}
