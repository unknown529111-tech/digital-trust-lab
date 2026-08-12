/* CoThink model provider — OpenRouter (or any OpenAI-compatible endpoint).
 *
 * - API key comes from the environment only (OPENROUTER_API_KEY).
 * - `fetchImpl` is injectable so tests can stub the network entirely.
 * - Demo mode: when no key is configured the provider returns a clearly
 *   labeled canned suggestion so the full human-in-the-loop flow can be
 *   exercised offline and in CI without secrets. The suggestion is tagged
 *   model="demo-mode" so it can never be mistaken for a real model.
 */
"use strict";

const TRANSPARENCY_SYSTEM_PROMPT = [
  "You are a drafting assistant inside a human-in-the-loop workspace.",
  "The human will review and approve or reject your output — you cannot act on your own.",
  "Rules:",
  "1. Answer the task directly and concisely.",
  "2. Do not fabricate citations; if you are unsure of a fact, say so.",
  "3. End your reply with the exact line: UNCERTAINTY: <0.0-1.0> followed by",
  "   UNCERTAINTY_NOTE: <one sentence on what you are unsure about>",
].join("\n");

const DEFAULT_MODEL = process.env.COTHINK_MODEL || "openai/gpt-4o-mini";
const OPENROUTER_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1/chat/completions";

function demoResponse(task) {
  return {
    model: "demo-mode",
    text:
      "DEMO MODE — no OPENROUTER_API_KEY configured. This is a canned suggestion so the " +
      "approval workflow can be exercised. In real operation, " +
      `the request for “${task.slice(0, 120)}” would be sent to a configured model. ` +
      "UNCERTAINTY: 0.9\nUNCERTAINTY_NOTE: No real model was invoked.",
    uncertainty: 0.9,
    uncertaintyNote: "No real model was invoked.",
    finishReason: "demo",
    usage: { prompt_tokens: 0, completion_tokens: 0 },
  };
}

async function requestSuggestion({ task, model = DEFAULT_MODEL, fetchImpl = globalThis.fetch, apiKey = process.env.OPENROUTER_API_KEY }) {
  if (!apiKey) return { ...demoResponse(task), source: "demo-mode" };

  const body = {
    model,
    messages: [
      { role: "system", content: TRANSPARENCY_SYSTEM_PROMPT },
      { role: "user", content: task },
    ],
    temperature: 0.4,
    max_tokens: 700,
    // Ask the provider for the fields we display as provenance.
    extra_body: { include_reasoning: false },
  };

  let resp;
  try {
    resp = await fetchImpl(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/unknown529111-tech/digital-trust-lab",
        "X-Title": "CoThink",
      },
      body: JSON.stringify(body),
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
  const finishReason = (data.choices && data.choices[0] && data.choices[0].finish_reason) || "unknown";

  // Parse the model-reported uncertainty from the trailing annotation.
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
    model: data.model || model,
    text,
    uncertainty,
    uncertaintyNote,
    finishReason,
    usage: data.usage || {},
    source: "openrouter",
  };
}

module.exports = { requestSuggestion, DEFAULT_MODEL, OPENROUTER_URL, TRANSPARENCY_SYSTEM_PROMPT };