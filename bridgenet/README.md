# BridgeNet — Knowledge for Everyone

**Tier 1 · Bridging the Digital Divide**

An accessible, low-bandwidth community knowledge portal. Demonstrates what
"digital inclusion" means in practice: the page weighs under 60 KB (no
external fonts, no trackers, no build step), works on 2G, survives offline
via service worker, and is fully usable by keyboard, screen reader, and in
high contrast — in English **and** Arabic (RTL).

## Features

- WCAG 2.2 AA: **0 axe violations** across static / JS / Arabic-RTL states (CI-gated)
- Text-only mode, high-contrast theme, A−/A/A+ font scaling — persisted
- Offline-first service worker with cache-first shell
- Search + topic filters announcing results via `aria-live`
- Full EN ↔ AR switch (lang/dir, content, labels, aria-labels) in one click
- No-JS fallback: all six articles readable and navigable without JavaScript

## Run

```bash
npm install
npm run serve      # http://localhost:4173
```

## Verify

```bash
npm run audit      # axe-core, 3 DOM states, wcag2a/2aa/21a/21aa/22aa
```

## Documentation

- [WCAG 2.2 compliance statement & contrast ratios](docs/WCAG-COMPLIANCE.md)

## Design decisions worth knowing

- **Progressive enhancement, not frameworks.** The whole experience is
  semantic HTML + ~8 KB of JS. Every enhancement (filter, theme, language)
  announces itself and preserves state.
- **Logical properties everywhere** — one stylesheet for LTR + RTL.
- **Accessibility as a gate, not a goal**: `npm run audit` fails CI on any
  violation; the audit script renders all three states, including RTL.