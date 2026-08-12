# TrustVault — Threat Model & Security Analysis

**Tier 2 · Trust, Privacy & Security in a Digital World**

Applies: **STRIDE** (spoofing, tampering, repudiation, information
disclosure, DoS, elevation of privilege) and the **OWASP Top 10: 2025**
(which supersedes the 2021 list) to a zero-knowledge, client-side encrypted vault.

## 1. System model

| Layer | Asset | Where it lives |
|---|---|---|
| A. Master passphrase | User secret | Human memory only; typed into the page; never stored or transmitted |
| B. Derived AES key | 256-bit key | **Memory only**, non-extractable (`extractable: false`), wiped on lock |
| C. Ciphertext entries | `{iv, ct}` per entry | localStorage on the user's device; exportable as a JSON file |
| D. Vault document | JSON wrapper (salt, iterations, entries) | localStorage / exported file |
| E. Clipboard | Revealed secrets (transient) | OS clipboard for ≤ 10 s, then programmatically cleared |
| F. DOM / session | Decrypted entries | Memory only while unlocked; `cache` cleared on lock |

Attack surface: the browser (XSS, extensions, devtools), the OS (shoulder
surfing, malware, device theft), and the network (**none**: this page's CSP
sets `connect-src 'none'` — the application physically cannot make outbound
requests).

## 2. STRIDE analysis

### S — Spoofing
| Threat | Assessment | Countermeasure |
|---|---|---|
| Attacker substitutes a vault file expecting it to decrypt | High risk | Probe entry + AAD binding: any foreign document fails probe validation on unlock (or on import) |

### T — Tampering
| Threat | Assessment | Countermeasure |
|---|---|---|
| Bit-flip a ciphertext / IV in storage | **Mitigated** | AES-GCM 128-bit auth tag: any modification fails decryption with an explicit error (tested: `tampered IV`, `tampered ciphertext`) |
| Swap two entries' ciphertexts (reorder attack) | **Mitigated** | Every entry is encrypted with `additionalData = "trustvault:v1:" + entryId` — decrypting ciphertext under a different id fails (tested: `entry swapping across ids`) |
| Downgrade KDF iterations in the stored doc | **Mitigated** | Iterations are read from the doc — but a modified doc also fails the probe; docs created by this app always use 600,000 |

### R — Repudiation
| Threat | Assessment | Countermeasure |
|---|---|---|
| "I never stored that" | Residual/noted | Vault doc carries `updatedAt`; threat model documents that a client-side app cannot offer cryptographic non-repudiation — device-level backups are the user's control |

### I — Information Disclosure
| Threat | Assessment | Countermeasure |
|---|---|---|
| Server / provider / network snooping reads secrets | **Mitigated** | No server, no network calls (`connect-src 'none'`), no telemetry, no accounts |
| localStorage theft (device compromise) | **Mitigated at rest** | Everything is ciphertext; titles/usernames/notes included (tested: raw storage contains no plaintext) |
| Clipboard leakage | Partially mitigated | Auto-clear after 10 s; noted limitation: browsers cannot guarantee clipboard erasure |
| Shoulder surfing | Residual | "Reveal" is opt-in per entry; entries render with secrets hidden by default |
| Memory dump of the live tab | Residual | Key is non-extractable (cannot be `exportKey`'d); strings in JS cannot be zeroed — documented residual |
| XSS | **Mitigated** | No `innerHTML` with user data anywhere: all rendering uses `textContent`/`createElement`; CSP (`script-src 'self'`, no inline) — plus `connect-src 'none'` removes the exfiltration channel |
| Extensions / devtools | Out of scope | A compromised browser cannot be defended against — stated, not assumed away |

### D — Denial of Service
| Threat | Assessment | Countermeasure |
|---|---|---|
| localStorage quota / clearing | Low | Export/import flow; failures surface a visible warning (`storage unavailable`) |
| Brute-force passphrase offline (attacker steals the file) | Rate-limited only by KDF cost | PBKDF2-SHA-256, **600,000 iterations** (OWASP Password Storage Cheat Sheet); a strong 16+ char passphrase is the real control — UI says so explicitly |

### E — Elevation of Privilege
| Threat | Assessment | Countermeasure |
|---|---|---|
| App writes outside its origin | **Mitigated** | Only `localStorage` under its own origin; import validates document shape before replacing |
| Key export | **Mitigated** | `CryptoKey` created with `extractable: false` — API call `exportKey` throws (tested) |

## 3. OWASP Top 10: 2025 mapping

| OWASP 2025 | Status in TrustVault |
|---|---|
| A01 Broken Access Control | **N/A by construction** — no accounts, no roles, no server |
| A02 Cryptographic Failures | **Directly addressed** — AES-256-GCM, PBKDF2 600k, per-entry IV, AAD binding; no homegrown crypto |
| A03 Injection | **N/A** — no SQL/template engine; all DOM writes are `textContent` |
| A04 Insecure Design | **Addressed** — threat model IS the design doc; zero-knowledge posture from first principles |
| A05 Security Misconfiguration | **Addressed** — restrictive CSP, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` |
| A06 Vulnerable & Outdated Components | **Addressed** — zero runtime dependencies; no supply chain beyond the browser's own crypto |
| A07 Identification & Authentication Failures | **Addressed** — passphrase authentication via key-derivation (no stored hashes, no credential database to leak) |
| A08 Software & Data Integrity Failures | **Addressed** — import validates structure + probe before adoption; AAD prevents silent data substitution |
| A09 Server-Side Request Forgery | **N/A** — no server, no URL fetch paths |
| A10 Logging & Monitoring Failures | **N/A / documented** — privacy by design means *no* logs exist to leak; the absence is deliberate and stated |

## 4. Guarantees vs. residual risks (honest limits)

**Guaranteed by construction (and tests):**
- Plaintext never leaves the browser. There is no channel (CSP: `connect-src 'none'`).
- Stored data is unreadable without the passphrase; tampering is detected.
- The key cannot be exported from the WebCrypto API.

**Residual (documented, not hidden):**
- A compromised browser/OS/extensions defeats client-side guarantees.
- JS strings (passphrase, decrypted cache) live in memory and *cannot* be
  zeroed — the application wipes references on lock, GC reclaims later.
- Clipboard auto-clear is best-effort (OS/browser dependent).
- Passphrase strength is the ultimate control: a 4-word passphrase
  (~44 bits entropy) is worth more than any code change.

## 5. Test evidence

`npm test` — 15 tests:
`base64url roundtrip · key non-extractable AES-256-GCM · roundtrip ·
wrong-passphrase · tampered IV · tampered ciphertext · AAD swap detection ·
doc shape · UUID v4 · generator classes/uniqueness · UI: first-run ·
wrong-then-correct unlock · add/reveal/delete/lock · auto-lock ·`