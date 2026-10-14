import { askDocs, DocsMcpError } from "./docs-mcp.js";

const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/search") {
      if (request.method !== "POST") return json({ status: "error", kind: "invalid", error: "Method not allowed" }, 405);
      try {
        const body = await request.json();
        return json(await askDocs(body?.question));
      } catch (error) {
        const kind = error instanceof DocsMcpError ? error.kind : "connection";
        const status = kind === "invalid" ? 400 : kind === "timeout" ? 504 : 502;
        return json({ status: "error", kind, error: error?.message || "Developer Docs MCP request failed." }, status);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
