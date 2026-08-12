# CoThink — Ethics & Regulatory Mapping

**Tier 3 · Human-AI Futures**

CoThink is a human-in-the-loop AI workspace: the model proposes, a human
disposes. This document maps the implementation to the **EU AI Act**
(Regulation (EU) 2024/1689), the **NIST AI Risk Management Framework 1.0**,
and **Guidelines for Human-AI Interaction** (Amershi et al., CHI 2019 —
the basis of Microsoft's HAX toolkit).

*Standards currency: as of August 2026 the EU AI Act is fully in its
obligation timeline: prohibitions since Feb 2025, GPAI rules since
Aug 2025, and the bulk of high-risk obligations since Aug 2026.*

## 1. EU AI Act mapping

| Provision | Requirement | CoThink implementation |
|---|---|---|
| **Art. 50(1) — Transparency: disclosure** | Systems that interact with people must disclose they are AI | Every suggestion card is labeled with its producing model; the header states "human-in-the-loop"; the app discloses demo-mode when no real provider is configured |
| **Art. 50(2)(d) — Synthetic content** | AI-generated text intended for humans must be machine-readable-marked or otherwise disclosed | Approved blocks in the working document carry a provenance line (model + time) — AI content is never presented as human writing |
| **Art. 13 — Transparency of high-risk systems** (analogous logic) | Instructions for use; operation must be interpretable | Each card shows model-reported uncertainty, finish reason, and heuristic risk flags |
| **Art. 14 — Human oversight** | High-risk systems must allow human review, override, and interruption | The decision engine **hard-refuses** any transition that is not an explicit human decision (`actor: "human"` enforced in code and tests); nothing auto-applies |
| **Art. 12 — Record-keeping** | Logs enabling traceability of outputs | Append-only interaction log: every creation/approval/rejection with timestamp and (for rejections) the human's reason; exportable as JSON |
| **GPAI transparency (Art. 53 area)** | Model documentation / content provenance obligations for general-purpose AI | Provenance fields (`model`, `finishReason`, `uncertainty`) are first-class API and UI data, not debug info |

Design stance: CoThink is deliberately positioned **below** the high-risk
threshold (no decisions affecting rights, no real-time biometrics, no safety
components) — but it implements the *oversight pattern* they require, as a
demonstration of the discipline, and documents that positioning honestly.

## 2. NIST AI RMF 1.0 mapping (Govern — Map — Measure — Manage)

### Govern (G)
- **G1 (governance is integrated)**: the "propose-only" invariant is in the
  decision engine's code — `decide()` throws for any non-human actor.
- **G3 (third-party risk)**: provider integration is a thin, keyed wrapper
  (`lib/openrouter.cjs`) with injectable fetch — the provider is treated as
  untrusted input; its text is clipped, flagged, and never auto-applied.
- **G4 (documentation)**: this document + READMEs are the AI system card.

### Map (M)
- **M2 (context)**: the system's purpose is bounded (draft/summarize under
  human review); the UI states what the system can and cannot do.
- **M4 (beneficial/harmful impacts)**: heuristic bias flags + the veto
  workflow exist precisely to surface harmful output before it enters the
  working document.

### Measure (Me)
- **Me1 (metrics)**: uncertainty is *model-reported* and labeled as such —
  the app makes no claim that it is calibrated. Bias flags are labeled
  "heuristic — not a formal evaluation". Honesty about measurement
  capability is itself a measurement control.
- **Me4 (testability)**: 19 automated tests cover the decision machine,
  API contracts, input hardening, and traversal attacks.

### Manage (Ma)
- **Ma1 (incident response by design)**: rejected suggestions leave an
  audit reason; all actions are undoable by the human (delete/re-ask); the
  log export gives the user custody of the evidence.
- **Ma4 (ongoing monitoring)**: state persists locally, auto-restores, and
  the exportable log supports periodic human review.

## 3. Guidelines for Human-AI Interaction (Amershi et al., CHI 2019) mapping

| Guideline | CoThink |
|---|---|
| G1 · Make clear what the system can do | Task box + "The AI proposes, you decide"; demo-mode banner |
| G2 · Make clear how well it can do what it can do | Model-reported uncertainty bar per suggestion |
| G4 · Show contextually relevant information | Provenance (model, time, finish reason) on every card |
| G6 · Mitigate social biases | Heuristic flag set (age/gender/ability/absolutism/sensitive-data) |
| G7 · Support efficient invocation | Single "Ask for a suggestion" action |
| G8 · Support efficient dismissal | Reject with one click; reason field only when deciding |
| G9 · Support efficient correction | Re-ask; veto reason recorded; nothing irreversible |
| G11 · Make clear why the system did what it did | Veto reasons + uncertainty note + model id on every output |
| G13 · Learn from user behavior | Explicitly NOT implemented — no behavioral tracking; noted as a deliberate privacy choice |
| G16 · Convey the consequences of user actions | "Approve — add to document" says exactly what approval does |
| G17 · Provide global controls | UI-level full control: nothing acts without the human |

