/* TrustVault — UI + session state.
 * Architecture: crypto lives in crypto.mjs (pure, tested). This module wires
 * DOM events to it. `initTrustVault(deps)` is dependency-injected so the
 * full user flow is testable under jsdom (node:test).
 */
import {
  deriveKey, encryptEntry, decryptEntry, createVaultDoc, newEntryId,
  jsonEncode, jsonDecode, generatePassword, toB64url, fromB64url,
} from "./crypto.mjs";

const DOC_KEY = "trustvault_vault_v1";
const PROBE_ID = "__probe__";
const CLIPBOARD_CLEAR_MS = 10_000;

export function initTrustVault(deps) {
  const {
    storage = globalThis.localStorage,
    win = globalThis,
    docKey = DOC_KEY,
    autoLockMs = null, // test hook; defaults to <select> value
  } = deps || {};

  const $ = (id) => win.document.getElementById(id);
  const announce = (msg) => { const el = $("vault-msg"); if (el) el.textContent = msg; };
  const announceErr = (el, msg) => { if (el) el.textContent = msg; };

  let vaultDoc = null;      // encrypted document (persisted)
  let key = null;           // non-extractable AES key, memory only
  let cache = new Map();    // entryId -> decrypted plaintext (session only)
  let lockTimer = null;
  let copyTimer = null;

  const unlockPanel = $("unlock-panel");
  const vaultPanel = $("vault-panel");
  const lockStatus = $("lock-status");
  const lockNow = $("lock-now");
  const passphraseInput = $("passphrase");
  const unlockForm = $("unlock-form");
  const unlockError = $("unlock-error");
  const firstRunHint = $("first-run-hint");
  const entriesList = $("entries-list");
  const entriesEmpty = $("entries-empty");
  const entryCount = $("entry-count");
  const entryFormPanel = $("entry-form-panel");
  const entryForm = $("entry-form");
  const entryError = $("entry-error");
  const lockTimerSelect = $("lock-timer");
  const exportBtn = $("export");
  const importBtn = $("import");
  const importFile = $("import-file");

  /* ---------- persistence ---------- */

  function loadDoc() {
    try {
      const raw = storage.getItem(docKey);
      return raw ? jsonDecode(raw) : null;
    } catch { return null; }
  }

  function saveDoc() {
    try {
      vaultDoc.updatedAt = Date.now();
      storage.setItem(docKey, jsonEncode(vaultDoc));
    } catch (e) {
      announce("Warning: could not persist the vault (storage unavailable).");
    }
  }

  /* ---------- lock lifecycle ---------- */

  function resetLockTimer() {
    if (lockTimer !== null) win.clearTimeout(lockTimer);
    if (key === null) return;
    const ms = autoLockMs ?? (parseInt(lockTimerSelect?.value, 10) || 300) * 1000;
    lockTimer = win.setTimeout(lock, ms);
  }

  function lock() {
    if (lockTimer !== null) { win.clearTimeout(lockTimer); lockTimer = null; }
    if (copyTimer !== null) { win.clearTimeout(copyTimer); copyTimer = null; }
    key = null;
    cache.clear();
    vaultPanel.hidden = true;
    unlockPanel.hidden = false;
    lockStatus.setAttribute("data-state", "locked");
    lockStatus.textContent = "Locked";
    lockNow.hidden = true;
    passphraseInput.value = "";
    win.setTimeout(() => passphraseInput.focus(), 0);
  }

  /* ---------- unlock ---------- */

  async function unlock(passphrase) {
    unlockError.textContent = "";
    const existing = loadDoc();
    const saltBytes = existing
      ? fromB64url(existing.kdf.salt)
      : crypto.getRandomValues(new Uint8Array(16));

    vaultDoc = existing || createVaultDoc(saltBytes);
    key = await deriveKey(passphrase, saltBytes, vaultDoc.kdf.it);

    if (!existing) {
      // Brand-new vault: seed a random probe entry used for passphrase validation.
      const probePlain = toB64url(crypto.getRandomValues(new Uint8Array(32)));
      vaultDoc.entries.push({ id: PROBE_ID, ...(await encryptEntry(key, PROBE_ID, probePlain)) });
      saveDoc();
      firstRunHint.hidden = true;
    } else {
      const probe = vaultDoc.entries.find((e) => e.id === PROBE_ID);
      if (!probe) throw new Error("vault-corrupt");
      await decryptEntry(key, PROBE_ID, probe); // throws on wrong passphrase/tamper
    }

    cache.clear();
    for (const e of vaultDoc.entries) {
      if (e.id === PROBE_ID) continue;
      cache.set(e.id, await decryptEntry(key, e.id, e));
    }

    unlockPanel.hidden = true;
    vaultPanel.hidden = false;
    lockStatus.setAttribute("data-state", "unlocked");
    lockStatus.textContent = "Unlocked — key in memory only";
    lockNow.hidden = false;
    renderEntries();
    announce(`Vault unlocked with ${cache.size} entr${cache.size === 1 ? "y" : "ies"}.`);
    resetLockTimer();
  }

  /* ---------- entry operations ---------- */

  function renderEntries() {
    entriesList.textContent = "";
    const entries = vaultDoc.entries.filter((e) => e.id !== PROBE_ID);
    entryCount.textContent = `(${entries.length})`;
    entriesEmpty.hidden = entries.length > 0;

    for (const e of entries) {
      const plain = cache.get(e.id);
      const li = win.document.createElement("li");
      li.className = "entry";

      const info = win.document.createElement("div");
      info.className = "entry-info";
      const title = win.document.createElement("p");
      title.className = "entry-title";
      title.textContent = plain.title || "Untitled";
      info.appendChild(title);
      if (plain.username) {
        const sub = win.document.createElement("p");
        sub.className = "entry-sub";
        sub.textContent = plain.username;
        info.appendChild(sub);
      }
      li.appendChild(info);

      const actions = win.document.createElement("div");
      actions.className = "entry-actions";

      const reveal = mkBtn("Reveal", "Reveal or hide this secret");
      reveal.addEventListener("click", () => {
        const shown = reveal.getAttribute("aria-pressed") === "true";
        reveal.setAttribute("aria-pressed", shown ? "false" : "true");
        reveal.textContent = shown ? "Reveal" : "Hide";
        if (shown) {
          const old = actions.querySelector(".secret-text");
          if (old) old.remove();
        } else {
          const sec = win.document.createElement("p");
          sec.className = "secret-text";
          sec.textContent = plain.secret || "";
          actions.insertBefore(sec, reveal);
          announce("Secret revealed.");
        }
      });
      actions.appendChild(reveal);

      const copy = mkBtn("Copy", `Copy the secret for ${plain.title || "this entry"}`);
      copy.addEventListener("click", async () => {
        if (!plain.secret) { announce("This entry has no secret to copy."); return; }
        try { await win.navigator.clipboard.writeText(plain.secret); }
        catch { legacyCopy(plain.secret, win); }
        announce(`Copied — clipboard clears in ${CLIPBOARD_CLEAR_MS / 1000} seconds.`);
        if (copyTimer !== null) win.clearTimeout(copyTimer);
        copyTimer = win.setTimeout(() => { try { win.navigator.clipboard.writeText(""); } catch { /* best effort */ } }, CLIPBOARD_CLEAR_MS);
      });
      actions.appendChild(copy);

      const del = mkBtn("Delete", `Delete ${plain.title || "this entry"}`);
      del.addEventListener("click", () => {
        if (del.textContent !== "Confirm?") {
          del.textContent = "Confirm?";
          del.classList.add("delete-confirm");
          win.setTimeout(() => {
            if (del.textContent === "Confirm?") {
              del.textContent = "Delete";
              del.classList.remove("delete-confirm");
            }
          }, 4000);
          return;
        }
        vaultDoc.entries = vaultDoc.entries.filter((x) => x.id !== e.id);
        cache.delete(e.id);
        saveDoc();
        renderEntries();
        announce("Entry deleted.");
        resetLockTimer();
      });
      actions.appendChild(del);

      li.appendChild(actions);
      entriesList.appendChild(li);
    }
  }

  function mkBtn(text, label) {
    const b = win.document.createElement("button");
    b.type = "button";
    b.className = "ghost";
    b.textContent = text;
    b.setAttribute("aria-label", label);
    return b;
  }

  function legacyCopy(text, w) {
    const ta = w.document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "absolute";
    ta.style.opacity = "0";
    w.document.body.appendChild(ta);
    ta.select();
    try { w.document.execCommand("copy"); } catch { /* unsupported */ }
    ta.remove();
  }

  /* ---------- events ---------- */

  unlockForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const pw = passphraseInput.value;
    if (!pw) { announceErr(unlockError, "Enter your master passphrase."); return; }
    $("unlock-submit").disabled = true;
    try {
      await unlock(pw);
    } catch (err) {
      announceErr(unlockError, err && err.message === "vault-corrupt"
        ? "Vault data is corrupted."
        : "Wrong passphrase — the vault cannot be decrypted with that key.");
      key = null;
      vaultDoc = null;
    } finally {
      $("unlock-submit").disabled = false;
    }
  });

  $("toggle-passphrase").addEventListener("click", () => {
    const btn = $("toggle-passphrase");
    const shown = btn.getAttribute("aria-pressed") === "true";
    btn.setAttribute("aria-pressed", shown ? "false" : "true");
    btn.textContent = shown ? "Show" : "Hide";
    passphraseInput.type = shown ? "password" : "text";
  });

  lockNow.addEventListener("click", lock);

  // Activity resets the auto-lock countdown (only while unlocked).
  vaultPanel.addEventListener("click", resetLockTimer);
  vaultPanel.addEventListener("keydown", resetLockTimer);
  lockTimerSelect.addEventListener("change", resetLockTimer);

  $("new-entry").addEventListener("click", () => {
    entryForm.reset();
    entryError.textContent = "";
    entryFormPanel.hidden = false;
    $("entry-form-title").textContent = "New entry";
    $("entry-save").textContent = "Save entry";
    $("e-title").focus();
  });

  $("entry-cancel").addEventListener("click", () => { entryFormPanel.hidden = true; });

  entryForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const title = $("e-title").value.trim();
    const secret = $("e-secret").value;
    if (!title || !secret) { announceErr(entryError, "Title and secret are required."); return; }
    const id = newEntryId();
    const plain = JSON.stringify({
      title, username: $("e-username").value.trim(), secret, note: $("e-note").value.trim(),
    });
    const sealed = await encryptEntry(key, id, plain);
    vaultDoc.entries.push({ id, ...sealed });
    cache.set(id, JSON.parse(plain));
    saveDoc();
    entryFormPanel.hidden = true;
    renderEntries();
    announce("Entry saved and encrypted.");
    resetLockTimer();
  });

  $("generate").addEventListener("click", () => {
    const pw = generatePassword();
    $("e-secret").value = pw;
    announce(`Generated a ${pw.length}-character password.`);
  });

  exportBtn.addEventListener("click", () => {
    const blob = new Blob([jsonEncode(vaultDoc)], { type: "application/json" });
    const url = win.URL.createObjectURL(blob);
    const a = win.document.createElement("a");
    a.href = url;
    a.download = `trustvault-${new Date().toISOString().slice(0, 10)}.json`;
    win.document.body.appendChild(a);
    a.click();
    a.remove();
    win.URL.revokeObjectURL(url);
    announce("Encrypted vault exported as a file.");
  });

  // Two-step import: first click arms a warning, second click opens the picker.
  importBtn.addEventListener("click", () => {
    if (importBtn.getAttribute("data-armed") !== "true") {
      importBtn.setAttribute("data-armed", "true");
      importBtn.textContent = "Import — replaces current vault";
      announce("Warning: importing replaces your current vault.");
      win.setTimeout(() => {
        if (importBtn.getAttribute("data-armed") === "true") {
          importBtn.removeAttribute("data-armed");
          importBtn.textContent = "Import";
        }
      }, 5000);
      return;
    }
    importBtn.removeAttribute("data-armed");
    importBtn.textContent = "Import";
    importFile.click();
  });

  importFile.addEventListener("change", async () => {
    const file = importFile.files && importFile.files[0];
    importFile.value = "";
    if (!file) return;
    try {
      const doc = jsonDecode(await file.text());
      if (doc.v !== 1 || !doc.kdf || !Array.isArray(doc.entries)) throw new Error("bad-format");
      const testKey = await deriveKey(passphraseInput.value, fromB64url(doc.kdf.salt), doc.kdf.it);
      const probe = doc.entries.find((e) => e.id === PROBE_ID);
      if (probe) await decryptEntry(testKey, PROBE_ID, probe);
      vaultDoc = doc;
      saveDoc();
      // Re-unlock with the current passphrase against the imported document.
      if (key) { key = null; cache.clear(); }
      await unlock(passphraseInput.value);
      announce("Vault imported and re-encrypted in memory.");
    } catch {
      announce("Import failed: not a valid TrustVault file, or the passphrase does not match.");
    }
  });

  /* ---------- start locked ---------- */
  firstRunHint.hidden = loadDoc() !== null;
  lock();
}

/* Browser bootstrap — skipped when imported under node (tests wire their own DOM). */
if (typeof document !== "undefined" && document.getElementById("unlock-panel")) {
  initTrustVault();
}
