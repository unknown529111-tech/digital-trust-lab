/* CoThink frontend — renders suggestions, routes human decisions to the
 * server, maintains the local interaction log and working document.
 * State mirrors to localStorage (cothink_state_v1) so a refresh keeps work. */
"use strict";

(function () {
  const STATE_KEY = "cothink_state_v1";
  const $ = (id) => document.getElementById(id);
  const queue = $("queue");
  const queueStatus = $("queue-status");
  const docView = $("document-view");
  const logList = $("log-list");
  const providers = new Map(); // suggestionId -> {model, uncertainty, uncertaintyNote, finishReason}

  let state = { threadId: "", applied: [], log: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || "null");
    if (saved && saved.threadId) state = saved;
  } catch (e) { /* fresh state */ }
  if (!state.threadId) {
    state.threadId = (crypto.randomUUID ? crypto.randomUUID() : "t-" + Date.now());
    persist();
  }

  function persist() { try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) {} }
  function announce(msg) {
    const el = $("announce");
    if (el) { el.textContent = ""; requestAnimationFrame(() => { el.textContent = msg; }); }
  }

  function fmt(ts) { return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }

  function logEvent(entry) {
    state.log.push(entry);
    persist();
    const li = document.createElement("li");
    li.textContent = `[${fmt(entry.ts)}] ${entry.type} — ${entry.detail}`;
    logList.prepend(li);
  }

  /* ---------- provider status ---------- */

  fetch("/api/health").then((r) => r.json()).then((h) => {
    const el = $("provider-status");
    if (h.hasProvider) { el.textContent = "Live provider configured"; el.setAttribute("data-provider", "live"); }
    else {
      el.textContent = "DEMO MODE — no API key, suggestions are canned";
      el.setAttribute("data-provider", "demo");
    }
  }).catch(() => {
    $("provider-status").textContent = "Server unreachable — start with: npm start";
  });

  /* ---------- ask ---------- */

  const taskInput = $("task");
  taskInput.addEventListener("input", () => {
    $("task-count").textContent = `${taskInput.value.length} / 2000`;
  });

  $("ask-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const task = taskInput.value.trim();
    if (!task) return;
    $("ask-error").textContent = "";
    $("ask-btn").disabled = true;
    $("ask-btn").textContent = "Thinking…";
    try {
      const resp = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, threadId: state.threadId }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "request failed");
      renderCard(data.suggestion);
      taskInput.value = "";
      $("task-count").textContent = "0 / 2000";
      logEvent({ ts: Date.now(), type: "suggestion_created", detail: `from ${data.suggestion.model} (uncertainty ${data.suggestion.uncertainty ?? "not reported"})` });
      announce("New suggestion awaiting your decision.");
    } catch (e) {
      $("ask-error").textContent = e.message;
    } finally {
      $("ask-btn").disabled = false;
      $("ask-btn").textContent = "Ask for a suggestion";
    }
  });

  /* ---------- rendering ---------- */

  function renderCard(sugg) {
    providers.set(sugg.id, sugg);
    queueStatus.textContent = state.log.filter((l) => l.type === "suggestion_created").length
      + " suggestion(s) in this session.";

    const card = document.createElement("article");
    card.className = "card";
    card.dataset.status = sugg.status;
    card.setAttribute("aria-label", "Suggestion awaiting decision");
    card.tabIndex = -1;

    const head = document.createElement("div");
    head.className = "card-head";
    const badge = document.createElement("span");
    badge.className = "model-badge";
    badge.textContent = sugg.model + (sugg.source === "demo-mode" ? " (demo)" : "");
    badge.setAttribute("aria-label", "Produced by model " + sugg.model);
    head.appendChild(badge);
    const when = document.createElement("span");
    when.textContent = fmt(sugg.createdAt);
    head.appendChild(when);
    const finish = document.createElement("span");
    finish.textContent = "finish: " + sugg.finishReason;
    head.appendChild(finish);
    card.appendChild(head);

    const body = document.createElement("p");
    body.className = "card-body";
    body.textContent = sugg.text;
    card.appendChild(body);

    if (sugg.uncertainty !== null && sugg.uncertainty !== undefined) {
      const unc = document.createElement("div");
      unc.className = "uncertainty";
      const label = document.createElement("p");
      label.className = "uncertainty-label";
      label.textContent = `Model-reported uncertainty: ${Math.round(sugg.uncertainty * 100)}%`;
      unc.appendChild(label);
      const bar = document.createElement("div");
      bar.className = "uncertainty-bar";
      const fill = document.createElement("div");
      fill.className = "uncertainty-fill";
      fill.style.width = Math.round(sugg.uncertainty * 100) + "%";
      bar.appendChild(fill);
      unc.appendChild(bar);
      card.appendChild(unc);
      if (sugg.uncertaintyNote) {
        const note = document.createElement("p");
        note.className = "hint";
        note.textContent = "Note: " + sugg.uncertaintyNote;
        card.appendChild(note);
      }
    } else {
      const none = document.createElement("p");
      none.className = "uncertainty-label";
      none.textContent = "Model did not report uncertainty.";
      card.appendChild(none);
    }

    if (sugg.biasFlags && sugg.biasFlags.length) {
      const ul = document.createElement("ul");
      ul.className = "flags";
      ul.setAttribute("aria-label", "Heuristic risk flags — automated, not formal evaluation");
      sugg.biasFlags.forEach((f) => {
        const li = document.createElement("li");
        li.textContent = f.label;
        ul.appendChild(li);
      });
      card.appendChild(ul);
    } else {
      const none = document.createElement("p");
      none.className = "hint";
      none.textContent = "No heuristic risk flags matched. (Heuristic only — not a formal bias evaluation.)";
      card.appendChild(none);
    }

    /* Decisions */
    const actions = document.createElement("div");
    actions.className = "card-actions";

    const approve = document.createElement("button");
    approve.type = "button";
    approve.className = "primary";
    approve.textContent = "Approve — add to document";
    approve.addEventListener("click", () => decide(sugg.id, "approved", card, ""));
    actions.appendChild(approve);

    const reject = document.createElement("button");
    reject.type = "button";
    reject.className = "ghost";
    reject.textContent = "Reject";
    reject.addEventListener("click", () => showVeto(sugg.id, card));
    actions.appendChild(reject);
    card.appendChild(actions);

    queue.prepend(card);
    card.focus({ preventScroll: false });
  }

  function showVeto(id, card) {
    const existing = card.querySelector(".veto-reason");
    if (existing) { existing.querySelector("input").focus(); return; }
    const wrap = document.createElement("div");
    wrap.className = "veto-reason";
    const label = document.createElement("label");
    label.setAttribute("for", "veto-" + id);
    label.textContent = "Why are you rejecting this? (required — it becomes part of the audit log)";
    const input = document.createElement("input");
    input.id = "veto-" + id;
    input.type = "text";
    input.maxLength = 2000;
    input.setAttribute("aria-describedby", "veto-err-" + id);
    const err = document.createElement("p");
    err.className = "error";
    err.id = "veto-err-" + id;
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "danger";
    confirm.textContent = "Confirm rejection";
    confirm.addEventListener("click", () => {
      const reason = input.value.trim();
      if (reason.length < 3) { err.textContent = "Please state a reason (at least 3 characters)."; input.focus(); return; }
      decide(id, "rejected", card, reason);
    });
    wrap.append(label, input, err, confirm);
    card.appendChild(wrap);
    input.focus();
  }

  async function decide(id, decision, card, reason) {
    const buttons = card.querySelectorAll("button");
    buttons.forEach((b) => { b.disabled = true; });
    try {
      const resp = await fetch("/api/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: state.threadId, suggestionId: id, decision, reason, actor: "human" }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "decision failed");
      finishDecision(id, decision, card, reason);
    } catch (e) {
      buttons.forEach((b) => { b.disabled = false; });
      const err = document.createElement("p");
      err.className = "error";
      err.textContent = e.message;
      card.appendChild(err);
    }
  }

  function finishDecision(id, decision, card, reason) {
    const sugg = providers.get(id);
    card.dataset.status = decision;
    card.querySelector(".card-actions").remove();
    const badge = document.createElement("span");
    badge.className = "status-badge";
    badge.dataset.status = decision;
    badge.textContent = decision === "approved" ? "✔ Approved by human" : "✖ Rejected by human";
    card.querySelector(".card-head").appendChild(badge);
    if (decision === "rejected") {
      const q = document.createElement("blockquote");
      q.className = "veto-blockquote";
      q.textContent = "Human reason: " + reason;
      card.appendChild(q);
    }

    if (decision === "approved") {
      const block = document.createElement("block");
      const meta = document.createElement("p");
      meta.className = "meta";
      meta.textContent = `From ${sugg.model} · approved by human at ${fmt(Date.now())} · uncertainty ${sugg.uncertainty !== null && sugg.uncertainty !== undefined ? Math.round(sugg.uncertainty * 100) + "%" : "not reported"}`;
      const text = document.createElement("p");
      text.textContent = sugg.text;
      block.append(meta, text);
      docView.querySelector(".hint")?.remove();
      docView.appendChild(block);
      state.applied.push({ id, model: sugg.model, ts: Date.now(), text: sugg.text });
      persist();
      logEvent({ ts: Date.now(), type: "suggestion_approved", detail: `model ${sugg.model} added to document` });
      announce("Suggestion approved and added to the document.");
    } else {
      logEvent({ ts: Date.now(), type: "suggestion_rejected", detail: `reason: ${reason}` });
      announce("Suggestion rejected — reason recorded in the log.");
    }
  }

  /* ---------- export ---------- */

  $("export-log").addEventListener("click", () => {
    const payload = { exportedAt: new Date().toISOString(), threadId: state.threadId, log: state.log, applied: state.applied };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cothink-log-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    announce("Interaction log exported.");
  });

  /* ---------- restore prior session ---------- */
  state.applied.forEach((a) => {
    const block = document.createElement("block");
    const meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent = `From ${a.model} · approved by human at ${fmt(a.ts)}`;
    const text = document.createElement("p");
    text.textContent = a.text;
    block.append(meta, text);
    docView.querySelector(".hint")?.remove();
    docView.appendChild(block);
  });
  state.log.forEach((l) => {
    const li = document.createElement("li");
    li.textContent = `[${fmt(l.ts)}] ${l.type} — ${l.detail}`;
    logList.appendChild(li);
  });
})();