# TrustVault — Zero-Knowledge Vault

**Tier 2 · Trust, Privacy & Security**

A client-side encrypted vault with **no server, no accounts, no tracking**:
your secrets are sealed with AES-256-GCM under a key derived from your
passphrase via PBKDF2-HMAC-SHA-256 (**600,000 iterations** — OWASP-aligned),
and never leave your device. The page's CSP even blocks outbound network
connections (`connect-src 'none'`): there is literally no channel for the
data to leak through.

## Features

- Zero-knowledge by construction: titles, usernames, secrets, notes — all ciphertext
- Per-entry random IV + **AEAD entry-binding** (swapping/reordering entries is detected)
- Non-extractable key, wiped from memory on **auto-lock** (1/5/15 min) or manual lock
- Strong password generator (crypto-RNG, all classes, no ambiguous chars)
- **Clipboard auto-clear** 10 s after copying a secret
- Encrypted export/import (JSON), two-step confirmation on import & delete
- No-JS nothing to leak: the app refuses to run without WebCrypto (`noscript` note)

## Run

```bash
npm install
npm run serve      # http://localhost:4174 — fully offline-capable
```

## Verify

```bash
npm test    # 15 tests: crypto, tamper, AAD swap, UI flows, auto-lock
```

## Docs

- [STRIDE threat model + OWASP 2025 mapping](docs/THREAT-MODEL.md)

## Files

```
js/crypto.mjs      # pure crypto core (browser + node:test)
js/vault-app.js    # DI-wired UI layer (jsdom-tested)
index.html         # CSP-hardened, semantic, keyboard-usable
test/              # crypto + end-to-end UI suites
```