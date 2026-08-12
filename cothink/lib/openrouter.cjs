/* VeriLoop model provider — OpenRouter (or any OpenAI-compatible endpoint).
 *
 * Two capabilities:
 *   1. requestSuggestion  — generate a proposal (with provenance fields)
 *   2. verifyClaims       — CROSS-CHECK the proposal's claims with a
 *      (configurable) second model. Using a different model than the
 *      generator is the point: same-model self-grading is biased toward
 *      agreement.
 *
 * - API key comes from the environment only (OPENROUTER_API_KEY).
 * - `fetchImpl` is injectable so tests can stub the network entirely.
 * - Demo mode (no key): a deterministic, clearly labeled scenario where the
 *   model is confidently WRONG — the exact story the VeriLoop demo needs:
 *   3 claims split, 1 supported, 1 partial, 1 unsupported, a contradicting
 *   source, verification FAILED — while the suggestion reports 91%
 *   confidence. Seeing the confident model contradicted by the evidence
 *   layer is the point of the demo.
 */
"use strict";

const DEFAULT_MODEL = process.env.COTHINK_MODEL || "openai/gpt-4o-mini";
// Cross-check with a different family by default (independence).
const DEFAULT_VERIFIER_MODEL = process.env.COTHINK_VERIFIER_MODEL || "anthropic/claude-3.5-haiku";
const OPENROUTER_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1/chat/completions";

const TRANSPARENCY_SYSTEM_PROMPT = [
  "You are a drafting assistant inside a human-in-the-loop workspace.",
  "The human will review and approve or reject your output — you cannot act on your own.",
  "Rules:",
  "1. Answer the task directly and concisely.",
  "2. Do not fabricate citations; if you are unsure of a fact, say so.",
  "3. End your reply with the exact line: UNCERTAINTY: <0.0-1.0> followed by",
  "   UNCERTAINTY_NOTE: <one sentence on what you are unsure about>",
].join("\n");

const VERIFIER_SYSTEM_PROMPT = [
  "You are the verification layer of a human-in-the-loop system. Your job is",
  "to CROSS-CHECK each claim against your knowledge and label it, honestly.",
  "You never decide anything — you only grade evidence.",
  "",
  "For each numbered claim, reply with EXACTLY one block per claim:",
  "CLAIM <n>: <SUPPORTED | PARTIAL | UNSUPPORTED | CONTRADICTED>",
  "EVIDENCE: <what corroborates or refutes it; name the source type, e.g.",
  "  official statistics / academic paper / news report / none>",
  "CONTRADICTS: <yes|no> — yes only if you know a source that explicitly",
  "  contradicts the claim",
  "If you are unsure, grade PARTIAL and say why in EVIDENCE.",
  "Do not invent sources. Do not produce blocks for claims you were not given.",
].join("\n");

/* ---------- demo scenario ---------- */

const DEMO_SUGGESTION_TEXT =
  "The national digital-literacy program launched in 2024, was praised by the " +
  "Ministry of Education, and it increased adult internet usage by 30%.";

const DEMO_UNCERTAINTY = 0.91; // confident… and wrong

const DEMO_VERIFICATION_ENTRIES = [
  {
    claimId: "c1",
    verdict: "supported",
    evidence: [
      { source: "National portal launch archives (2024)", note: "Launch date corroborated by the official program archive.", contradicts: false },
      { source: "Press release #2024-118", note: "Program launch announced in March 2024.", contradicts: false },
    ],
    note: null,
  },
  {
    claimId: "c2",
    verdict: "partial",
    evidence: [
      { source: "Ministry of Education statement", note: "Program praised, but no measurable outcome is cited.", contradicts: false },
    ],
    note: "Qualitative praise found; no quantitative outcome in the statement.",
  },
  {
    claimId: "c3",
    verdict: "unsupported",
    evidence: [
      { source: "Ministry of Statistics 2026 report", note: "Reported rural adoption change is 12%, not 30% — contradicts the claim.", contradicts: true },
    ],
    note: "The 30% figure is not supported by the available statistics.",
  },
];

function demoResponse() {
  return {
    model: "demo-mode",
    text: DEMO_SUGGESTION_TEXT,
    uncertainty: DEMO_UNCERTAINTY,
    uncertaintyNote: "Demo scenario: this answer looks confident but contains unsupported claims — that is the point of the verification layer.",
    finishReason: "stop",
    usage: { prompt_tokens: 0, completion_tokens: 0 },
    source: "demo-mode",
  };
}

function demoVerification(claims) {
  // Deterministic mapping onto the canned story regardless of claim order.
  return claims.map((claim, i) => DEMO_VERIFICATION_ENTRIES[i % DEMO_VERIFICATION_ENTRIES.length] || {
    claimId: claim.id,
    verdict: "partial",
    evidence: [],
    note: "Demo scenario — no further claims exercised.",
  });
}

