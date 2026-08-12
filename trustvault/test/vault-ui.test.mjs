import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { initTrustVault } from "../js/vault-app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function makeApp({ autoLockMs = 60_000 } = {}) {
  const dom = new JSDOM(html, { url: "https://trustvault.local/", pretendToBeVisual: true });
  const { window } = dom;
  const app = initTrustVault({ storage: window.localStorage, win: window, autoLockMs });
  return { dom, window, app };
}

const PW = "correct horse battery staple";

test("first run: vault created, unlock succeeds, empty state shown", async () => {
  const { dom, window } = makeApp();
  try {
    assert.equal(window.document.getElementById("unlock-panel").hidden, false);
    window.document.getElementById("passphrase").value = PW;
    window.document.getElementById("unlock-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
    await delay(120);
    assert.equal(window.document.getElementById("vault-panel").hidden, false, "vault panel should open");
    assert.equal(window.document.getElementById("entries-empty").hidden, false, "empty state visible");
    // A persisted (encrypted) vault document must exist — and contain no plaintext secret.
    const raw = window.localStorage.getItem("trustvault_vault_v1");
    const doc = JSON.parse(raw);
    assert.equal(doc.v, 1);
    assert.ok(doc.kdf.salt.length > 0);
    assert.equal(doc.entries.length, 1); // only the probe entry
    assert.ok(!raw.includes("staple"), "ciphertext storage must not leak the passphrase");
  } finally { dom.window.close(); }
});

test("wrong passphrase is rejected, correct one unlocks", async () => {
  const { dom, window } = makeApp();
  try {
    window.document.getElementById("passphrase").value = PW;
    window.document.getElementById("unlock-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
    await delay(120);
    window.document.getElementById("lock-now").click(); // lock again
    await delay(30);

    window.document.getElementById("passphrase").value = PW + "-wrong";
    window.document.getElementById("unlock-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
    await delay(120);
    const err = window.document.getElementById("unlock-error").textContent;
    assert.match(err, /Wrong passphrase/i);
    assert.equal(window.document.getElementById("vault-panel").hidden, true);

    window.document.getElementById("passphrase").value = PW;
    window.document.getElementById("unlock-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
    await delay(120);
    assert.equal(window.document.getElementById("vault-panel").hidden, false);
  } finally { dom.window.close(); }
});

test("add entry, reveal, delete (two-step confirm), lock", async () => {
  const { dom, window } = makeApp();
  try {
    // Unlock
    window.document.getElementById("passphrase").value = PW;
    window.document.getElementById("unlock-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
    await delay(120);

    // Add entry
    window.document.getElementById("new-entry").click();
    window.document.getElementById("e-title").value = "Email";
    window.document.getElementById("e-username").value = "me@example.com";
    window.document.getElementById("e-secret").value = "s3cr3t-λ";
    window.document.getElementById("entry-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
    await delay(120);

    assert.equal(window.document.querySelectorAll(".entry").length, 1);
    const raw = window.localStorage.getItem("trustvault_vault_v1");
    assert.ok(!raw.includes("s3cr3t"), "stored ciphertext must not contain the plaintext secret");
    assert.ok(!raw.includes("me@example"), "stored ciphertext must not contain the username");

    // Reveal
    const reveal = window.document.querySelector(".entry .entry-actions button");
    reveal.click();
    await delay(20);
    assert.ok(window.document.querySelector(".secret-text").textContent.includes("s3cr3t"));

    // Delete — first click arms, second confirms
    const del = window.document.querySelectorAll(".entry .entry-actions button")[2];
    del.click();
    assert.equal(del.textContent, "Confirm?");
    del.click();
    await delay(20);
    assert.equal(window.document.querySelectorAll(".entry").length, 0);

    // Lock clears the session
    window.document.getElementById("lock-now").click();
    assert.equal(window.document.getElementById("vault-panel").hidden, true);
    assert.match(window.document.getElementById("lock-status").textContent, /Locked/);
  } finally { dom.window.close(); }
});

test("auto-lock fires after the configured idle window", async () => {
  const { dom, window } = makeApp({ autoLockMs: 40 });
  try {
    window.document.getElementById("passphrase").value = PW;
    window.document.getElementById("unlock-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
    await delay(120);
    assert.equal(window.document.getElementById("vault-panel").hidden, false);
    await delay(120); // > 40ms idle
    assert.equal(window.document.getElementById("vault-panel").hidden, true, "auto-lock should fire");
    assert.match(window.document.getElementById("lock-status").textContent, /Locked/);
  } finally { dom.window.close(); }
});