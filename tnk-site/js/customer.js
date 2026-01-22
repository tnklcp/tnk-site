/* TNK Customer Portal — Identity guard + tabs + Netlify-backed data (NO localStorage, fail loudly) */
(async function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const byId = (id) => document.getElementById(id);
  const money = (n) => `$${(Number(n || 0)).toFixed(2)}`;
  const todayISO = () => new Date().toISOString().slice(0, 10);

  // ----- Auth: customer only -----
  function assertCustomer() {
    const role = sessionStorage.getItem("tnk_role") || window.TNKIdentity?.role?.();
    if (role === "customer") return true;
    if (role === "admin") { location.replace("admin.html"); return false; }
    if (role === "employee") { location.replace("employee.html"); return false; }
    location.replace("login-customer.html");
    return false;
  }
  try {
    await window.TNKIdentity?.init?.({ guard: "customer" });
  } catch {}
  if (!assertCustomer()) return;

  byId("cust-logout")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.TNKIdentity?.logout?.();
  });

  const myEmail = () =>
    (sessionStorage.getItem("tnk_user_email") ||
      window.TNKIdentity?.email?.() ||
      window.netlifyIdentity?.currentUser?.()?.email ||
      "").toLowerCase();

  // ----- Strict Collections API (NO local fallback) -----
  async function token() {
    try {
      const t = await window.TNKIdentity?.token?.();
      if (t) return t;
    } catch {}
    try {
      const u = window.netlifyIdentity?.currentUser?.();
      if (!u) return null;
      return await u.jwt(true);
    } catch {
      return null;
    }
  }

  async function tokenStrict() {
    const t = await token();
    if (t) return t;
    throw new Error("No JWT available from Netlify Identity user.");
  }

  async function apiGet(name) {
    const t = await tokenStrict();
    const res = await fetch(`/.netlify/functions/collections?name=${encodeURIComponent(name)}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${t}`
      }
    });
    if (!res.ok) throw new Error(`GET ${name} failed: ${res.status} ${res.statusText}`);
    const j = await res.json();
    return (j && j.data) ?? null;
  }

  async function apiSet(name, data) {
    const t = await tokenStrict();
    const res = await fetch(`/.netlify/functions/collections`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${t}`
      },
      body: JSON.stringify({ name, data })
    });
    if (!res.ok) throw new Error(`PUT ${name} failed: ${res.status} ${res.statusText}`);
  }

  function showFatal(err) {
    console.error(err);
    const root = byId("cust-root") || document.body;
    const div = document.createElement("div");
    div.className = "card";
    div.style.border = "1px solid #e6b6b6";
    div.innerHTML = `
      <h2 style="color:#7b1f1f;margin-top:0;">Data Error</h2>
      <p class="muted">The customer portal could not load/save data from Netlify.</p>
      <pre style="white-space:pre-wrap;background:#fff;border:1px solid #e6b6b6;padding:.75rem;border-radius:10px;">${String(err?.message || err)}</pre>
    `;
    root.prepend(div);
    throw err;
  }

  const KEYS = {
    invoices: "tnk_invoices",
    availability: "tnk_availability",
    cust_prefs: "tnk_cust_prefs",
    cust_extras: "tnk_cust_extras",
    cust_specials: "tnk_cust_specials",
    cust_comments: "tnk_cust_comments",
    history: "tnk_cust_history",
    balances: "tnk_cust_balances"
  };

  // ----- tabs -----
  (function initTabs() {
    const tabs = $$(".tab-btn");
    const panels = $$(".panel, .tab-panel");
    function activate(btn) {
      const id = `panel-${btn.dataset.tab}`;
      tabs.forEach((b) => b.setAttribute("aria-selected", "false"));
      btn.setAttribute("aria-selected", "true");
      panels.forEach((p) => p.classList.remove("active"));
      const target = byId(id);
      if (target) target.classList.add("active");
    }
    tabs.forEach((btn) => btn.addEventListener("click", () => activate(btn)));
    const current = tabs.find((b) => b.getAttribute("aria-selected") === "true") || tabs[0];
    if (current) activate(current);
  })();

  // ----- Stripe checkout -----
  async function startStripeCheckout(invoiceId) {
    const t = await token();
    const res = await fetch("/.netlify/functions/stripe_create_checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(t ? { Authorization: `Bearer ${t}` } : {})
      },
      body: JSON.stringify({ invoiceId })
    });
    if (!res.ok) throw new Error(`Stripe checkout failed: ${res.status} ${res.statusText}`);
    const j = await res.json();
    if (!j?.url) throw new Error(`Stripe checkout failed: missing session url`);
    window.location.assign(j.url);
  }

  // ----- invoices -----
  const invTbody = $("#cust_invoices tbody");
  const invStatus = byId("inv_status");

  async function loadInvoices() { return (await apiGet(KEYS.invoices)) || []; }

  async function renderInvoices() {
    const email = myEmail();
    if (!email) { invStatus.textContent = "Not signed in."; return; }

    const all = await loadInvoices();
    const mine = all.filter((i) => (i.customer_email || "").toLowerCase() === email);

    invTbody.innerHTML =
      mine
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map((i) => {
          const paid = String(i.status || "").toLowerCase() === "paid";
          return `
            <tr data-id="${i.id}">
              <td>${i.number || ""}</td>
              <td>${i.date || ""}</td>
              <td>${i.due || ""}</td>
              <td>${money(i.total)}</td>
              <td>${i.status || ""}</td>
              <td style="display:flex;gap:.5rem;flex-wrap:wrap;">
                <button class="button js-view" type="button">View</button>
                ${paid ? "" : `<button class="button button--primary js-pay" type="button">Pay</button>`}
              </td>
            </tr>`;
        })
        .join("") || `<tr><td colspan="6" class="muted">No invoices yet.</td></tr>`;
  }

  invTbody?.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr"); if (!tr) return;
    const id = tr.dataset.id;

    if (e.target.classList.contains("js-pay")) {
      try {
        e.target.disabled = true;
        e.target.textContent = "Redirecting…";
        await startStripeCheckout(id);
      } catch (err) {
        e.target.disabled = false;
        e.target.textContent = "Pay";
        showFatal(err);
      }
      return;
    }

    if (!e.target.classList.contains("js-view")) return;

    const all = await loadInvoices();
    const inv = all.find((x) => x.id === id);
    if (!inv) return;

    const rows = (inv.items || [])
      .map((it) => `<tr><td>${it.desc || ""}</td><td>${it.qty || 0}</td><td>${money(it.unit || 0)}</td><td>${money((it.qty || 0) * (it.unit || 0))}</td></tr>`)
      .join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${inv.number || "Invoice"}</title>
      <style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:24px;color:#1e2f1e}
      table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #e8e1d6;padding:8px;text-align:left}</style></head>
      <body><h1>${inv.number || ""}</h1><div>${inv.date || ""} • ${inv.status || ""}</div>
      <table><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Amount</th></tr></thead><tbody>${rows || "<tr><td colspan='4'>No items</td></tr>"}</tbody></table>
      <p><strong>Total: ${money(inv.total || 0)}</strong></p></body></html>`;

    const win = window.open("", "_blank");
    win.document.open(); win.document.write(html); win.document.close();
    try { win.focus(); } catch {}
  });

  // ----- balance -----
  async function renderBalance() {
    const email = myEmail();
    const balances = (await apiGet(KEYS.balances)) || {};
    const bal = Number(balances[email] || 0);
    const out = byId("cust_balance");
    if (out) out.textContent = money(bal);
  }

  // ----- preferences -----
  const prefForm = byId("pref-form");
  const prefStatus = byId("pref_status");

  async function loadPrefs() {
    const map = (await apiGet(KEYS.cust_prefs)) || {};
    const email = myEmail();
    return map[email] || { svc: [], storm: [] };
  }
  async function savePrefs(p) {
    const map = (await apiGet(KEYS.cust_prefs)) || {};
    const email = myEmail();
    map[email] = p;
    await apiSet(KEYS.cust_prefs, map);
  }
  async function renderPrefs() {
    const p = await loadPrefs();
    $$('input[name="svc"]').forEach((cb) => (cb.checked = p.svc.includes(cb.value)));
    $$('input[name="storm"]').forEach((cb) => (cb.checked = p.storm.includes(cb.value)));
  }
  prefForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const svc = $$('input[name="svc"]:checked').map((i) => i.value);
    const storm = $$('input[name="storm"]:checked').map((i) => i.value);
    await savePrefs({ svc, storm });
    prefStatus.textContent = "Preferences saved.";
  });

  // ----- extra service -----
  const extraForm = byId("extra-form");
  const extraStatus = byId("extra_status");

  async function loadExtras() {
    const map = (await apiGet(KEYS.cust_extras)) || {};
    const email = myEmail();
    return map[email] || [];
  }
  async function saveExtras(list) {
    const map = (await apiGet(KEYS.cust_extras)) || {};
    const email = myEmail();
    map[email] = list;
    await apiSet(KEYS.cust_extras, map);
  }
  extraForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const list = await loadExtras();
    list.push({
      id: crypto.randomUUID(),
      service: byId("x_service").value.trim(),
      date: byId("x_date").value || "",
      notes: byId("x_notes").value.trim(),
      created_at: new Date().toISOString()
    });
    await saveExtras(list);
    extraStatus.textContent = "Request sent.";
    extraForm.reset();
  });

  // ----- special requests -----
  const spForm = byId("special-form");
  const spStatus = byId("sp_status");

  async function loadSpecials() {
    const map = (await apiGet(KEYS.cust_specials)) || {};
    const email = myEmail();
    return map[email] || [];
  }
  async function saveSpecials(list) {
    const map = (await apiGet(KEYS.cust_specials)) || {};
    const email = myEmail();
    map[email] = list;
    await apiSet(KEYS.cust_specials, map);
  }
  spForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const list = await loadSpecials();
    list.push({ id: crypto.randomUUID(), text: byId("sp_notes").value.trim(), date: todayISO() });
    await saveSpecials(list);
    spStatus.textContent = "Submitted.";
    spForm.reset();
  });

  // ----- comments / history -----
  const cmForm = byId("comment-form");
  const cmStatus = byId("cmpl_status");
  const cmSel = byId("cmpl_service");

  async function loadHistory() {
    const map = (await apiGet(KEYS.history)) || {};
    const email = myEmail();
    return map[email] || [];
  }
  async function refreshHistorySelect() {
    const hist = await loadHistory();
    cmSel.innerHTML =
      hist.map((h) => `<option value="${h.id}">${h.date} • ${h.type}</option>`).join("") ||
      '<option value="">No history</option>';
  }
  async function renderHistory() {
    const hist = await loadHistory();
    $("#cust_history tbody").innerHTML =
      hist
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map((h) => `<tr><td>${h.date}</td><td>${h.type}</td><td>${h.notes || ""}</td><td>${h.tech || ""}</td></tr>`)
        .join("") || '<tr><td colspan="4" class="muted">No services yet.</td></tr>';
  }

  async function loadComments() {
    const map = (await apiGet(KEYS.cust_comments)) || {};
    const email = myEmail();
    return map[email] || [];
  }
  async function saveComments(list) {
    const map = (await apiGet(KEYS.cust_comments)) || {};
    const email = myEmail();
    map[email] = list;
    await apiSet(KEYS.cust_comments, map);
  }
  async function renderComments() {
    const rows = (await loadComments())
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((c) => `<tr><td>${c.date}</td><td>${c.service || ""}</td><td>${c.text || ""}</td><td>${c.status || "submitted"}</td></tr>`)
      .join("") || '<tr><td colspan="4" class="muted">No comments yet.</td></tr>';
    $("#cust_comments tbody").innerHTML = rows;
  }

  cmForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = cmSel.value;
    if (!id) { cmStatus.textContent = "No service selected."; return; }
    const hist = await loadHistory();
    const svc = hist.find((h) => h.id === id);
    const list = await loadComments();
    list.push({
      id: crypto.randomUUID(),
      service_id: id,
      service: svc ? svc.type : "",
      text: byId("cmpl_text").value.trim(),
      date: todayISO(),
      status: "submitted"
    });
    await saveComments(list);
    cmStatus.textContent = "Comment sent.";
    cmForm.reset();
    await renderComments();
  });

  // ----- availability -----
  const slotsWrap = byId("cust_slots");

  async function renderAvailability() {
    const slots = (await apiGet(KEYS.availability)) || [];
    if (!slots.length) { slotsWrap.innerHTML = '<p class="muted">No open slots published yet.</p>'; return; }
    slotsWrap.innerHTML = slots
      .sort((a, b) => (a.date < b.date ? -1 : 1) || (a.start || "").localeCompare(b.start || ""))
      .map((s) => `
          <div class="slot">
            <div>${s.date} • ${s.start || ""}${s.end ? "–" + s.end : ""}</div>
            <div><button class="button js-pick" data-pick='${JSON.stringify(s)}'>Pick</button></div>
          </div>`)
      .join("");
  }

  slotsWrap?.addEventListener("click", (e) => {
    const pick = e.target?.dataset?.pick;
    if (!pick) return;
    try {
      const slot = JSON.parse(pick);
      const el = byId("x_date");
      el.value = slot.date || "";
      const tabBtn = document.querySelector('[data-tab="extras"]');
      if (tabBtn) tabBtn.click();
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {}
  });

  // ----- init -----
  (async function init() {
    try {
      const email = myEmail();
      if (!email) throw new Error("No logged-in user email found in session/identity.");

      // After returning from Stripe, refresh invoices so status can show paid (webhook updates).
      const qs = new URLSearchParams(location.search);
      if (qs.get("stripe") === "success") {
        invStatus.textContent = "Payment received. Updating invoices…";
      }

      await renderInvoices();
      await renderBalance();
      await renderPrefs();
      await refreshHistorySelect();
      await renderComments();
      await renderHistory();
      await renderAvailability();
    } catch (e) {
      showFatal(e);
    }
  })();
})();