## 4. Design decisions with ethical rationale

1. **No autonomous mode exists.** There is no flag, env var, or hidden
   endpoint that lets suggestions apply themselves. Ethics enforced as a
   state machine, not as a guideline.
2. **Rejection requires a reason.** Forces the human to articulate
   disagreement — makes the veto legible to future readers of the log and
   discourages rubber-stamping.
3. **Uncertainty is reported, not asserted.** The app never claims
   confidence it cannot measure; it relays the model's own report
   (calibration caveat visible in UI).
4. **Heuristics are labeled heuristics.** Bias flags are explicitly
   "automated heuristic — not a substitute for evaluation"; the app does not
   pretend to be a fairness auditor.
5. **No server-side memory.** Threads live in server RAM for the session,
   the log lives with the user; nothing persists server-side by design —
   minimizing the blast radius of a server compromise.

## 5. Honest limitations

- Uncertainty numbers come from the model's self-report and are **not**
  validated as calibrated probabilities.
- Heuristic bias patterns are English-only and narrow; they can miss subtle
  harms and can false-positive. They are a *trigger for human attention*,
  not an evaluation.
- Demo mode (no API key) returns canned output — clearly labeled, but
  useless for real work without configuration.
- The log is user-held evidence, not cryptographic non-repudiation.

## 6. VeriLoop — the evidence layer (2026 update)

CoThink evolved into **VeriLoop**: *evidence-in-the-loop*. The AI proposes,
a verification layer grades every claim, and only then may a human decide —
the engine refuses any decision on an unverified suggestion (tested, not
promised). Mapping to the current regulatory and research landscape:

| Source (verified current, Aug 2026) | What it demands | Where VeriLoop implements it |
|---|---|---|
| NIST AI RMF — **TEVV** (testing, evaluation, verification & validation; AI 100-1 §4, AI 100-2 Eval & GenAI profile) | Verify outputs, don't trust reported confidence; validate continuously | `lib/verifier.cjs` grades each claim; `lib/claims.cjs` decomposes answers; dashboard accumulates per-model survival rates |
| NIST 2026 AI evaluation / agentic-systems work (announced 2026) | Evaluate the *system* and its outputs, including agentic pipelines | Cross-check model ≠ generator model (default `claude-3.5-haiku` vs `gpt-4o-mini`) so agreement isn't baked in; `/api/verify` re-runs with another model |
| EU AI Act Art. 50 + July-2026 transparency guidance (obligations applying from Aug 2026) | Notify users they interact with AI output; make limits clear | Permanent demo/live banner; "self-reported confidence — claims are the real test" label; provenance on every card |
| Amershi et al. 2019, **G2 / G4 / G11** | Clear limits + context + reasons | Claim verdicts, contradiction flags, evidence sources shown before the approve button |
| OWASP LLM Top 10 (2025) — LLM05 (insecure output handling), LLM06 (excessive agency) | Don't let model output flow into actions; constrain agency | Propose-only engine; no autonomous mode; claim evidence is user-visible before any approve |

**Why "evidence-in-the-loop" is stronger than "human-in-the-loop":**
human-in-the-loop places the human at the end of a pipe; evidence-in-the-loop
interposes a verification step the human *must* see. VeriLoop's engine enforces
this with a state-machine guard (`decide()` throws on unverified suggestions),
which makes the commitment structural, not rhetorical.

**The demo is the point:** with no API key the app runs a deterministic
scenario in which the model reports 91% confidence while verification fails
(1 supported / 1 partial / 1 unsupported + a contradicting source). The
lesson — *confidence is not correctness* — is experienced, not narrated.
Fresh limitations introduced by the evidence layer:

- Claim decomposition is a **pattern heuristic** (English-oriented), so claim
  boundaries can be wrong; filings are presented as heuristic.
- Live evidence comes from a second model's knowledge, **not from
  search-indexed sources**; a search-backed evidence provider is a documented
  extension point, not yet shipped.
- The dashboard measures claim survival per model — an operational metric
  for humans, not a scientific benchmark.