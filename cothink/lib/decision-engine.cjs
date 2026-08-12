/* VeriLoop decision engine — the evidence-in-the-loop core.
 *
 * Design principles (mapped to EU AI Act Art. 50 transparency, NIST AI RMF
 * Govern/Measure/TEVV, and Amershi et al. 2019 Guidelines for Human-AI
 * Interaction):
 *   - The AI may only PROPOSE. Nothing is applied without an explicit human
 *     approval (Guideline G16: convey consequences; human oversight per
 *     NIST AI RMF Govern 1.5 / EU AI Act high-risk Art. 14 logic).
 *   - The human decides ONLY after the evidence layer has graded the
 *     proposal's claims (evidence-in-the-loop). decide() refuses any
 *     unverified suggestion — enforced here, in code, not in a UI label.
 *   - Rejection is first-class: it requires a reason, and the reason becomes
 *     part of an append-only interaction log (accountability).
 *   - Every suggestion is provenance-tagged: model id, model-reported
 *     uncertainty, heuristic bias flags, finish reason, and per-claim
 *     verification verdicts.
 *   - The log is the audit trail: who decided, when, and why.
 */
"use strict";

const MIN_VETO_REASON = 3;

/** Heuristic bias/risk flags. Explicitly heuristic — never a substitute for
 *  formal evaluation (NIST AI RMF Measure). Kept conservative to avoid
 *  false confidence; the UI labels them as such. */
const BIAS_PATTERNS = [
  { id: "age-stereotype", label: "Possible age stereotyping", re: /\b(elderly|old people|young people|millennials|boomers)\b/i },
  { id: "gender-default", label: "Default gender marking", re: /\b(he will|she will|his|her)\b/i },
  { id: "ability-stereotype", label: "Possible ability stereotype", re: /\b(bound to a wheelchair|suffers from|handicapped)\b/i },
  { id: "absolutism", label: "Unhedged absolute claim", re: /\b(always|never|everyone knows|certainly)\b/i },
  { id: "sensitive-data", label: "Requests sensitive personal data", re: /\b(national id|passport number|social security|bank account number|otp)\b/i },
];

function flagBias(text) {
  return BIAS_PATTERNS.filter((p) => p.re.test(text)).map((p) => ({ id: p.id, label: p.label }));
}

function newThread(options = {}) {
  return {
    threadId: options.threadId || crypto.randomUUID(),
    createdAt: options.now ? options.now() : Date.now(),
    suggestions: [],
    log: [],
    meta: options.meta || {},
  };
}

function createSuggestion(thread, proposal) {
  if (!proposal || typeof proposal.text !== "string" || !proposal.text.trim()) {
    throw new Error("suggestion text required");
  }
  if (proposal.text.length > 8000) throw new Error("suggestion too long");
  const id = crypto.randomUUID();
  const suggestion = {
    id,
    status: "pending",
    text: proposal.text,
    task: proposal.task ? String(proposal.task).slice(0, 2000) : null,
    model: proposal.model || "unknown",
    source: proposal.source || "external-model",
    uncertainty: clamp01(proposal.uncertainty),
    uncertaintyNote: String(proposal.uncertaintyNote || "").slice(0, 500),
    biasFlags: flagBias(proposal.text),
    finishReason: proposal.finishReason || "unknown",
    verification: proposal.verification || null,
    createdAt: proposal.now ? proposal.now() : Date.now(),
    decision: null,
  };
  thread.suggestions.push(suggestion);
  thread.log.push({
    type: "suggestion_created",
    id,
    task: suggestion.task ? String(suggestion.task).slice(0, 200) : undefined,
    model: suggestion.model,
    uncertainty: suggestion.uncertainty,
    biasFlags: suggestion.biasFlags.map((b) => b.id),
    ts: suggestion.createdAt,
  });
  return suggestion;
}

/** Attach the evidence-layer report to a pending suggestion. The engine
 *  records it as a log event so the audit trail shows verification ran
 *  before any human decision. */
