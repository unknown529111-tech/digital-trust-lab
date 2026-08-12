/* VeriLoop frontend — renders proposals, claim verdicts, the evidence graph,
 * routes human decisions to the server, maintains the model dashboard, the
 * working document, and the interaction log.
 * State mirrors to localStorage (veriloop_state_v1) so a refresh keeps work. */
"use strict";

(function () {
  const STATE_KEY = "veriloop_state_v1";
  const $ = (id) => document.getElementById(id);
  const queue = $("queue");
  const queueStatus = $("queue-status");
  const docView = $("document-view");
  const logList = $("log-list");
  const dashBody = $("dash-body");
  const providers = new Map(); // suggestionId -> suggestion payload

  let state = { threadId: "", applied: [], log: [], verifications: [] };
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
      el.textContent = "DEMO MODE — the confident-but-wrong scenario is active";
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
    $("ask-btn").textContent = "Working…";
    try {
      const resp = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, threadId: state.threadId }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "request failed");
      recordVerification(data.suggestion);
      renderCard(data.suggestion);
      taskInput.value = "";
      $("task-count").textContent = "0 / 2000";
      const v = data.suggestion.verification;
      logEvent({
        ts: Date.now(), type: "suggestion_created",
        detail: `from ${data.suggestion.model} | verification ${v.status.toUpperCase()} (${v.counts.supported}✓ ${v.counts.partial}◐ ${v.counts.unsupported}✗ ${v.counts.contradicted}⚡)`,
      });
      announce(`New suggestion — verification ${v.status}. Review the claims before deciding.`);
    } catch (e) {
      $("ask-error").textContent = e.message;
    } finally {
      $("ask-btn").disabled = false;
      $("ask-btn").textContent = "Ask — proposal + evidence";
    }
  });

  /* ---------- dashboard ---------- */

  function recordVerification(sugg) {
    state.verifications.push({
      model: sugg.model + (sugg.source === "demo-mode" ? " (demo)" : ""),
      status: sugg.verification.status,
      counts: { ...sugg.verification.counts },
      conflicts: !!sugg.verification.conflicts,
      ts: Date.now(),
    });
    persist();
    renderDashboard();
  }

  function renderDashboard() {
    if (!state.verifications.length) return;
    const rows = new Map();
    for (const v of state.verifications) {
      const r = rows.get(v.model) || { model: v.model, n: 0, claims: 0, s: 0, p: 0, u: 0, c: 0, worst: 0 };
      r.n += 1;
      r.claims += v.counts.supported + v.counts.partial + v.counts.unsupported + v.counts.contradicted;
      r.s += v.counts.supported; r.p += v.counts.partial;
      r.u += v.counts.unsupported; r.c += v.counts.contradicted;
      const w = v.counts.contradicted ? 4 : v.counts.unsupported ? 3 : v.status === "failed" ? 2 : v.counts.partial ? 1 : 0;
      r.worst = Math.max(r.worst, w);
      rows.set(v.model, r);
    }
    dashBody.innerHTML = "";
    for (const r of rows.values()) {
      const tr = document.createElement("tr");
      const cell = (txt, cls) => { const td = document.createElement("td"); td.textContent = txt; if (cls) td.className = cls; return td; };
      tr.append(
        cell(r.model),
        cell(String(r.n)),
        cell(String(r.claims)),
        cell(String(r.s), "cell-good"),
        cell(String(r.p), r.p ? "cell-warn" : ""),
        cell(String(r.u), r.u ? "cell-bad" : ""),
        cell(String(r.c), r.c ? "cell-bad" : ""),
        cell(["PASSED", "PARTIAL", "FAILED", "UNSUPPORTED", "CONTRADICTED"][r.worst], r.worst >= 3 ? "cell-bad" : r.worst ? "cell-warn" : "cell-good"),
      );
      dashBody.appendChild(tr);
    }
  }

  /* ---------- rendering ---------- */

  function renderCard(sugg) {
    providers.set(sugg.id, sugg);
    queueStatus.textContent = `${state.verifications.length} suggestion(s) verified this session.`;

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
      label.textContent = `Model-reported confidence: ${Math.round(sugg.uncertainty * 100)}% (self-reported — the claims below are the real test)`;
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
    }

    /* verification layer */
    const verifBox = document.createElement("div");
    verifBox.className = "card-verif";
    renderVerification(sugg, verifBox);
    card.appendChild(verifBox);

    /* bias flags */
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
    }

    /* decisions */
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

    const reverify = document.createElement("button");
    reverify.type = "button";
    reverify.className = "ghost";
    reverify.textContent = "Re-verify with another model";
    reverify.addEventListener("click", () => reverifySuggestion(sugg.id, card, verifBox, reverify));
    actions.appendChild(reverify);

    card.appendChild(actions);
    queue.prepend(card);
    card.focus({ preventScroll: false });
  }

  const VERDICT_LABEL = { supported: "✔ supported", partial: "◐ partial", unsupported: "✖ unsupported", contradicted: "⚡ contradicted" };

  function renderVerification(sugg, verifBox) {
    const v = sugg.verification;
    verifBox.innerHTML = "";

    /* banner */
    const banner = document.createElement("div");
    banner.className = "verification-banner";
    banner.dataset.status = v.status;
    const c = v.counts;
    const headline = v.status === "failed"
      ? "VERIFICATION FAILED — human review required"
      : v.status === "partial"
        ? "VERIFICATION PARTIAL — some claims lack support"
        : "VERIFICATION PASSED — all claims supported";
    const summary = `${c.supported} supported · ${c.partial} partial · ${c.unsupported} unsupported · ${c.contradicted} contradicted`;
    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = summary;
    banner.appendChild(document.createTextNode(headline));
    banner.appendChild(sub);
    if (c.contradicted > 0 || v.conflicts) {
      const conflict = document.createElement("div");
      conflict.className = "sub conflict";
      conflict.textContent = "⚠ Conflicting source detected — at least one source explicitly contradicts a claim.";
      banner.appendChild(conflict);
    }
    verifBox.appendChild(banner);

    /* claims */
    const ul = document.createElement("ul");
    ul.className = "claim-list";
    ul.setAttribute("aria-label", "Claim-by-claim verification");
    v.claims.forEach((claim) => {
      const li = document.createElement("li");
      li.className = "claim";
      li.dataset.verdict = claim.verdict;

      const hd = document.createElement("div");
      hd.className = "claim-head";
      const chip = document.createElement("span");
      chip.className = "verdict-chip";
      chip.dataset.verdict = claim.verdict;
      chip.textContent = VERDICT_LABEL[claim.verdict] || claim.verdict;
      hd.appendChild(chip);
      const text = document.createElement("span");
      text.className = "claim-text";
      text.textContent = claim.text;
      hd.appendChild(text);
      li.appendChild(hd);

      const metaBits = [];
      if (claim.facts && claim.facts.length) metaBits.push("facts: " + claim.facts.map((f) => f.value).join(", "));
      if (claim.hedged) metaBits.push("hedged");
      if (claim.absolutist) metaBits.push("absolutist phrasing");
      if (claim.attribution) metaBits.push("attributed to " + claim.attribution);
      if (metaBits.length) {
        const meta = document.createElement("p");
        meta.className = "claim-meta";
        meta.textContent = metaBits.join(" · ");
        li.appendChild(meta);
      }

      if (claim.evidence && claim.evidence.length) {
        const ev = document.createElement("ul");
        ev.className = "evidence";
        claim.evidence.forEach((e) => {
          const li2 = document.createElement("li");
          const src = document.createElement("span");
          src.className = "src";
          src.textContent = e.source || "unnamed source";
          li2.appendChild(src);
          if (e.contradicts) {
            const flag = document.createElement("span");
            flag.className = "flag";
            flag.textContent = " — ⚡ CONTRADICTS THIS CLAIM";
            li2.appendChild(flag);
            li2.dataset.contradicts = "true";
          }
          if (e.note) {
            const note = document.createElement("div");
            note.textContent = e.note;
            li2.appendChild(note);
          }
          ev.appendChild(li2);
        });
        li.appendChild(ev);
      }
      if (claim.note) {
        const note = document.createElement("p");
        note.className = "claim-note";
        note.textContent = "Note: " + claim.note;
        li.appendChild(note);
      }
      ul.appendChild(li);
    });
    verifBox.appendChild(ul);

    /* evidence graph */
    if (v.claims.some((c) => c.evidence && c.evidence.length)) {
      verifBox.appendChild(buildGraph(sugg));
    }
  }

  /* ---------- evidence graph (SVG, decorative — claims list is the accessible view) ---------- */

  function buildGraph(sugg) {
    const wrap = document.createElement("div");
    wrap.className = "graph-wrap";
    const ns = "http://www.w3.org/2000/svg";
    const W = 760, CLAIM_Y = 84, SRC_Y = 150, BOX_H = 38, ANS_Y = 18;
    const claims = sugg.verification.claims;
    const evidences = claims.flatMap((c) => c.evidence.map((e) => ({ ...e, claimId: c.id })));

    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} 14`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Evidence graph: the AI answer splits into claims, each linked to its evidence sources; contradicting sources are marked in red.");
    svg.setAttribute("style", "max-width:760px");
    const defs = document.createElementNS(ns, "defs");
    const marker = document.createElementNS(ns, "marker");
    marker.setAttribute("id", "arrow");
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "9"); marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "6"); marker.setAttribute("markerHeight", "6");
    marker.setAttribute("orient", "auto-start-reverse");
    const mpath = document.createElementNS(ns, "path");
    mpath.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    mpath.setAttribute("fill", "currentColor");
    marker.appendChild(mpath);
    defs.appendChild(marker);
    svg.appendChild(defs);

    const colorOf = {
      supported: "#1a7a45", partial: "#9a6200", unsupported: "#b3261e", contradicted: "#b3261e",
    };

    const textOf = (s, max) => (s.length > max ? s.slice(0, max - 1) + "…" : s);

    function node(x, y, w, label, color, fill) {
      const g = document.createElementNS(ns, "g");
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", x); rect.setAttribute("y", y);
      rect.setAttribute("width", w); rect.setAttribute("height", BOX_H);
      rect.setAttribute("rx", 6);
      rect.setAttribute("fill", fill || "none");
      rect.setAttribute("stroke", color); rect.setAttribute("stroke-width", 1.5);
      g.appendChild(rect);
      const t = document.createElementNS(ns, "text");
      t.setAttribute("x", x + w / 2); t.setAttribute("y", y + BOX_H / 2 + 4);
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("font-size", 11);
      t.setAttribute("fill", color);
      t.textContent = textOf(label, 34);
      g.appendChild(t);
      return g;
    }

    function edge(x1, y1, x2, y2, color, dashed) {
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", x1); line.setAttribute("y1", y1);
      line.setAttribute("x2", x2); line.setAttribute("y2", y2);
      line.setAttribute("stroke", color); line.setAttribute("stroke-width", 1.4);
      if (dashed) line.setAttribute("stroke-dasharray", "4 3");
      return line;
    }

    // row 0: the AI answer
    const ansW = 240;
    const ansX = (W - ansW) / 2;
    svg.appendChild(node(ansX, ANS_Y, ansW, "AI answer", "#2451c4", "#eef2fb"));

    // row 1: claims
    const n = claims.length;
    const cW = Math.min(200, Math.floor((W - 60) / n));
    const xs = claims.map((_, i) => 30 + i * ((W - 60) / n) + (cW - (W - 60) / n) / 2 + (W - 60) / n / 2 - cW / 2);
    claims.forEach((c, i) => {
      svg.appendChild(node(xs[i], CLAIM_Y, cW, c.text, colorOf[c.verdict], c.verdict === "contradicted" ? "#fdeaea" : c.verdict === "unsupported" ? "#fdf3f2" : "none"));
      svg.appendChild(edge(ansX + ansW / 2, ANS_Y + BOX_H, xs[i] + cW / 2, CLAIM_Y, "#8b8577", false));
    });

    // row 2: evidence sources (one per item, stamped under its claim)
    let rows = 0;
    claims.forEach((c, i) => {
      const items = c.evidence || [];
      items.forEach((e, j) => {
        const sW = Math.min(170, cW - 8);
        const sx = xs[i] + 4;
        const sy = SRC_Y + rows * 52;
        svg.appendChild(node(sx, sy, sW, e.source || "source", e.contradicts ? "#b3261e" : "#1a7a45", e.contradicts ? "#fdeaea" : "#eaf6ef"));
        svg.appendChild(edge(xs[i] + cW / 2, CLAIM_Y + BOX_H, sx + sW / 2, sy, e.contradicts ? "#b3261e" : "#1a7a45", e.contradicts));
        rows += 1;
      });
    });

    svg.setAttribute("viewBox", `0 0 ${W} ${Math.max(SRC_Y + rows * 52 + 20, 130)}`);
    wrap.appendChild(svg);
    const cap = document.createElement("p");
    cap.className = "graph-caption";
    cap.textContent = "Evidence graph — dashed red edge marks a contradicting source. (The claim list above is the screen-reader accessible version.)";
    wrap.appendChild(cap);
    return wrap;
  }

  /* ---------- re-verify ---------- */

  async function reverifySuggestion(id, card, verifBox, btn) {
    btn.disabled = true;
    btn.textContent = "Re-verifying…";
    try {
      const resp = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: state.threadId, suggestionId: id }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "re-verification failed");
      const updated = data.suggestion;
      providers.set(id, updated);
      recordVerification(updated);
      renderVerification(updated, verifBox);
      logEvent({
        ts: Date.now(), type: "suggestion_reverified",
        detail: `${updated.model} → verification ${updated.verification.status.toUpperCase()} (${updated.verification.counts.supported}✓ ${updated.verification.counts.unsupported}✗ ${updated.verification.counts.contradicted}⚡)`,
      });
      announce("Suggestion re-verified with a different model — review the new verdicts.");
    } catch (e) {
      const err = document.createElement("p");
      err.className = "error";
      err.textContent = e.message;
      verifBox.appendChild(err);
    } finally {
      btn.disabled = false;
      btn.textContent = "Re-verify with another model";
    }
  }

  /* ---------- veto flow ---------- */

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
      const v = sugg.verification;
      const block = document.createElement("block");
      const meta = document.createElement("p");
      meta.className = "meta";
      meta.textContent = `From ${sugg.model} · approved by human at ${fmt(Date.now())} · verification ${v.status}: ${v.counts.supported}✓ ${v.counts.partial}◐ ${v.counts.unsupported}✗ ${v.counts.contradicted}⚡ (claims survived/failed as graded)`;
      const text = document.createElement("p");
      text.textContent = sugg.text;
      block.append(meta, text);
      docView.querySelector(".hint")?.remove();
      docView.appendChild(block);
      state.applied.push({ id, model: sugg.model, ts: Date.now(), text: sugg.text, verdict: v.status });
      persist();
      logEvent({ ts: Date.now(), type: "suggestion_approved", detail: `model ${sugg.model} added to document (verification ${v.status})` });
      announce("Suggestion approved and added to the document.");
    } else {
      logEvent({ ts: Date.now(), type: "suggestion_rejected", detail: `reason: ${reason}` });
      announce("Suggestion rejected — reason recorded in the log.");
    }
  }

  /* ---------- export ---------- */

  $("export-log").addEventListener("click", () => {
    const payload = { exportedAt: new Date().toISOString(), threadId: state.threadId, log: state.log, applied: state.applied, verifications: state.verifications };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "veriloop-log-" + new Date().toISOString().slice(0, 10) + ".json";
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
    meta.textContent = `From ${a.model} · approved by human at ${fmt(a.ts)}${a.verdict ? " · verification " + a.verdict : ""}`;
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
  renderDashboard();
})();