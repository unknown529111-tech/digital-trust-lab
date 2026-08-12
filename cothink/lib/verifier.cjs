/* VeriLoop verification engine — the evidence-in-the-loop core.
 *
 * Given the decomposed claims, an injected evidence provider (cross-check
 * model, search API, or demo scenario) returns per-claim verification
 * entries; this engine aggregates them into a verdict the human must review
 * before deciding.
 *
 * Verdict lattice:
 *   supported    — evidence corroborates the claim
 *   partial      — evidence partially corroborates or the claim is hedged
 *   unsupported  — no reliable evidence found
 *   contradicted — a source explicitly contradicts the claim
 *
 * Overall verification status:
 *   failed   — at least one claim unsupported or contradicted
 *   partial  — no failures, at least one partial
 *   passed   — every claim supported (including hedged-but-corroborated)
 *
 * The negotiation: verification NEVER decides. It only surfaces evidence;
 * the human remains the judge (approve/reject). This matches NIST AI RMF
 * TEVV (testing/evaluation/verification/validation as part of trustworthy
 * AI operation) and the EU AI Act Art. 50 transparency framework.
 */
"use strict";

const VERDICTS = ["supported", "partial", "unsupported", "contradicted"];

function isVerdict(v) {
  return VERDICTS.includes(v);
}

/** Aggregate per-claim verification entries into a verification report. */
function aggregateVerification({ claims = [], entries = [], now = Date.now } = {}) {
  const byId = new Map(entries.filter((e) => e && e.claimId).map((e) => [e.claimId, e]));
  const counts = { supported: 0, partial: 0, unsupported: 0, contradicted: 0 };

  const verifiedClaims = claims.map((claim) => {
    const entry = byId.get(claim.id) || {};
    let verdict = entry.verdict;
    if (!isVerdict(verdict)) {
      // Deterministic fallback for unverifiable signals: a claim with no
      // numeric/date/attribution signal cannot be corroborated by patterns —
      // it is at best "partial" by default, never "supported".
      verdict = claim.facts.length > 0 || claim.attribution ? "unsupported" : "partial";
    }
    if (verdict === "supported" && (claim.absolutist || claim.hedged)) {
      // Absolutist phrasing downgrades a "supported" into "partial":
      // "everyone knows X is 100% true" cannot be supported as stated.
      verdict = "partial";
    }
    counts[verdict] += 1;
    return {
      id: claim.id,
      text: claim.text,
      facts: claim.facts || [],
      hedged: !!claim.hedged,
      absolutist: !!claim.absolutist,
      attribution: claim.attribution || null,
      verdict,
      evidence: Array.isArray(entry.evidence) ? entry.evidence.slice(0, 6) : [],
      note: entry.note ? String(entry.note).slice(0, 500) : null,
    };
  });

  const conflicts = verifiedClaims.some((c) => c.evidence.some((e) => e.contradicts));
  let status = "passed";
  if (counts.unsupported > 0 || counts.contradicted > 0) status = "failed";
  else if (counts.partial > 0) status = "partial";

  return {
    status,
    conflicts,
    counts,
    claims: verifiedClaims,
    verifiedAt: now(),
    method: "cross-check",
  };
}

/** Convenience wrapper used by the server: claims → provider → report. */
async function verifyClaimsPipeline({ claims = [], provider, task = "", model = "unknown", now = Date.now } = {}) {
  if (!provider) throw new Error("verification provider required");
  const entries = await provider({ claims, task, model });
  if (!Array.isArray(entries)) throw new Error("verification provider must return an array");
  return aggregateVerification({ claims, entries, now });
}

module.exports = { aggregateVerification, verifyClaimsPipeline, VERDICTS, isVerdict };