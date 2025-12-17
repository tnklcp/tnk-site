/* TNK Customer Portal — Identity guard + tabs + Netlify-backed data (NO localStorage, FAIL LOUDLY) */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const byId = (id) => document.getElementById(id);
  const money = (n) => `$${(Number(n || 0)).toFixed(2)}`;
  const todayISO = () => new Date().toISOString().slice(0, 10);

  function fail(msg, err) {
    console.error("[Customer]", msg, err || "");
    const el = byId("global_error");
    if (el) {
      el.textContent = msg;
      el.style.display = "block";
    } else {
      alert(msg);
    }
  }

  function requireRoleCustomer() {
    const role = window.TNKIdentity?.role?.() || sessionStorage.getItem("tnk_role");
    if (role === "customer") return true;
    if (role === "admin") { location.replace("admin.html"); return false; }
    if (role === "employee") { location.replace("employee.html"); return false; }
    location.replace("login-customer.html");
    return false;
  }
  if (!requireRoleCustomer()) return;

  byId("cust-logout")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.TNKIdentity?.logout?.();
  });

  const myEmail = () => (sessionStorage.getItem("tnk_user_email") || window.TNKIdentity?.email?.() || "").toLowerCase();

  async function jwt() {
    const token = await window.TNKIdentity?.token?.();
    if (!token) throw new Error("Not authenticated.");
    return token;
  }

  async function fetchJSON(url, opts = {}) {
    const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    const token = await jwt();
    headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { ...opts, headers });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
  }

  const API = {
    async get(name) {
      const res = await fetch(`/.netlify/functions/collections?name=${encodeURIComponent(name)}`, {
        headers: { "Content-Type": "application/json" }
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`GET ${name} failed: HTTP ${res.status}: ${text || res.statusText}`);
      }
      const j = await res.json();
      return j?.data ?? null;
    },
    async set(name, data) {
      await fetchJSON(`/.netlify/functions/collections`, {
        method: "PUT",
        body: JSON.stringify({ name, data })
      });
    }
  };

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

  // Tabs
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

  // Invoices
  const invTbody = $("#cust_invoices tbody");
  const invStatus = byId("inv_status");

  async function renderInvoices() {
    const email = myEmail();
    if (!email) throw new Error("Missing customer email in session.");

    const all = (await API.get(KEYS.invoices)) || [];
    const mine = all.filter((i) => (i.customer_email || "").toLowerCase() === email);

    invTbody.innerHTML =
      mine
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map((i) => `
          <tr data-id="${i.id}">
            <td>${i.number}</td><td>${i.date || ""}</td><td>${i.due || ""}</td>
            <td>${money(i.total)}</td><td>${i.status}</td>
            <td><button class="button js-view">View</button></td>
          </tr>`)
        .join("") || `<tr><td colspan="6" class="muted">No invoices yet.</td></tr>`;

    invStatus.textContent = mine.length ? "" : "No invoices yet.";
  }

  invTbody?.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr"); if (!tr) return;
    if (!e.target.classList.contains("js-view")) return;

    try {
      const all = (await API.get(KEYS.invoices)) || [];
      const inv = all.find((x) => x.id === tr.dataset.id);
      if (!inv) return;

      const rows = (inv.items || [])
        .map((it) => `<tr><td>${it.desc || ""}</td><td>${it.qty || 0}</td><td>${money(it.unit || 0)}</td><td>${money((it.qty || 0) * (it.unit || 0))}</td></tr>`)
        .join("");

      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${inv.number}</title>
        <style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:24px;color:#1e2f1e}
        table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #e8e1d6;padding:8px;text-align:left}</style></head>
        <body><h1>${inv.number}</h1><div>${inv.date || ""} • ${inv.status}</div>
        <table><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Amount</th></tr></thead><tbody>${rows || "<tr><td colspan='4'>No items</td></tr>"}</tbody></table>
        <p><strong>Total: ${money(inv.total || 0)}</strong></p></body></html>`;

      const win = window.open("", "_blank");
      win.document.open(); win.document.write(html); win.document.close();
      try { win.focus(); } catch {}
    } catch (err) {
      fail("Could not open invoice view. Check console.", err);
    }
  });

  // Balance
  async function renderBalance() {
    const email = myEmail();
    const balances = (await API.get(KEYS.balances)) || {};
    byId("cust_balance").textContent = money(Number(balances[email] || 0));
  }

  // Preferences
  const prefForm = byId("pref-form");
  const prefStatus = byId("pref_status");

  async function loadPrefs() {
    const map = (await API.get(KEYS.cust_prefs)) || {};
    return map[myEmail()] || { svc: [], storm: [] };
  }

  async function savePrefs(p) {
    const map = (await API.get(KEYS.cust_prefs)) || {};
    map[myEmail()] = p;
    await API.set(KEYS.cust_prefs, map);
  }

  async function renderPrefs() {
    const p = await loadPrefs();
    $$('input[name="svc"]').forEach((cb) => (cb.checked = p.svc.includes(cb.value)));
    $$('input[name="storm"]').forEach((cb) => (cb.checked = p.storm.includes(cb.value)));
  }

  prefForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const svc = $$('input[name="svc"]:checked').map((i) => i.value);
      const storm = $$('input[name="storm"]:checked').map((i) => i.value);
      await savePrefs({ svc, storm });
      prefStatus.textContent = "Preferences saved.";
    } catch (err) {
      fail("Failed to save preferences.", err);
    }
  });

  // Extra service
  const extraForm = byId("extra-form");
  const extraStatus = byId("extra_status");

  async function loadExtras() {
    const map = (await API.get(KEYS.cust_extras)) || {};
    return map[myEmail()] || [];
  }
  async function saveExtras(list) {
    const map = (await API.get(KEYS.cust_extras)) || {};
    map[myEmail()] = list;
    await API.set(KEYS.cust_extras, map);
  }

  extraForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
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
    } catch (err) {
      fail("Failed to send extra service request.", err);
    }
  });

  // Special requests
  const spForm = byId("special-form");
  const spStatus = byId("sp_status");

  async function loadSpecials() {
    const map = (await API.get(KEYS.cust_specials)) || {};
    return map[myEmail()] || [];
  }
  async function saveSpecials(list) {
    const map = (await API.get(KEYS.cust_specials)) || {};
    map[myEmail()] = list;
    await API.set(KEYS.cust_specials, map);
  }

  spForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const list = await loadSpecials();
      list.push({ id: crypto.randomUUID(), text: byId("sp_notes").value.trim(), date: todayISO() });
      await saveSpecials(list);
      spStatus.textContent = "Submitted.";
      spForm.reset();
    } catch (err) {
      fail("Failed to submit special request.", err);
    }
  });

  // History + comments
  const cmForm = byId("comment-form");
  const cmStatus = byId("cmpl_status");
  const cmSel = byId("cmpl_service");

  async function loadHistory() {
    const map = (await API.get(KEYS.history)) || {};
    return map[myEmail()] || [];
  }
  async function refreshHistorySelect() {
    const hist = await loadHistory();
    cmSel.innerHTML =
      hist.map((h) => `<option value="${h.id}">${h.date} • ${h.type}</option>`).join("") ||
      '<option value="">No history</option>';
  }

  async function loadComments() {
    const map = (await API.get(KEYS.cust_comments)) || {};
    return map[myEmail()] || [];
  }
  async function saveComments(list) {
    const map = (await API.get(KEYS.cust_comments)) || {};
    map[myEmail()] = list;
    await API.set(KEYS.cust_comments, map);
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
    try {
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
    } catch (err) {
      fail("Failed to submit comment.", err);
    }
  });

  async function renderHistory() {
    const hist = await loadHistory();
    $("#cust_history tbody").innerHTML =
      hist
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map((h) => `<tr><td>${h.date}</td><td>${h.type}</td><td>${h.notes || ""}</td><td>${h.tech || ""}</td></tr>`)
        .join("") || '<tr><td colspan="4" class="muted">No services yet.</td></tr>';
  }

  // Availability
  const slotsWrap = byId("cust_slots");
  async function renderAvailability() {
    const slots = (await API.get(KEYS.availability)) || [];
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

  // Init
  (async function init() {
    try {
      await renderInvoices();
      await renderBalance();
      await renderPrefs();
      await refreshHistorySelect();
      await renderComments();
      await renderHistory();
      await renderAvailability();
    } catch (err) {
      fail("Customer portal failed to load data (Netlify function / auth).", err);
    }
  })();
})();
