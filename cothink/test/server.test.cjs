const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const { createServer, threads } = require("../server.cjs");
const { requestSuggestion, DEMO_SUGGESTION_TEXT } = require("../lib/openrouter.cjs");

// Deterministic CI: never depend on a real provider key.
process.env.OPENROUTER_API_KEY = "";

const stubProvider = async ({ task }) => ({
  text: `Draft for: ${task}`,
  model: "stub-model",
  uncertainty: 0.4,
  uncertaintyNote: "stub provider note",
  finishReason: "stop",
  source: "stub",
});

const failingProvider = async () => {
  const e = new Error("provider unreachable");
  e.code = "PROVIDER_UNREACHABLE";
  throw e;
};

function withServer(provider, fn) {
  return new Promise((resolve, reject) => {
    const server = createServer({ provider: provider || stubProvider });
    server.listen(0, "127.0.0.1", async () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      try {
        await fn(base);
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        server.close();
      }
    });
  });
}

const post = (base, path, body) =>
  fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("health reports demo mode without a provider key", async () => {
  await withServer(null, async (base) => {
    const r = await fetch(base + "/api/health");
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.equal(j.hasProvider, false);
  });
});

test("suggest returns a verified suggestion with provenance (evidence-in-the-loop)", async () => {
  await withServer(null, async (base) => {
    const r = await post(base, "/api/suggest", { task: "Explain privacy by design", threadId: "thread-1" });
    assert.equal(r.status, 201);
    const j = await r.json();
    assert.equal(j.suggestion.status, "pending");
    assert.equal(j.suggestion.model, "stub-model");
    assert.equal(j.suggestion.uncertainty, 0.4);
    assert.match(j.suggestion.text, /privacy by design/);
    // The evidence layer is non-optional: every suggestion carries claims + verdicts.
    assert.ok(j.suggestion.verification.claims.length >= 1);
    assert.ok(["passed", "partial", "failed"].includes(j.suggestion.verification.status));
    assert.equal(j.thread.total, 1);
  });
});

test("DEMO SCENARIO: confident-but-wrong answer fails verification (1✓ 1◐ 1✗ + conflict)", async () => {
  await withServer(requestSuggestion, async (base) => {
    const r = await post(base, "/api/suggest", { task: "Tell me about the digital literacy program", threadId: "demo-thread" });
    assert.equal(r.status, 201);
    const j = await r.json();
    assert.equal(j.suggestion.text, DEMO_SUGGESTION_TEXT);
    assert.equal(j.suggestion.uncertainty, 0.91); // the model is confident…
    assert.equal(j.suggestion.verification.status, "failed"); // …and wrong
    assert.equal(j.suggestion.verification.conflicts, true);
    assert.deepEqual(j.suggestion.verification.counts, { supported: 1, partial: 1, unsupported: 1, contradicted: 0 });
    assert.equal(j.suggestion.verification.claims.length, 3);
    assert.ok(j.suggestion.verification.claims[2].evidence.some((e) => e.contradicts));
  });
});

test("a suggestion can be re-verified with another model while pending", async () => {
  await withServer(requestSuggestion, async (base) => {
    const created = await (await post(base, "/api/suggest", { task: "demo", threadId: "verify-thread" })).json();
    const id = created.suggestion.id;
    const r = await post(base, "/api/verify", { threadId: "verify-thread", suggestionId: id });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.equal(j.suggestion.id, id);
    assert.ok(j.suggestion.verification.claims.length === 3);
    const verifiedEvents = created.thread.logLength; // count grows with the reverified event
    assert.ok(j.thread.logLength >= verifiedEvents);
    // Decided suggestions cannot be re-verified
    await post(base, "/api/decide", { threadId: "verify-thread", suggestionId: id, decision: "approved", actor: "human" });
    const denied = await post(base, "/api/verify", { threadId: "verify-thread", suggestionId: id });
    assert.equal(denied.status, 400);
  });
});

