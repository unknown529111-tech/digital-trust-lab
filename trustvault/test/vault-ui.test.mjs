import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { initTrustVault } from "../js/vault-app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

// Poll for a condition instead of sleeping a fixed amount: key derivation
// (PBKDF2, 600k iterations) and storage writes take variable time depending
// on the machine, so fixed delays are flaky (this exact test once failed on
// a faster CI runner while passing locally).
async function delayUntil(cond, { timeout = 8000, step = 10, label = "condition" } = {}) {
  const start = Date.now();
  for (;;) {
    let ok = false;
    try { ok = cond(); } catch { /* element may be mid-render — keep polling */ }
    if (ok) return;
    if (Date.now() - start > timeout) {
      throw new Error(`timed out waiting for ${label}`);
    }
    await new Promise((r) => setTimeout(r, step));
  }
}

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
    await delayUntil(() => !window.document.getElementById("vault-panel").hidden, { label: "vault panel open" });
    await delayUntil(() => !window.document.getElementById("entries-empty").hidden, { label: "empty state visible" });
    // A persisted (encrypted) vault document must exist — and contain no plaintext secret.
    const raw = window.localStorage.getItem("trustvault_vault_v1");
    const doc = JSON.parse(raw);
    assert.equal(doc.v, 1);
    assert.ok(doc.kdf.salt.length > 0);
    assert.equal(doc.entries.length, 1); // only the probe entry
    assert.ok(!raw.includes("staple"), "ciphertext storage must not leak the passphrase");
  } finally {
    await new Promise((r) => setTimeout(r, 40)); // let trailing microtasks settle
    dom.window.close();
  }
});

test("wrong passphrase is rejected, correct one unlocks", async () => {
  const { dom, window } = makeApp();
  try {
    window.document.getElementById("passphrase").value = PW;
    window.document.getElementById("unlock-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
    await delayUntil(() => !window.document.getElementById("vault-panel").hidden, { label: "vault panel open" });

    window.document.getElementById("lock-now").click(); // lock again
    await delayUntil(() => window.document.getElementById("vault-panel").hidden, { label: "vault panel locked" });

    window.document.getElementById("passphrase").value = PW + "-wrong";
    window.document.getElementById("unlock-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
    await delayUntil(() => /Wrong passphrase/i.test(window.document.getElementById("unlock-error").textContent), { label: "wrong-passphrase error" });
    assert.equal(window.document.getElementById("vault-panel").hidden, true);

    window.document.getElementById("passphrase").value = PW;
    window.document.getElementById("unlock-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
    await delayUntil(() => !window.document.getElementById("vault-panel").hidden, { label: "re-unlock" });
  } finally {
    await new Promise((r) => setTimeout(r, 40));
    dom.window.close();
  }
});

test("add entry, reveal, delete (two-step confirm), lock", async () => {
  const { dom, window } = makeApp();
  try {
    // Unlock
    window.document.getElementById("passphrase").value = PW;
    window.document.getElementById("unlock-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
    await delayUntil(() => !window.document.getElementById("vault-panel").hidden, { label: "vault panel open" });

    // Add entry
    window.document.getElementById("new-entry").click();
    window.document.getElementById("e-title").value = "Email";
    window.document.getElementById("e-username").value = "me@example.com";
    window.document.getElementById("e-secret").value = "s3cr3t-λ";
    window.document.getElementById("entry-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
    await delayUntil(() => window.document.querySelectorAll(".entry").length === 1, { label: "entry rendered" });

    const raw = window.localStorage.getItem("trustvault_vault_v1");
    assert.ok(!raw.includes("s3cr3t"), "stored ciphertext must not contain the plaintext secret");
    assert.ok(!raw.includes("me@example"), "stored ciphertext must not contain the username");

    // Reveal
    const reveal = window.document.querySelector(".entry .entry-actions button");
    reveal.click();
    await delayUntil(() => !!window.document.querySelector(".secret-text"), { label: "secret revealed" });
    assert.ok(window.document.querySelector(".secret-text").textContent.includes("s3cr3t"));

    // Delete — first click arms, second confirms
    const del = window.document.querySelectorAll(".entry .entry-actions button")[2];
    del.click();
    assert.equal(del.textContent, "Confirm?");
    del.click();
    await delayUntil(() => window.document.querySelectorAll(".entry").length === 0, { label: "entry deleted" });

    // Lock clears the session
    window.document.getElementById("lock-now").click();
    await delayUntil(() => window.document.getElementById("vault-panel").hidden, { label: "vault panel locked" });
    assert.match(window.document.getElementById("lock-status").textContent, /Locked/);
  } finally {
    await new Promise((r) => setTimeout(r, 40));
    dom.window.close();
  }
});

test("auto-lock fires after the configured idle window", async () => {
  const { dom, window } = makeApp({ autoLockMs: 40 });
  try {
    window.document.getElementById("passphrase").value = PW;
    window.document.getElementById("unlock-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
    await delayUntil(() => !window.document.getElementById("vault-panel").hidden, { label: "vault panel open" });
    await delayUntil(() => window.document.getElementById("vault-panel").hidden, { timeout: 6000, label: "auto-lock fires" });
    assert.match(window.document.getElementById("lock-status").textContent, /Locked/);
  } finally {
    await new Promise((r) => setTimeout(r, 40));
    dom.window.close();
  }
});