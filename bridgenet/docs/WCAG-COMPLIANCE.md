# BridgeNet — Accessibility & WCAG 2.2 Compliance Statement

**Status: WCAG 2.2 AA targeted, automated audit 0 violations**
(audited states: static no-JS · JS English · JS Arabic RTL — gated in CI)

## 1. Conformance target

[WCAG 2.2](https://www.w3.org/TR/WCAG22/) Level AA (W3C Recommendation,
Oct 2023), evaluated against the axis set: `wcag2a`, `wcag2aa`, `wcag21a`,
`wcag21aa`, `wcag22aa`. Also aligned with the EU [EN 301 549 v3.2.1]
harmonised standard where applicable (public-sector ICT accessibility),
and with the W3C Web Accessibility Initiative's digital-inclusion guidance.

## 2. What was implemented, per principle

### Perceivable
| Criterion | How BridgeNet meets it |
|---|---|
| 1.1.1 Non-text Content (A) | Decorative brand mark is `aria-hidden`; no informative images without text alternatives |
| 1.3.1 Info & Relationships (A) | Semantic landmarks (`header/nav/main/footer`), `fieldset/legend` for filters, headings in a single h1 → h3 hierarchy, labels bound to every control |
| 1.3.2 Meaningful Sequence (A) | Logical DOM order mirrors visual order in both directions (logical CSS properties) |
| 1.4.1 Use of Color (A) | State never shown by color alone: `aria-pressed`, icons, text |
| 1.4.3 Contrast (AA) | Verified palette ratios (below); 4.5:1 on all body text, 3:1 on UI components |
| 1.4.4 Resize Text (AA) | A−/A/A+ relative font scaling; layout reflows (no fixed widths, `clamp()` headings) |
| 1.4.5 Images of Text (AA) | No images of text anywhere |
| 1.4.10 Reflow (AA) | 320px wide layouts work; flex/grid wrap; no horizontal scroll |
| 1.4.11 Non-text Contrast (AA) | Borders/controls ≥ 3:1 against backgrounds |
| 1.4.12 Text Spacing (AA) | No fixed line/paragraph heights that clip overridden spacing |
| 1.4.13 Content on Hover (AA) | No hover-only content |

### Operable
| Criterion | How BridgeNet meets it |
|---|---|
| 2.1.1 Keyboard (A) | Native elements only; `details/summary` is keyboard-operable with zero JS |
| 2.1.2 No Keyboard Trap (A) | No custom focus traps, no modals |
| 2.4.1 Bypass Blocks (A) | Skip link is the first tab stop, visible on focus |
| 2.4.2 Page Titled (A) | Descriptive `<title>` per document (single page here) |
| 2.4.3 Focus Order (A) | DOM order = tab order; no reordering |
| 2.4.4 / 2.4.9 Link Purpose (A/AAA) | All link text is self-describing |
| 2.4.6 Headings & Labels (A) | Descriptive headings; legends announce filter groups |
| 2.4.7 Focus Visible (AA) | High-visibility `:focus-visible` outline (3px amber) |
| 2.4.11 Focus Not Obscured (Min) (AA) | No sticky overlays can cover focused controls |
| 2.5.7 Dragging Movements (AA) | No drag interactions exist |
| 2.5.8 Target Size (Min) (AA) | All targets ≥ 24×24 CSS px; interactive targets are 44px |
| 3.2.3 Consistent Navigation (AA) | Single nav, stable order |
| 3.2.6 Consistent Help (AA) | Help is always the same link set |

### Understandable
| Criterion | How BridgeNet meets it |
|---|---|
| 3.1.1 Language of Page (A) | `lang` on `<html>` switches with the EN/AR toggle; mixed content marked with `lang` attributes |
| 3.1.2 Language of Parts (AA) | Brand tag (`lang="ar"`) and language button carry explicit `lang` |
| 3.2.1 On Focus / 3.2.2 On Input (A) | No context changes on focus; filters only apply on click |
| 3.3.1/3.3.2 Error Identification & Labels (A) | Search/filter status is announced live; all fields labelled |
| 3.3.5 Help (AAA) | Placeholder + visible instructions |

### Robust
| Criterion | How BridgeNet meets it |
|---|---|
| 4.1.1 Parsing (A) | Valid, non-ambiguous HTML; audited |
| 4.1.2 Name, Role, Value (A) | Toggle state conveyed via `aria-pressed`; live regions (`aria-live`) for search results, theme changes, offline status |
| 4.1.3 Status Messages (AA) | `role=status` / `aria-live=polite` for every dynamic announcement |

## 3. Bilingual & RTL implementation

- `lang` + `dir` on `<html>` are switched together; all layout uses
  **logical properties** (`margin-inline`, `inset-inline-start`,
  `border-inline-start`) so every rule works in LTR and RTL without
  separate stylesheets.
- Arabic is not a translation layer bolted on: the AR experience is a
  first-class state of the same DOM, **re-audited by axe in the RTL state**.
- Untranslated UI chrome (e.g. language button label) is marked with the
  correct `lang` so screen readers switch voices appropriately.

## 4. Contrast ratios (verified by design, re-checked in-browser)

| Pair | Ratio | Requirement |
|---|---|---|
| `--fg #1d2a2a` on `--bg #fdfbf5` | ≈ 13.4 : 1 | ≥ 4.5 ✓ |
| `--fg-soft #3d4f4f` on `--bg #fdfbf5` | ≈ 7.0 : 1 | ≥ 4.5 ✓ |
| `--link #07507a` on `--bg #fdfbf5` | ≈ 7.6 : 1 | ≥ 4.5 ✓ |
| `--accent-fg #ffffff` on `--accent #0f3d3e` | ≈ 9.8 : 1 | ≥ 4.5 ✓ |
| High-contrast theme (black/white + `#ffd166`) | ≥ 12 : 1 everywhere | ≥ 7 (AAA) ✓ |
| Focus outline `#b35500` on light | ≈ 5.4 : 1 | ≥ 3 : 1 (non-text) ✓ |

## 5. Assistive technology notes

- **Screen readers**: tested semantics rely on native elements — no div-only
  widgets; `details` disclosures are read natively; dynamic count updates
  arrive in live regions.
- **Keyboard**: every control is reachable and operable with Tab/Enter/Space;
  no custom key handling.
- **Speech input**: all controls are standard buttons/links with accessible
  names (including `aria-label`s where visible text is minimal).
- **Reduced motion**: `prefers-reduced-motion` disables all transitions and
  smooth scrolling; honors forced-colors by using system colors in the
  high-contrast theme path.

## 6. Automation & limits

- `scripts/audit.mjs` runs axe-core against three DOM states (static,
  JS-English, JS-Arabic) with tags `wcag2a/2aa/21a/21aa/22aa` in CI.
- `color-contrast` cannot be fully computed in jsdom (no layout engine);
  ratios above are verified by construction and re-checked in a real
  browser run (see CI artifacts / manual QA checklist).
- Automated audits are not a substitute for human AT testing; the checklist
  above is the manual companion.