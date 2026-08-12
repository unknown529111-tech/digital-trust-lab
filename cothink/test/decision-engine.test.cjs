const test = require("node:test");
const assert = require("node:assert/strict");
const {
  newThread, createSuggestion, attachVerification, reverify, decide, appliedText, summary, flagBias, MIN_VETO_REASON,
} = require("../lib/decision-engine.cjs");

/** A minimal passed verification, as the evidence layer would produce it. */
function verified(over = {}) {
  return {
    status: "passed",
    conflicts: false,
    counts: { supported: 1, partial: 0, unsupported: 0, contradicted: 0 },
    claims: [{ id: "c1", text: "claim", facts: [], hedged: false, absolutist: false, attribution: null, verdict: "supported", evidence: [], note: null }],
    verifiedAt: 1,
    method: "cross-check",
    ...over,
  };
}

function failedVerification() {
  return verified({ status: "failed", conflicts: true, counts: { supported: 1, partial: 1, unsupported: 1, contradicted: 0 } });
}

/** create + attach verification, returns the suggestion. */
function makeVerifiedSuggestion(thread, text, over = {}) {
  const s = createSuggestion(thread, { text, model: "m", ...over });
  attachVerification(thread, s.id, verified());
  return s;
}

test("a suggestion MUST be verified before any human decision (evidence-in-the-loop)", () => {
  const t = newThread();
  const s = createSuggestion(t, { text: "Draft text", model: "m" });
  assert.throws(() => decide(t, s.id, "approved", { actor: "human" }), /must be verified/i);
  assert.equal(s.status, "pending");
});

test("human approval is required — engine refuses non-human actors", () => {
  const t = newThread();
  const s = makeVerifiedSuggestion(t, "Draft text");
  assert.throws(() => decide(t, s.id, "approved", { actor: "ai" }), /only a human may decide/i);
  assert.equal(s.status, "pending");
});

test("nothing is applied before an explicit human decision", () => {
  const t = newThread();
  createSuggestion(t, { text: "suggestion one", model: "m" });
  assert.equal(appliedText(t), "");
  const s = makeVerifiedSuggestion(t, "suggestion one");
  decide(t, s.id, "approved", { actor: "human" });
  assert.equal(appliedText(t), "suggestion one");
});

test("verification failure does NOT block the human — the human is the judge", () => {
  const t = newThread();
  const s = createSuggestion(t, { text: "confident but wrong", model: "m" });
  attachVerification(t, s.id, failedVerification());
  const decided = decide(t, s.id, "approved", { actor: "human" });
  assert.equal(decided.status, "approved");
});

test("commitment: evidence survives into the approved text decision record", () => {
  const t = newThread();
  const s = createSuggestion(t, { text: "draft", model: "m" });
  attachVerification(t, s.id, failedVerification());
  decide(t, s.id, "approved", { actor: "human" });
  assert.equal(s.decision.decision, "approved");
  assert.equal(s.verification.status, "failed"); // evidence trail kept, not erased by approval
});

test("rejection requires a reason recorded in the log", () => {
  const t = newThread();
  const s = makeVerifiedSuggestion(t, "draft");
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
  const s = makeVerifiedSuggestion(t, "draft");
  decide(t, s.id, "approved", { actor: "human" });
  assert.throws(() => decide(t, s.id, "rejected", { actor: "human", reason: "changed my mind" }), /already decided/i);
});

test("unknown decision value is rejected", () => {
  const t = newThread();
  const s = makeVerifiedSuggestion(t, "draft");
  assert.throws(() => decide(t, s.id, "maybe", { actor: "human" }), /approved or rejected/i);
});

test("attaching verification records an evidence event in the audit log", () => {
  const t = newThread();
  const s = createSuggestion(t, { text: "draft", model: "m" });
  attachVerification(t, s.id, failedVerification());
  const entry = t.log.find((l) => l.type === "suggestion_verified");
  assert.ok(entry);
  assert.equal(entry.status, "failed");
  assert.equal(entry.conflicts, true);
  assert.deepEqual(entry.counts, { supported: 1, partial: 1, unsupported: 1, contradicted: 0 });
  // Verification can only be attached once…
  assert.throws(() => attachVerification(t, s.id, verified()), /already verified/i);
});

test("reverify replaces the report, logs the event, and only while pending", () => {
  const t = newThread();
  const s = makeVerifiedSuggestion(t, "draft");
  assert.equal(t.log.filter((l) => l.type.includes("verif")).length, 1);
  reverify(t, s.id, failedVerification());
  assert.equal(s.verification.status, "failed");
  assert.equal(t.log.filter((l) => l.type === "suggestion_reverified").length, 1);
  decide(t, s.id, "approved", { actor: "human" });
  assert.throws(() => reverify(t, s.id, verified()), /only pending/i);
});

test("suggestion stores the originating task (truncated)", () => {
  const t = newThread();
  const s = createSuggestion(t, { text: "draft", model: "m", task: "t".repeat(5000) });
  assert.equal(s.task.length, 2000);
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

test("summary counts states and aggregates the verification rollup", () => {
  const t = newThread();
  const a = makeVerifiedSuggestion(t, "one");
  const b = makeVerifiedSuggestion(t, "two");
  decide(t, a.id, "approved", { actor: "human" });
  decide(t, b.id, "rejected", { actor: "human", reason: "not relevant to the task" });
  const s = summary(t);
  assert.equal(s.total, 2);
  assert.equal(s.approved, 1);
  assert.equal(s.rejected, 1);
  assert.deepEqual(s.verification, { claims: 2, supported: 2, partial: 0, unsupported: 0, contradicted: 0, failed: 0, passed: 2 });
  // created + verified + decided per suggestion
  assert.equal(s.logLength, 6);
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