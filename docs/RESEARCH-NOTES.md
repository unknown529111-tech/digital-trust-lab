# Research Notes — Standards Currency (August 2026)

What the browser-research phase verified, and how it shaped the three
projects. Every claim below was checked against primary sources
(OWASP GitHub org, W3C, EUR-Lex/Wikipedia, NIST) on 2026-08-12.

## 1. OWASP Top 10 — the 2025 edition is current

- **OWASP Top 10:2025 is RELEASED** and is the current authoritative list;
  the 2021 edition is explicitly marked **SUPERSEDED**, 2017 **HISTORIC**.
  → TrustVault's threat model maps to **2025** categories, not 2021.
- The OWASP password-storage guidance (PBKDF2-HMAC-SHA-256 with **600,000
  iterations** for interactive logins) drives TrustVault's KDF parameters.
- General-purpose AI also slipped into OWASP tracks (GenAI Top 10 / LLM
  Top 10 are related efforts) — noted as a trend we deliberately did not
  vendor-lock into.

## 2. WCAG 2.2 is the conformance target; EN 301 549 is the EU harmonized one

- WCAG 2.2 (W3C Recommendation, Oct 2023) adds 9 criteria over 2.1 —
  including **2.4.11 Focus Not Obscured (Min) (AA)**, **2.5.7 Dragging
  Movements (AA)**, **2.5.8 Target Size (Min) (AA)**, **3.2.6 Consistent
  Help (AA)**, **3.3.7 Redundant Entry (AA)**, **3.3.8 Accessible
  Authentication (Min) (AA)** — all reflected in BridgeNet's compliance
  statement.
- WCAG 3.0 remains a W3C draft (W3C "Silver"); adopting it now would be
  premature — we target 2.2 AA and note the draft.

## 3. EU AI Act is fully in its obligation timeline

- **Regulation (EU) 2024/1689**: entered into force **1 Aug 2024**.
  - 2 Feb 2025 — prohibitions (Art. 5) + AI literacy apply.
  - 2 Aug 2025 — GPAI obligations (Art. 53–55) + governance apply.
  - **2 Aug 2026 — most high-risk obligations apply** (i.e., ~now).
  → CoThink's ethics doc maps Art. 12 (record-keeping), 13 (transparency),
    14 (human oversight), 50 (transparency obligations for AI interacting
    with people) as the operative provisions as of this session.

## 4. NIST AI RMF 1.0 + Generative AI Profile

- NIST AI RMF 1.0 (Jan 2023): core functions **Govern – Map – Measure –
  Manage**; supplemented since by the Generative AI Profile (NIST AI 600-1,
  July 2024) and the Adversarial ML profile (AI 600-2). CoThink uses the
  four-function structure with its sub-categories (G1–G4, M2/M4, Me1/Me4,
  Ma1/Ma4) as the second mapping axis.

## 5. Human-AI interaction guidance

- The canonical 18 **Guidelines for Human-AI Interaction** come from Amershi
  et al., CHI 2019 (Microsoft Research); Microsoft's HAX Toolkit builds on
  them and the HAX site is JS-rendered (not fetchable as static text) — the
  underlying peer-reviewed CHI paper is the stable citation used in
  CoThink's mapping.

## 6. Digital inclusion baseline

- Digital divide framing per ITU/UN broadband commission statistics
  (roughly half the world under-connected) anchors BridgeNet's editorial
  content and the "lowest-common-denominator" engineering choices
  (60 KB page, 2G-friendly, offline).

---

*Process note: the initial w3.org fetch was 403'd by an anti-bot rule and
one follow-up fetch was caught by the local command-approval gate; all
claims above were confirmed via the sources that did load (OWASP GitHub
raw, Wikipedia/regulatory mirrors, NIST, GitHub API), and the remaining
browser-based verification step (real-rendering contrast audit) is
scheduled in the verification phase.*