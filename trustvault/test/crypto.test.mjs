import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveKey, encryptEntry, decryptEntry, createVaultDoc, newEntryId,
  toB64url, fromB64url, generatePassword,
} from "../js/crypto.mjs";

const enc = new TextEncoder();
const dec = new TextDecoder();

test("base64url roundtrip", () => {
  const data = crypto.getRandomValues(new Uint8Array(128));
  assert.deepEqual(fromB64url(toB64url(data)), data);
});

test("derived key is AES-256-GCM and non-extractable", async () => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey("correct horse battery staple", salt);
  assert.equal(key.algorithm.name, "AES-GCM");
  assert.equal(key.algorithm.length, 256);
  assert.equal(key.extractable, false);
  assert.deepEqual(key.usages.sort(), ["decrypt", "encrypt"]);
});

test("encrypt/decrypt roundtrip preserves plaintext", async () => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey("passphrase", salt);
  const entry = await encryptEntry(key, "entry-1", "top secret");
  const back = await decryptEntry(key, "entry-1", entry);
  assert.equal(back, "top secret");
});

test("wrong passphrase fails authentication", async () => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyA = await deriveKey("correct passphrase", salt);
  const keyB = await deriveKey("wrong passphrase", salt);
  const entry = await encryptEntry(keyA, "e", "secret");
  await assert.rejects(decryptEntry(keyB, "e", entry), /decryption|operation/i);
});

test("tampered IV fails authentication", async () => {
  const key = await deriveKey("pw", crypto.getRandomValues(new Uint8Array(16)));
  const entry = await encryptEntry(key, "e", "secret");
  const iv = fromB64url(entry.iv);
  iv[0] ^= 0x01;
  await assert.rejects(decryptEntry(key, "e", { iv: toB64url(iv), ct: entry.ct }));
});

test("tampered ciphertext fails authentication", async () => {
  const key = await deriveKey("pw", crypto.getRandomValues(new Uint8Array(16)));
  const entry = await encryptEntry(key, "e", "secret");
  const ct = fromB64url(entry.ct);
  ct[0] ^= 0x80;
  await assert.rejects(decryptEntry(key, "e", { iv: entry.iv, ct: toB64url(ct) }));
});

test("entry swapping across ids is detected (AAD binding)", async () => {
  const key = await deriveKey("pw", crypto.getRandomValues(new Uint8Array(16)));
  // Attacker moves entry A's ciphertext into entry B's slot: id stayed B.
  const a = await encryptEntry(key, "entry-a", "A's secret");
  await assert.rejects(decryptEntry(key, "entry-b", a));
});

test("vault document shape is stable", () => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const doc = createVaultDoc(salt);
  assert.equal(doc.v, 1);
  assert.equal(doc.kdf.it, 600_000);
  assert.equal(doc.kdf.salt, toB64url(salt));
  assert.deepEqual(doc.entries, []);
});

test("newEntryId is a v4-shaped uuid and unique", () => {
  const ids = new Set(Array.from({ length: 1000 }, newEntryId));
  assert.equal(ids.size, 1000);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("generatePassword meets all character classes and length", () => {
  const ALPHA = /^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()\-_=+]+$/;
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const pw = generatePassword();
    assert.equal(pw.length, 20);
    assert.match(pw, /[A-Z]/);
    assert.match(pw, /[a-z]/);
    assert.match(pw, /[0-9]/);
    assert.match(pw, /[^A-Za-z0-9]/);
    assert.match(pw, ALPHA);
    seen.add(pw);
  }
  assert.ok(seen.size > 190, "passwords should be effectively unique");
});

test("generatePassword rejects absurdly short lengths", () => {
  assert.throws(() => generatePassword(4), RangeError);
});