function attachVerification(thread, suggestionId, verification) {
  const suggestion = thread.suggestions.find((s) => s.id === suggestionId);
  if (!suggestion) throw new Error("suggestion not found");
  if (suggestion.verification) throw new Error("suggestion already verified");
  if (!verification || !Array.isArray(verification.claims)) {
    throw new Error("valid verification report required");
  }
  suggestion.verification = verification;
  thread.log.push({
    type: "suggestion_verified",
    id: suggestionId,
    status: verification.status,
    conflicts: Boolean(verification.conflicts),
    counts: { ...(verification.counts || {}) },
    ts: verification.verifiedAt || Date.now(),
  });
  return suggestion;
}

/** Re-run verification on a pending suggestion (e.g. cross-check with a
 *  different model). Replaces the previous report and logs the event. */
function reverify(thread, suggestionId, verification) {
  const suggestion = thread.suggestions.find((s) => s.id === suggestionId);
  if (!suggestion) throw new Error("suggestion not found");
  if (suggestion.status !== "pending") throw new Error("only pending suggestions can be re-verified");
  if (!verification || !Array.isArray(verification.claims)) {
    throw new Error("valid verification report required");
  }
  suggestion.verification = verification;
  thread.log.push({
    type: "suggestion_reverified",
    id: suggestionId,
    status: verification.status,
    conflicts: Boolean(verification.conflicts),
    counts: { ...(verification.counts || {}) },
    ts: verification.verifiedAt || Date.now(),
  });
  return suggestion;
}

/** The engine's hard rule: only an explicit human decision can transition a
 *  suggestion out of pending, and only AFTER the evidence layer has run.
 *  `actor` must be "human"; anything else throws. */
function decide(thread, suggestionId, decision, options = {}) {
  const suggestion = thread.suggestions.find((s) => s.id === suggestionId);
  if (!suggestion) throw new Error("suggestion not found");
  if (suggestion.status !== "pending") throw new Error("suggestion already decided");
  if (!suggestion.verification) {
    throw new Error("suggestion must be verified before a human decision (evidence-in-the-loop)");
  }
  if (options.actor !== "human") throw new Error("only a human may decide");

  const ts = options.now ? options.now() : Date.now();
  if (decision === "approved") {
    suggestion.status = "approved";
  } else if (decision === "rejected") {
    const reason = String(options.reason || "").trim();
    if (reason.length < MIN_VETO_REASON) {
      throw new Error(`veto reason required (min ${MIN_VETO_REASON} characters)`);
    }
    suggestion.status = "rejected";
    suggestion.vetoReason = reason;
  } else {
    throw new Error("decision must be approved or rejected");
  }
  suggestion.decision = { decision, by: "human", at: ts };
  thread.log.push({ type: `suggestion_${decision}`, id: suggestionId, reason: decision === "rejected" ? suggestion.vetoReason : undefined, ts });
  return suggestion;
}

function appliedText(thread) {
  return thread.suggestions
    .filter((s) => s.status === "approved")
    .map((s) => s.text)
    .join("\n\n");
}

function summary(thread) {
  const rollup = { claims: 0, supported: 0, partial: 0, unsupported: 0, contradicted: 0, failed: 0, passed: 0 };
  thread.suggestions.forEach((s) => {
    const v = s.verification;
    if (!v) return;
    rollup.claims += v.counts ? v.counts.supported + v.counts.partial + v.counts.unsupported + v.counts.contradicted : 0;
    rollup.supported += v.counts ? v.counts.supported : 0;
    rollup.partial += v.counts ? v.counts.partial : 0;
    rollup.unsupported += v.counts ? v.counts.unsupported : 0;
    rollup.contradicted += v.counts ? v.counts.contradicted : 0;
    if (v.status === "failed") rollup.failed += 1;
    else if (v.status === "passed") rollup.passed += 1;
  });
  return {
    threadId: thread.threadId,
    total: thread.suggestions.length,
    pending: thread.suggestions.filter((s) => s.status === "pending").length,
    approved: thread.suggestions.filter((s) => s.status === "approved").length,
    rejected: thread.suggestions.filter((s) => s.status === "rejected").length,
    logLength: thread.log.length,
    verification: rollup,
  };
}

function clamp01(x) {
  const n = Number(x);
  if (Number.isNaN(n)) return null;
  return Math.min(1, Math.max(0, n));
}

module.exports = {
  newThread,
  createSuggestion,
  attachVerification,
  reverify,
  decide,
  appliedText,
  summary,
  flagBias,
  BIAS_PATTERNS,
  MIN_VETO_REASON,
};