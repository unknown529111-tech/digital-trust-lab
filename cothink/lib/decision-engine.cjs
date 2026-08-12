/* CoThink decision engine — the human-in-the-loop core.
 *
 * Design principles (mapped to EU AI Act Art. 50 transparency, NIST AI RMF
 * Govern/Measure, and Amershi et al. 2019 Guidelines for Human-AI Interaction):
 *   - The AI may only PROPOSE. Nothing is applied without an explicit human
 *     approval (Guideline G16: convey consequences; human oversight per
 *     NIST AI RMF Govern 1.5 / EU AI Act high-risk Art. 14 logic).
 *   - Rejection is first-class: it requires a reason, and the reason becomes
 *     part of an append-only interaction log (accountability).
 *   - Every suggestion is provenance-tagged: model id, model-reported
 *     uncertainty, heuristic bias flags, and finish reason.
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
    model: proposal.model || "unknown",
    source: proposal.source || "external-model",
    uncertainty: clamp01(proposal.uncertainty),
    uncertaintyNote: String(proposal.uncertaintyNote || "").slice(0, 500),
    biasFlags: flagBias(proposal.text),
    finishReason: proposal.finishReason || "unknown",
    createdAt: proposal.now ? proposal.now() : Date.now(),
    decision: null,
  };
  thread.suggestions.push(suggestion);
  thread.log.push({
    type: "suggestion_created",
    id,
    model: suggestion.model,
    uncertainty: suggestion.uncertainty,
    biasFlags: suggestion.biasFlags.map((b) => b.id),
    ts: suggestion.createdAt,
  });
  return suggestion;
}

/** The engine's hard rule: only an explicit human decision can transition a
 *  suggestion out of pending. `actor` must be "human"; anything else throws. */
function decide(thread, suggestionId, decision, options = {}) {
  const suggestion = thread.suggestions.find((s) => s.id === suggestionId);
  if (!suggestion) throw new Error("suggestion not found");
  if (suggestion.status !== "pending") throw new Error("suggestion already decided");
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
  return {
    threadId: thread.threadId,
    total: thread.suggestions.length,
    pending: thread.suggestions.filter((s) => s.status === "pending").length,
    approved: thread.suggestions.filter((s) => s.status === "approved").length,
    rejected: thread.suggestions.filter((s) => s.status === "rejected").length,
    logLength: thread.log.length,
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
  decide,
  appliedText,
  summary,
  flagBias,
  BIAS_PATTERNS,
  MIN_VETO_REASON,
};