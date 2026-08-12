/* TrustVault crypto core — pure module (runs in browser AND in node:test).
 *
 * Design (privacy by design):
 *   - Master key is derived from the passphrase via PBKDF2-HMAC-SHA-256 with
 *     600,000 iterations (OWASP Password Storage Cheat Sheet recommendation)
 *     and a per-vault random 16-byte salt.
 *   - Entries are encrypted with AES-256-GCM, 96-bit random IV per entry,
 *     128-bit auth tag. The key is non-extractable and lives only in memory.
 *   - Each ciphertext is bound to its entry id via AEAD additionalData, so
 *     swapping entries inside a vault is detected as a decryption failure.
 *   - The server never sees plaintext: there is no server. Storage is
 *     localStorage on the user's device (exportable as a JSON file).
 *
 * Format (vault doc):
 *   { v: 1, kdf: { it: 600000, salt: <b64url> }, updatedAt: <epoch-ms>,
 *     entries: [ { id: <uuid>, iv: <b64url>, ct: <b64url> } ] }
 */

const VERSION = 1;
export const KDF_ITERATIONS = 600_000; // OWASP PBKDF2-HMAC-SHA256 (2023+)
const AAD_PREFIX = "trustvault:v1:";

/* ---------- base64url helpers (no padding) ---------- */

export function toB64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/* ---------- key derivation ---------- */

export async function deriveKey(passphrase, saltBytes, iterations = KDF_ITERATIONS) {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey(
    "raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,                    // non-extractable: raw key bytes can never be exported
    ["encrypt", "decrypt"]
  );
}

/* ---------- entry encryption ---------- */

export async function encryptEntry(key, entryId, plaintext) {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = enc.encode(AAD_PREFIX + entryId);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, enc.encode(plaintext));
  return { iv: toB64url(iv), ct: toB64url(new Uint8Array(ct)) };
}

/** Throws (AES-GCM authentication failure) on any tampering: wrong key, altered
 *  IV, altered ciphertext, or entry swapped across ids. */
export async function decryptEntry(key, entryId, entry) {
  const enc = new TextEncoder();
  const aad = enc.encode(AAD_PREFIX + entryId);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64url(entry.iv), additionalData: aad },
    key,
    fromB64url(entry.ct)
  );
  return new TextDecoder().decode(plain);
}

/* ---------- vault document (serialization is plain JSON) ---------- */

export function createVaultDoc(saltBytes) {
  return { v: VERSION, kdf: { it: KDF_ITERATIONS, salt: toB64url(saltBytes) }, updatedAt: Date.now(), entries: [] };
}

export function newEntryId() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function jsonEncode(vault) { return JSON.stringify(vault); }
export function jsonDecode(text) { return JSON.parse(text); }

/* ---------- strong password generator (crypto RNG, ambiguous chars removed) ---------- */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+";
const REQUIRED = [new RegExp("[A-Z]"), new RegExp("[a-z]"), new RegExp("[0-9]"), new RegExp("[^A-Za-z0-9]")];

export function generatePassword(length = 20) {
  if (length < 8) throw new RangeError("password too short");
  let pw = "";
  for (let i = 0; i < length; i++) {
    pw += ALPHABET[crypto.getRandomValues(new Uint32Array(1))[0] % ALPHABET.length];
  }
  // Guarantee one of each character class, then shuffle (Fisher–Yates, crypto RNG).
  const classes = ["A", "a", "2", "!@#$-_=+"];
  for (let i = 0; i < classes.length; i++) {
    const c = classes[i][crypto.getRandomValues(new Uint32Array(1))[0] % classes[i].length];
    pw = pw.slice(0, i) + c + pw.slice(i + 1);
  }
  const arr = pw.split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const out = arr.join("");
  if (!REQUIRED.every((re) => re.test(out))) return generatePassword(length); // paranoid retry
  return out;
}