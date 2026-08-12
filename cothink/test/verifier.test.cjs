const test = require("node:test");
const assert = require("node:assert/strict");
const { aggregateVerification, verifyClaimsPipeline } = require("../lib/verifier.cjs");
const { extractClaims } = require("../lib/claims.cjs");
const { verifyClaims, DEMO_SUGGESTION_TEXT } = require("../lib/openrouter.cjs");

// Deterministic CI: never depend on a real provider key.
process.env.OPENROUTER_API_KEY = "";

const claim = (over = {}) => ({
  id: "c1", text: "claim", facts: [], hedged: false, absolutist: false, attribution: null, ...over,
});

test("all supported claims -> passed", () => {
  const r = aggregateVerification({
    claims: [claim()],
    entries: [{ claimId: "c1", verdict: "supported", evidence: [{ source: "s", contradicts: false }] }],
  });
  assert.equal(r.status, "passed");
  assert.deepEqual(r.counts, { supported: 1, partial: 0, unsupported: 0, contradicted: 0 });
  assert.equal(r.conflicts, false);
  assert.equal(r.claims[0].verdict, "supported");
});

test("any unsupported or contradicted claim -> failed, conflicts surfaced", () => {
  const r = aggregateVerification({
    claims: [claim({ id: "c1" }), claim({ id: "c2" })],
    entries: [
      { claimId: "c1", verdict: "supported", evidence: [] },
      { claimId: "c2", verdict: "unsupported", evidence: [{ source: "Ministry of Statistics", contradicts: true }] },
    ],
  });
  assert.equal(r.status, "failed");
  assert.equal(r.conflicts, true);
  assert.equal(r.counts.unsupported, 1);
});

test("partials only -> partial, never failed without a hard failure", () => {
  const r = aggregateVerification({
    claims: [claim()],
    entries: [{ claimId: "c1", verdict: "partial", evidence: [] }],
  });
  assert.equal(r.status, "partial");
});

test("deterministic fallback: factual claim with no entry -> unsupported; vague claim -> partial", () => {
  const factual = claim({ id: "c1", facts: [{ kind: "number", value: "30%" }] });
  const vague = claim({ id: "c2" });
  const r = aggregateVerification({ claims: [factual, vague], entries: [] });
  assert.equal(r.claims[0].verdict, "unsupported");
  assert.equal(r.claims[1].verdict, "partial");
  assert.equal(r.status, "failed");
});

test("hedged or absolutist phrasing downgrades provider 'supported' to partial", () => {
  const hedged = claim({ id: "c1", hedged: true });
  const r = aggregateVerification({
    claims: [hedged],
    entries: [{ claimId: "c1", verdict: "supported", evidence: [] }],
  });
  assert.equal(r.claims[0].verdict, "partial");
});

test("evidence is capped at 6 items per claim", () => {
  const entries = {
    claimId: "c1",
    verdict: "supported",
    evidence: Array.from({ length: 9 }, (_, i) => ({ source: `s${i}`, contradicts: false })),
  };
  const r = aggregateVerification({ claims: [claim()], entries: [entries] });
  assert.equal(r.claims[0].evidence.length, 6);
});

test("verifyClaimsPipeline requires a provider and an array result", async () => {
  await assert.rejects(() => verifyClaimsPipeline({ claims: [claim()] }), /provider required/);
  await assert.rejects(
    () => verifyClaimsPipeline({ claims: [claim()], provider: async () => "not-an-array" }),
    /must return an array/,
  );
});

test("pipeline: provider entries aggregate into a report", async () => {
  const provider = async () => [{ claimId: "c1", verdict: "supported", evidence: [{ source: "s", contradicts: false }] }];
  const r = await verifyClaimsPipeline({ claims: [claim()], provider, model: "cross-check-model" });
  assert.equal(r.status, "passed");
  assert.equal(r.method, "cross-check");
  assert.ok(r.verifiedAt > 0);
});

test("demo verifier maps the confident-but-wrong story: 1 supported / 1 partial / 1 unsupported + conflict", async () => {
  const claims = extractClaims(DEMO_SUGGESTION_TEXT);
  assert.equal(claims.length, 3);
  const entries = await verifyClaims({ claims, task: "demo" });
  const report = aggregateVerification({ claims, entries });
  assert.equal(report.status, "failed");
  assert.equal(report.conflicts, true);
  assert.deepEqual(report.counts, { supported: 1, partial: 1, unsupported: 1, contradicted: 0 });
  assert.ok(report.claims[2].evidence.some((e) => e.contradicts));
});