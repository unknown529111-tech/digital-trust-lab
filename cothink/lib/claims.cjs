/* VeriLoop claim decomposition — deterministic, dependency-free, testable.
 *
 * Takes an AI proposal and splits it into discrete claims so that each one
 * can be verified independently. This is the first stage of
 * evidence-in-the-loop: an answer that "looks like one statement" usually
 * bundles supported facts with unsupported ones, and the human needs to see
 * them separated before deciding.
 *
 * Honest-limits note: this is a HEURISTIC extractor (pattern-based, English-
 * oriented), not a semantic parser. It exists to structure the verification
 * step, and its output is always presented to the user as heuristic.
 */
"use strict";

const ABSOLUTE_WORDS = /\b(always|never|everyone knows|undeniably|certainly|100% guaranteed)\b/i;
const HEDGE_WORDS = /\b(likely|probably|may(?: be)?|might|could|possibly|according to reports|suggests? that)\b/i;
const ATTRIBUTION_RE = /\baccording to ([A-Z][\w -]{2,40})/i;
const NUMBER_FACT = /\b\d+(?:[.,]\d+)?\s*(?:%|percent|billion|million|thousand|k|mb|gb|tb)(?=\W|$)/i;
const YEAR_FACT = /\b(?:19|20)\d{2}\b/;
// A comma followed by whitespace (protects "1,000" — no space after comma)
// or the word "and". Numbers like "1,000" never match because the comma is
// not followed by whitespace there.
const JOINERS = /,\s+|\s+and\s+/i;

function splitSentences(text) {
  // Sentence split on terminal punctuation. Lookbehind is fine in Node's V8.
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

function extractFacts(sentence) {
  const facts = [];
  const nums = sentence.match(new RegExp(NUMBER_FACT.source, "g"));
  const years = sentence.match(new RegExp(YEAR_FACT.source, "g"));
  (nums || []).forEach((n) => facts.push({ kind: "number", value: n }));
  (years || []).forEach((y) => facts.push({ kind: "year", value: y }));
  return facts;
}

/** Decompose a proposal into structured claims. */
function extractClaims(text) {
  if (typeof text !== "string" || !text.trim()) return [];
  const claims = [];
  for (const sentence of splitSentences(text)) {
    // A sentence can bundle several factual assertions; split on "and"
    // only when both parts carry a factual signal (number/date/attribution)
    // so we don't shred ordinary prose.
    const facts = extractFacts(sentence);
    const attribution = sentence.match(ATTRIBUTION_RE)?.[1] || null;
    const hedged = HEDGE_WORDS.test(sentence);
    const absolutist = ABSOLUTE_WORDS.test(sentence);

    const parts = sentence.split(JOINERS).map((p) => p.trim()).filter(Boolean);
    let chunks = [sentence];
    // "According to X, …" — the comma belongs to the citation, not a claim
    // boundary, so an attribution-led sentence stays one claim.
    const attributionLed = /^according to\b/i.test(sentence);
    if (!attributionLed && parts.length >= 2 && facts.length >= 2) {
      // Both halves carry quantitative weight — treat as distinct claims.
      chunks = parts;
    } else if (!attributionLed && parts.length >= 2 && facts.length === 1 && attribution) {
      chunks = parts;
    }

    chunks.forEach((chunk) => {
      const clean = chunk.replace(/^and\s+/i, "").replace(/,\s*$/, "").trim();
      claims.push({
        id: `c${claims.length + 1}`,
        text: clean,
        facts: extractFacts(clean),
        hedged,
        absolutist,
        attribution,
      });
    });
  }
  return claims;
}

/** How many claims carry a verifiable signal (numbers/dates/attribution)? */
function verifiableSignalCount(claims) {
  return claims.filter((c) => c.facts.length > 0 || c.attribution).length;
}

module.exports = { extractClaims, splitSentences, extractFacts, verifiableSignalCount };