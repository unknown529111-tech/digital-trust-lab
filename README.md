# Digital Trust Lab

A training portfolio of three working projects, one per tier of the
**Technology & AI** track — built to demonstrate senior-level command of
digital inclusion, privacy & security engineering, and ethical human-AI design.

| Tier | Topic | Project | What it proves |
|------|-------|---------|----------------|
| Beginner | Bridging the Digital Divide | **[BridgeNet](bridgenet/)** | Accessible, low-bandwidth, offline-first bilingual portal — **0 WCAG violations** across static, JS, and Arabic/RTL states |
| Intermediate | Trust, Privacy & Security | **[TrustVault](trustvault/)** | Zero-knowledge vault: AES-256-GCM + PBKDF2 (600k iterations), AAD entry-binding, **15/15 tests** incl. tamper-detection and auto-lock |
| Advanced | Human-AI Futures | **[CoThink](cothink/)** | Human-in-the-loop AI workspace: propose-only engine, provenance-tagged suggestions, mandatory veto reasons, audit log — **19/19 tests** incl. raw-socket traversal attacks |

Every project ships with its own senior-level analysis document
(threat model, WCAG mapping, ethics/regulatory mapping), automated tests,
and CI that gate the whole repo.

---

## Repository layout

```
digital-trust-lab/
├── bridgenet/      # Tier 1 — accessible knowledge portal (static PWA)
│   ├── index.html  #   semantic, no-JS-friendly; AR content via dict
│   ├── css/ js/    #   logical properties, focus-visible, reduced-motion
│   ├── sw.js       #   offline-first service worker
│   └── scripts/audit.mjs  # axe-core CI gate (3 DOM states)
├── trustvault/     # Tier 2 — zero-knowledge encrypted vault (static app)
│   ├── js/crypto.mjs      # PBKDF2 + AES-GCM, pure & node-testable
│   ├── js/vault-app.js    # DI-wired UI (jsdom-tested user flows)
│   └── docs/THREAT-MODEL.md
├── cothink/        # Tier 3 — human-in-the-loop AI workspace (Node server)
│   ├── server.cjs          # thin HTTP layer, no CORS, path-guarded static
│   ├── lib/decision-engine.cjs  # propose-only state machine + audit log
│   ├── lib/openrouter.cjs       # provider wrapper (injectable fetch)
│   ├── public/               # the workspace UI
│   └── docs/ETHICS-MAPPING.md
├── docs/RESEARCH-NOTES.md  # standards currency (Aug 2026)
└── .github/workflows/ci.yml
```

## Run it

```bash
# Tier 1 — static, serve any folder:
cd bridgenet && npm install && npm run serve   # then open http://localhost:4173

# Tier 2 — static, same pattern (port 4174):
cd trustvault && npm install && npm run serve

# Tier 3 — real server (demo mode works without a key):
cd cothink && npm start                        # http://localhost:4175
# with a provider:  OPENROUTER_API_KEY=... npm start
```

## Verify it

```bash
cd bridgenet && npm run audit     # axe-core: wcag2a/2aa/21a/21aa/22aa, 3 states
cd trustvault && npm test        # 15 tests: crypto, tamper, AAD, UI flows
cd cothink    && npm test        # 19 tests: engine, API, traversal attacks
```

## Design threads that tie the three tiers together

- **Inclusion is a security property.** BridgeNet's text-only/high-contrast
  modes and offline cache are not "extra themes" — they are accessibility
  baseline for low-bandwidth and disabled users, enforced by CI.
- **Privacy by design, not privacy by policy.** TrustVault's CSP literally
  forbids outbound connections (`connect-src 'none'`); the threat model
  enumerates what an attacker can and cannot do at each layer.
- **Human oversight is an engine invariant.** CoThink's decision engine
  refuses any state transition that is not an explicit human decision —
  enforced in tests, not in a code-of-conduct page.
- **Every claim is tested.** No golden-doc-only projects: 34 automated tests
  plus an axe audit gate run on every push.

© 2026 — educational training portfolio. Sample data only.