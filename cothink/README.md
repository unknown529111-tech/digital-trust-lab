# CoThink — Human-AI Collaboration Workspace

**Tier 3 · Human-AI Futures**

A working demonstration of ethical human-AI collaboration: the AI only ever
*proposes*, and a human must explicitly *approve* before anything reaches
the working document. Every suggestion travels with provenance — model id,
model-reported uncertainty, finish reason, and heuristic risk flags — and
every rejection requires a reason that lands in an exportable audit log.

## Features

- **Propose-only engine** (`lib/decision-engine.cjs`): `decide()` refuses any
  non-human actor — enforced in code, covered by tests
- **Provenance on every suggestion**: model, uncertainty (model-reported),
  finish reason, timestamps
- **Heuristic risk flags** (age/gender/ability/absolutism/sensitive-data),
  honestly labeled as heuristics
- **Veto with mandatory reason** recorded in the interaction log
- **Working document** contains only human-approved blocks, each with its
  provenance line
- **Exportable audit log** (JSON)
- **Demo mode without API key** — full workflow testable offline; live mode
  via OpenRouter
- **Hardened server**: no CORS, path-traversal guard (raw-socket tested),
  input caps, no server-side persistence

## Run

```bash
npm start                          # demo mode → http://localhost:4175
OPENROUTER_API_KEY=sk-or-... npm start   # live mode (see .env.example)
```

## Verify

```bash
npm test    # 19 tests: engine invariants, API contracts, traversal attacks
```

## Docs

- [Ethics & regulatory mapping — EU AI Act / NIST AI RMF / Amershi et al.](docs/ETHICS-MAPPING.md)

## Files

```
server.cjs                 # thin HTTP layer (static + /api/{health,suggest,decide})
lib/decision-engine.cjs    # propose-only state machine, bias flags, audit log
lib/openrouter.cjs         # provider wrapper (injectable fetch, demo fallback)
public/                    # the workspace UI (no build step)
test/                      # 15 engine tests + 4 server/API/attack suites
```