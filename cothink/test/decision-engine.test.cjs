const test = require("node:test");
const assert = require("node:assert/strict");
const {
  newThread, createSuggestion, decide, appliedText, summary, flagBias, MIN_VETO_REASON,
} = require("../lib/decision-engine.cjs");

test("human approval is required — engine refuses non-human actors", () => {
  const t = newThread();
  const s = createSuggestion(t, { text: "Draft text", model: "m" });
  assert.throws(() => decide(t, s.id, "approved", { actor: "ai" }), /only a human may decide/i);
  assert.equal(s.status, "pending");
});

test("nothing is applied before an explicit human decision", () => {
  const t = newThread();
  createSuggestion(t, { text: "suggestion one", model: "m" });
  assert.equal(appliedText(t), "");
  const s = t.suggestions[0];
  decide(t, s.id, "approved", { actor: "human" });
  assert.equal(appliedText(t), "suggestion one");
});

test("rejection requires a reason recorded in the log", () => {
  const t = newThread();
  const s = createSuggestion(t, { text: "draft", model: "m" });
  assert.throws(() => decide(t, s.id, "rejected", { actor: "human", reason: "no" }), new RegExp(`min ${MIN_VETO_REASON}`));
  const ok = decide(t, s.id, "rejected", { actor: "human", reason: "contains an unsourced statistic" });
  assert.equal(ok.status, "rejected");
  assert.equal(ok.vetoReason, "contains an unsourced statistic");
  const entry = t.log.find((l) => l.type === "suggestion_rejected");
  assert.equal(entry.reason, "contains an unsourced statistic");
  assert.equal(appliedText(t), "");
});

test("a suggestion cannot be decided twice", () => {
  const t = newThread();
  const s = createSuggestion(t, { text: "draft", model: "m" });
  decide(t, s.id, "approved", { actor: "human" });
  assert.throws(() => decide(t, s.id, "rejected", { actor: "human", reason: "changed my mind" }), /already decided/i);
});

test("unknown decision value is rejected", () => {
  const t = newThread();
  const s = createSuggestion(t, { text: "draft", model: "m" });
  assert.throws(() => decide(t, s.id, "maybe", { actor: "human" }), /approved or rejected/i);
});

test("bias flags are heuristic and stable", () => {
  const flags = flagBias("The elderly always need special care, he will handle it.");
  const ids = flags.map((f) => f.id);
  assert.ok(ids.includes("age-stereotype"));
  assert.ok(ids.includes("absolutism"));
  assert.ok(ids.includes("gender-default"));
  const clean = flagBias("The document lists three options with their trade-offs.");
  assert.equal(clean.length, 0);
});

test("sensitive-data pattern catches requests for personal identifiers", () => {
  const flags = flagBias("Please confirm your passport number so we can proceed.");
  assert.ok(flags.some((f) => f.id === "sensitive-data"));
});

test("summary counts states", () => {
  const t = newThread();
  const a = createSuggestion(t, { text: "one", model: "m" });
  const b = createSuggestion(t, { text: "two", model: "m" });
  decide(t, a.id, "approved", { actor: "human" });
  decide(t, b.id, "rejected", { actor: "human", reason: "not relevant to the task" });
  const s = summary(t);
  assert.deepEqual(s, { threadId: t.threadId, total: 2, pending: 0, approved: 1, rejected: 1, logLength: 4 });
});

test("long suggestions are refused (context limits)", () => {
  const t = newThread();
  assert.throws(() => createSuggestion(t, { text: "x".repeat(8001), model: "m" }), /too long/i);
});

test("uncertainty is clamped to [0,1] and invalid becomes null", () => {
  const t = newThread();
  const s = createSuggestion(t, { text: "draft", model: "m", uncertainty: 3.2 });
  assert.equal(s.uncertainty, 1);
  const s2 = createSuggestion(t, { text: "draft 2", model: "m", uncertainty: "not-a-number" });
  assert.equal(s2.uncertainty, null);
});