test("missing / oversized / bad-shaped inputs are rejected", async () => {
  await withServer(null, async (base) => {
    assert.equal((await post(base, "/api/suggest", { threadId: "t" })).status, 400);
    assert.equal((await post(base, "/api/suggest", { task: "x", threadId: "../escape" })).status, 400);
    assert.equal((await post(base, "/api/suggest", { task: "x".repeat(2001), threadId: "t" })).status, 400);
    const bad = await fetch(base + "/api/suggest", { method: "POST", body: "{not json" });
    assert.equal(bad.status, 400);
  });
});

test("human decision flow: approve and reject paths, veto reason enforced", async () => {
  await withServer(null, async (base) => {
    const created = await (await post(base, "/api/suggest", { task: "Draft a caption", threadId: "thread-2" })).json();
    const id = created.suggestion.id;

    // Non-human actor refused
    const ai = await post(base, "/api/decide", { threadId: "thread-2", suggestionId: id, decision: "approved", actor: "ai" });
    assert.equal(ai.status, 400);

    // Reject without a reason refused
    const noreason = await post(base, "/api/decide", { threadId: "thread-2", suggestionId: id, decision: "rejected", reason: "no", actor: "human" });
    assert.equal(noreason.status, 400);

    // Legit reject
    const rejected = await post(base, "/api/decide", { threadId: "thread-2", suggestionId: id, decision: "rejected", reason: "factually unsupported", actor: "human" });
    assert.equal(rejected.status, 200);
    assert.equal((await rejected.json()).thread.rejected, 1);

    // Re-deciding the same suggestion refused
    const again = await post(base, "/api/decide", { threadId: "thread-2", suggestionId: id, decision: "approved", actor: "human" });
    assert.equal(again.status, 400);
  });
});

test("approval path marks suggestion approved", async () => {
  await withServer(null, async (base) => {
    const created = await (await post(base, "/api/suggest", { task: "Plan a workshop", threadId: "thread-3" })).json();
    const approve = await post(base, "/api/decide", { threadId: "thread-3", suggestionId: created.suggestion.id, decision: "approved", actor: "human" });
    assert.equal(approve.status, 200);
    assert.equal((await approve.json()).thread.approved, 1);
  });
});

test("provider failures surface as 502, not crashes", async () => {
  await withServer(failingProvider, async (base) => {
    const r = await post(base, "/api/suggest", { task: "anything", threadId: "thread-4" });
    assert.equal(r.status, 502);
    const j = await r.json();
    assert.equal(j.code, "PROVIDER_UNREACHABLE");
    // Server still healthy afterwards
    assert.equal((await fetch(base + "/api/health")).status, 200);
  });
});

test("static serving: index, content types, path traversal blocked, 404s", async () => {
  await withServer(null, async (base) => {
    const index = await fetch(base + "/");
    assert.equal(index.status, 200);
    assert.match(index.headers.get("content-type"), /text\/html/);
    assert.ok((await index.text()).includes("VeriLoop"));

    const css = await fetch(base + "/css/cothink.css");
    assert.equal(css.status, 200);

    const missing = await fetch(base + "/nope.png");
    assert.equal(missing.status, 404);
  });
});

test("raw traversal attempts hit the path guard (403), never serve files", async () => {
  const rawRequest = (base, rawPath) =>
    new Promise((resolve) => {
      const { port, hostname } = new URL(base);
      const sock = net.connect(port, hostname, () => {
        sock.write(`GET ${rawPath} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`);
      });
      let data = "";
      sock.on("data", (c) => (data += c));
      sock.on("end", () => resolve(data));
      sock.on("error", () => resolve(""));
    });

  await withServer(null, async (base) => {
    for (const attack of ["/../server.cjs", "/..%2fserver.cjs", "/%2e%2e/server.cjs"]) {
      const raw = await rawRequest(base, attack);
      const statusLine = raw.split("\r\n")[0] || "no response";
      assert.match(statusLine, /403|400|404/, `attack ${attack} must be refused, got ${statusLine}`);
      assert.ok(!raw.includes("module.exports"), `attack ${attack} must not leak server code`);
    }
  });
});

test("threads map is exported for inspection (in-memory only)", () => {
  assert.ok(threads instanceof Map);
});