/* ---------- shared chat call ---------- */

async function callChat({ apiKey, model, system, user, fetchImpl = globalThis.fetch, maxTokens = 900 }) {
  let resp;
  try {
    resp = await fetchImpl(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/unknown529111-tech/digital-trust-lab",
        "X-Title": "VeriLoop",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
    });
  } catch (e) {
    const err = new Error(`provider unreachable: ${e.message}`);
    err.code = "PROVIDER_UNREACHABLE";
    throw err;
  }
  if (!resp.ok) {
    const err = new Error(`provider error ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    err.code = "PROVIDER_HTTP";
    throw err;
  }
  const data = await resp.json();
  const content = data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : "";
  return { content, model: data.model || model, usage: data.usage || {} };
}

/* ---------- generation ---------- */

async function requestSuggestion({ task, model = DEFAULT_MODEL, fetchImpl = globalThis.fetch, apiKey = process.env.OPENROUTER_API_KEY }) {
  if (!apiKey) return demoResponse();

  const { content, model: usedModel, usage } = await callChat({
    apiKey, model,
    system: TRANSPARENCY_SYSTEM_PROMPT,
    user: task,
    maxTokens: 700,
  });

  let uncertainty = null;
  let uncertaintyNote = "";
  const uMatch = content.match(/UNCERTAINTY:\s*(0?\.\d+|1\.0|1|0)/i);
  if (uMatch) uncertainty = Math.min(1, Math.max(0, Number(uMatch[1])));
  const nMatch = content.match(/UNCERTAINTY_NOTE:\s*(.+)$/m);
  if (nMatch) uncertaintyNote = nMatch[1].trim().slice(0, 500);
  const text = content
    .replace(/UNCERTAINTY_NOTE:[\s\S]*$/m, "")
    .replace(/UNCERTAINTY:\s*(0?\.\d+|1\.0|1|0)/i, "")
    .trim();

  return {
    model: usedModel,
    text,
    uncertainty,
    uncertaintyNote,
    finishReason: "stop",
    usage,
    source: "openrouter",
  };
}

/* ---------- verification (cross-check) ---------- */

async function verifyClaims({ claims, task = "", model = DEFAULT_VERIFIER_MODEL, fetchImpl = globalThis.fetch, apiKey = process.env.OPENROUTER_API_KEY }) {
  if (!apiKey) return demoVerification(claims);
  if (!claims || !claims.length) return [];

  const list = claims.map((c, i) => `CLAIM ${i + 1}: ${c.text}`).join("\n");
  const { content } = await callChat({
    apiKey, model,
    system: VERIFIER_SYSTEM_PROMPT,
    user: `Task that produced these claims: ${task.slice(0, 400)}\n\n${list}`,
    maxTokens: 1200,
  });

  // Parse per-claim blocks: "CLAIM 1: SUPPORTED / EVIDENCE: ... / CONTRADICTS: yes"
  const entries = [];
  const blockRe = /CLAIM\s+(\d+)\s*:\s*(\w+)\s*\nEVIDENCE:\s*([\s\S]*?)(?=\nCLAIM\s+\d+\s*:|\n*$)/gi;
  let m;
  while ((m = blockRe.exec(content)) !== null) {
    const idx = Number(m[1]) - 1;
    const claim = claims[idx];
    if (!claim) continue;
    const verdict = String(m[2]).toLowerCase();
    const evidenceText = String(m[3] || "").trim();
    const contradicts = /contradicts:\s*yes/i.test(evidenceText) || /CONTRADICTS:\s*yes/i.test(evidenceText);
    const evidenceSource = evidenceText.split("\n")[0].slice(0, 200);
    entries.push({
      claimId: claim.id,
      verdict: ["supported", "partial", "unsupported", "contradicted"].includes(verdict) ? verdict : "partial",
      evidence: evidenceSource
        ? [{ source: evidenceSource, note: evidenceText.slice(0, 300), contradicts }]
        : [],
      note: evidenceText.slice(0, 300) || null,
    });
  }

  // Claims the verifier declined to grade: deterministic fallback.
  const graded = new Set(entries.map((e) => e.claimId));
  claims.forEach((c) => {
    if (!graded.has(c.id)) {
      entries.push({ claimId: c.id, verdict: "unsupported", evidence: [], note: "Cross-check model did not grade this claim." });
    }
  });
  return entries;
}

module.exports = {
  requestSuggestion,
  verifyClaims,
  demoResponse,
  demoVerification,
  DEMO_SUGGESTION_TEXT,
  DEMO_VERIFICATION_ENTRIES,
  DEFAULT_MODEL,
  DEFAULT_VERIFIER_MODEL,
  OPENROUTER_URL,
  TRANSPARENCY_SYSTEM_PROMPT,
  VERIFIER_SYSTEM_PROMPT,
};