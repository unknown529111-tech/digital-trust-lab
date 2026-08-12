/* CoThink server — thin HTTP layer over the decision engine + provider.
 *
 * Security posture:
 *   - Static files from ./public only; no directory traversal (path guard).
 *   - Input caps everywhere (task length, thread id shape).
 *   - No secrets in responses; API key lives in the environment.
 *   - CORS disabled: same-origin only. No cookies, no sessions, no tracking.
 *   - In-memory threads only (no persistence) — the interaction log is
 *     exported by the client; nothing is stored server-side by design.
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { requestSuggestion } = require("./lib/openrouter.cjs");
const { newThread, createSuggestion, decide, summary } = require("./lib/decision-engine.cjs");

const PORT = Number(process.env.PORT) || 4175;
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_TASK = 2000;
const MAX_THREAD_ID = 64;
const THREAD_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

const threads = new Map(); // threadId -> thread (server-session only; client keeps its own copy)

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

function readBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function serveStatic(req, res) {
  let p = req.url.split("?")[0];
  if (p === "/") p = "/index.html";
  // Path guard: resolve and verify containment (no ../ escapes).
  const resolved = path.resolve(PUBLIC_DIR, "." + p);
  if (!resolved.startsWith(PUBLIC_DIR + path.sep) && resolved !== path.join(PUBLIC_DIR, "index.html")) {
    send(res, 403, { error: "forbidden" });
    return;
  }
  fs.readFile(resolved, (err, data) => {
    if (err) { send(res, 404, { error: "not found" }); return; }
    const type = STATIC_TYPES[path.extname(resolved)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "X-Content-Type-Options": "nosniff" });
    res.end(data);
  });
}

function createServer(deps = {}) {
  const provider = deps.provider || requestSuggestion;
  const engine = deps.decisionEngine || { newThread, createSuggestion, decide, summary };

  return http.createServer(async (req, res) => {
    // SPA fallback is unnecessary (single page); unknown paths 404.
    if (req.method === "GET" && req.url === "/api/health") {
      return send(res, 200, { ok: true, hasProvider: Boolean(process.env.OPENROUTER_API_KEY) });
    }

    if (req.method === "POST" && req.url === "/api/suggest") {
      let body;
      try { body = JSON.parse(await readBody(req)); }
      catch { return send(res, 400, { error: "invalid JSON body" }); }

      const task = typeof body.task === "string" ? body.task.trim() : "";
      const threadId = typeof body.threadId === "string" ? body.threadId : "";
      if (!task) return send(res, 400, { error: "task is required" });
      if (task.length > MAX_TASK) return send(res, 400, { error: `task exceeds ${MAX_TASK} characters` });
      if (!THREAD_ID_RE.test(threadId) || threadId.length > MAX_THREAD_ID) {
        return send(res, 400, { error: "invalid thread id" });
      }

      let thread = threads.get(threadId);
      if (!thread) { thread = engine.newThread({ threadId }); threads.set(threadId, thread); }

      let suggestion;
      try {
        const proposal = await provider({ task, model: body.model });
        suggestion = engine.createSuggestion(thread, {
          text: proposal.text,
          model: proposal.model,
          uncertainty: proposal.uncertainty,
          uncertaintyNote: proposal.uncertaintyNote,
          finishReason: proposal.finishReason,
          source: proposal.source,
        });
      } catch (e) {
        const status = e.code === "PROVIDER_UNREACHABLE" ? 502 : 502;
        return send(res, status, { error: e.message, code: e.code || "PROVIDER_ERROR" });
      }

      return send(res, 201, {
        suggestion,
        thread: summary(thread),
        hasProvider: Boolean(process.env.OPENROUTER_API_KEY),
      });
    }

    if (req.method === "POST" && req.url === "/api/decide") {
      let body;
      try { body = JSON.parse(await readBody(req)); }
      catch { return send(res, 400, { error: "invalid JSON body" }); }
      const { threadId, suggestionId, decision, reason, actor } = body;
      const thread = threads.get(String(threadId || ""));
      if (!thread) return send(res, 404, { error: "thread not found" });
      try {
        engine.decide(thread, String(suggestionId || ""), decision, { actor, reason });
      } catch (e) {
        return send(res, 400, { error: e.message });
      }
      return send(res, 200, { ok: true, thread: summary(thread) });
    }

    if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res);
    return send(res, 405, { error: "method not allowed" });
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, () => {
    console.log(`CoThink running at http://localhost:${PORT} (provider ${process.env.OPENROUTER_API_KEY ? "configured" : "DEMO MODE"})`);
  });
}

module.exports = { createServer, threads }; // threads exported for tests