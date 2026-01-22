/* TNK Admin Portal — Netlify Identity guard + tabs + Netlify-backed collections (NO localStorage, fail loudly)
   Fixes: PUT 401 by waiting for Identity to be ready BEFORE any writes.
*/
(function () {
  // ----------------- helpers -----------------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const byId = (id) => document.getElementById(id);
  const money = (n) => `$${(Number(n || 0)).toFixed(2)}`;
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

  function showFatal(err) {
    console.error(err);
    const root = byId("admin-root") || document.body;
    const div = document.createElement("div");
    div.className = "admin-card";
    div.style.border = "1px solid #e6b6b6";
    div.style.marginBottom = "1rem";
    div.innerHTML = `
      <h2 style="color:#7b1f1f;margin-top:0;">Admin Portal Init Failed</h2>
      <p class="muted">The admin portal could not load/save data from Netlify.</p>
      <pre style="white-space:pre-wrap;background:#fff;border:1px solid #e6b6b6;padding:.75rem;border-radius:10px;">${String(err?.message || err)}</pre>
    `;
    root.prepend(div);
    throw err;
  }

  // ----------------- Identity readiness (THE FIX) -----------------
  async function waitForIdentityUser({ timeoutMs = 12000 } = {}) {
    // Ensure wrapper is initialized ASAP (safe if already bound)
    if (window.TNKIdentity?.init) {
      try {
        await window.TNKIdentity.init({ guard: "admin" });
      } catch {}
    }

    const start = Date.now();

    // If already available, return immediately
    const immediate = window.netlifyIdentity?.currentUser?.();
    if (immediate) return immediate;

    // Wait for the Identity widget to finish init
    return await new Promise((resolve, reject) => {
      const id = window.netlifyIdentity;
      if (!id || !id.on) return reject(new Error("Netlify Identity widget is not available on this page."));

      const timer = setInterval(() => {
        if (Date.now() - start > timeoutMs) {
          clearInterval(timer);
          reject(new Error("Timed out waiting for Netlify Identity. Are you logged in as an admin?"));
        }
      }, 200);

      // Some builds don’t fire init reliably; also poll for currentUser
      const poll = setInterval(() => {
        const u = id.currentUser?.();
        if (u) {
          clearInterval(poll);
          clearInterval(timer);
          resolve(u);
        }
      }, 150);

      id.on("init", (user) => {
        if (user) {
          clearInterval(poll);
          clearInterval(timer);
          resolve(user);
        }
      });

      // Kick identity init if needed
      try { id.init(); } catch {}
    });
  }

  async function tokenStrict() {
    // Prefer wrapper token if available
    try {
      const t = await window.TNKIdentity?.token?.();
      if (t) return t;
    } catch {}

    const u = await waitForIdentityUser();
    const jwt = await u.jwt(true);
    if (!jwt) throw new Error("No JWT available from Netlify Identity user.");
    return jwt;
  }

  async function readErrorDetail(res) {
    try {
      const text = await res.text();
      if (!text) return "";
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        try {
          const json = JSON.parse(text);
          const msg = json?.message || json?.error || json?.detail;
          return msg ? String(msg) : text.trim();
        } catch {
          return text.trim();
        }
      }
      return text.trim();
    } catch {
      return "";
    }
  }

  // ----------------- Collections API -----------------
  async function apiGet(name, fallback) {
    const t = await tokenStrict();
    const res = await fetch(`/.netlify/functions/collections?name=${encodeURIComponent(name)}`, {
      headers: {
        "Content-Type": "application/json",
        ...(t ? { Authorization: `Bearer ${t}` } : {})
      }
    });
    if (!res.ok) {
      const detail = await readErrorDetail(res);
      throw new Error(`GET ${name} failed: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`);
    }
    const j = await res.json();
    return (j && j.data) ?? fallback;
  }

  async function apiSet(name, data) {
    // IMPORTANT: JWT must be present for PUT
    const t = await tokenStrict();
    const res = await fetch(`/.netlify/functions/collections`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ name, data })
    });
    if (!res.ok) {
      const detail = await readErrorDetail(res);
      throw new Error(`PUT ${name} failed: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`);
    }
  }

  // ----------------- Keys -----------------
  const KEYS = {
    accounts: "tnk_accounts",
    jobs: "tnk_jobs",
    invoices: "tnk_invoices",
    timesheets: "tnk_timesheets",
    paystubs: "tnk_paystubs",
    services: "tnk_services",
    reviews: "tnk_reviews",
    pto: "tnk_pto",
    promos: "tnk_promos",
    prices: "tnk_prices",
    availability: "tnk_availability",
    balances: "tnk_cust_balances"
  };

  // ----------------- Tabs -----------------
  (function initTabs() {
    const tabs = $$(".tab-btn");
    const panels = $$(".tab-panel, .panel");
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

  // ----------------- Accounts -----------------
  const accForm = byId("acc-form");
  const accStatus = byId("acc_status");
  const accTableBody = $("#acc_table tbody");
  const accFilterRole = byId("acc_filter_role");
  const accSearch = byId("acc_search");
  const accReset = byId("acc_reset");

  async function loadAccounts() { return (await apiGet(KEYS.accounts, [])) || []; }
  async function saveAccounts(list) { await apiSet(KEYS.accounts, list); }

  function fillAccountForm(a) {
    byId("acc_id").value = a?.id || "";
    byId("acc_role").value = a?.role || "customer";
    byId("acc_email").value = a?.email || "";
    byId("acc_name").value = a?.name || "";
    byId("acc_phone").value = a?.phone || "";
    byId("acc_address").value = a?.address || "";
  }

  function accountMatches(a) {
    const role = accFilterRole?.value || "all";
    const q = (accSearch?.value || "").toLowerCase().trim();
    if (role !== "all" && (a.role || "") !== role) return false;
    if (!q) return true;
    return (
      String(a.name || "").toLowerCase().includes(q) ||
      String(a.email || "").toLowerCase().includes(q)
    );
  }

  async function renderAccounts() {
    const list = (await loadAccounts()).slice();
    const rows = list
      .filter(accountMatches)
      .sort((a, b) => String(a.role || "").localeCompare(String(b.role || "")) || String(a.email || "").localeCompare(String(b.email || "")))
      .map((a) => `
        <tr data-id="${a.id}">
          <td>${a.role || ""}</td>
          <td>${a.name || ""}</td>
          <td>${a.email || ""}</td>
          <td>${a.phone || ""}</td>
          <td>${a.address || ""}</td>
          <td class="cell-actions">
            <button class="btn-small js-edit">Edit</button>
            <button class="btn-small btn-small--danger js-del">Delete</button>
          </td>
        </tr>
      `)
      .join("");

    accTableBody.innerHTML = rows || `<tr><td colspan="6" class="muted">No accounts.</td></tr>`;

    // Update datalists used elsewhere
    await refreshAccountDatalists(list);
  }

  async function refreshAccountDatalists(accounts) {
    // customers list (schedule, invoices)
    const custs = accounts.filter((a) => a.role === "customer");
    const emps = accounts.filter((a) => a.role === "employee" || a.role === "admin");

    const dlCustomers = byId("admin-customers");
    const dlCustomerEmails = byId("admin-customer-emails");
    const dlEmployees = byId("admin-employees");
    const dlEmpEmails = byId("employee-emails");

    if (dlCustomers) dlCustomers.innerHTML = custs.map((c) => `<option value="${c.email}">${c.name || c.email}</option>`).join("");
    if (dlCustomerEmails) dlCustomerEmails.innerHTML = custs.map((c) => `<option value="${c.email}"></option>`).join("");
    if (dlEmployees) dlEmployees.innerHTML = emps.map((e) => `<option value="${e.email}">${e.name || e.email}</option>`).join("");
    if (dlEmpEmails) dlEmpEmails.innerHTML = emps.map((e) => `<option value="${e.email}"></option>`).join("");

    // invoice filter select
    const invFilterCustomer = byId("f_inv_customer");
    if (invFilterCustomer) {
      const cur = invFilterCustomer.value || "all";
      invFilterCustomer.innerHTML =
        `<option value="all">All Customers</option>` +
        custs
          .sort((a, b) => String(a.email || "").localeCompare(String(b.email || "")))
          .map((c) => `<option value="${c.email}">${c.email}</option>`)
          .join("");
      invFilterCustomer.value = cur;
    }

    // timesheet filter select
    const tsFilterEmail = byId("ts_filter_email");
    if (tsFilterEmail) {
      const cur = tsFilterEmail.value || "all";
      tsFilterEmail.innerHTML =
        `<option value="all">All Employees</option>` +
        emps
          .sort((a, b) => String(a.email || "").localeCompare(String(b.email || "")))
          .map((e) => `<option value="${e.email}">${e.email}</option>`)
          .join("");
      tsFilterEmail.value = cur;
    }
  }

  accForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const id = byId("acc_id").value || uid();
      const role = byId("acc_role").value;
      const email = (byId("acc_email").value || "").trim().toLowerCase();
      const name = (byId("acc_name").value || "").trim();
      const phone = (byId("acc_phone").value || "").trim();
      const address = (byId("acc_address").value || "").trim();

      if (!email) throw new Error("Email required.");

      const list = await loadAccounts();
      const idx = list.findIndex((x) => x.id === id);
      const next = { ...(idx >= 0 ? list[idx] : {}), id, role, email, name, phone, address };

      if (idx >= 0) list[idx] = next;
      else list.push(next);

      await saveAccounts(list);
      accStatus.textContent = "Saved.";
      fillAccountForm(null);
      await renderAccounts();
    } catch (err) {
      accStatus.textContent = String(err?.message || err);
      throw err;
    }
  });

  accReset?.addEventListener("click", () => {
    fillAccountForm(null);
    accStatus.textContent = "";
  });

  accTableBody?.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const id = tr.dataset.id;
    try {
      const list = await loadAccounts();
      const a = list.find((x) => x.id === id);
      if (!a) return;

      if (e.target.classList.contains("js-edit")) {
        fillAccountForm(a);
        accStatus.textContent = "";
      }

      if (e.target.classList.contains("js-del")) {
        const next = list.filter((x) => x.id !== id);
        await saveAccounts(next);
        await renderAccounts();
      }
    } catch (err) {
      showFatal(err);
    }
  });

  accFilterRole?.addEventListener("change", () => renderAccounts().catch(showFatal));
  accSearch?.addEventListener("input", () => renderAccounts().catch(showFatal));

  // ----------------- Jobs (schedule) -----------------
  const jobForm = byId("job-form");
  const jobMsg = byId("job_status_msg");
  const jobReset = byId("job_reset");
  const calWrap = byId("admin-calendar");

  async function loadJobs() { return (await apiGet(KEYS.jobs, [])) || []; }
  async function saveJobs(list) { await apiSet(KEYS.jobs, list); }

  function fillJobForm(j) {
    byId("job_id").value = j?.id || "";
    byId("job_customer").value = j?.customer || "";
    byId("job_title").value = j?.title || "";
    byId("job_date").value = j?.date || "";
    byId("job_start").value = j?.start || "";
    byId("job_end").value = j?.end || "";
    byId("job_assignee").value = j?.assignee || "";
    byId("job_invoice").value = j?.invoice || "";
    byId("job_lat").value = j?.lat || "";
    byId("job_lon").value = j?.lon || "";
    byId("job_risk_rain").value = Number(j?.risk_rain ?? 50);
    byId("job_risk_gust").value = Number(j?.risk_gust ?? 35);
    byId("job_status").value = j?.status || "scheduled";
    byId("job_notes").value = j?.notes || "";
  }

  async function renderCalendar() {
    const jobs = await loadJobs();
    if (!calWrap) return;

    const byDate = new Map();
    for (const j of jobs) {
      const d = j.date || "";
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d).push(j);
    }

    const dates = Array.from(byDate.keys()).filter(Boolean).sort((a, b) => a.localeCompare(b));
    const html = dates.map((d) => {
      const items = (byDate.get(d) || [])
        .sort((a, b) => String(a.start || "").localeCompare(String(b.start || "")))
        .map((j) => `
          <div class="slot" data-id="${j.id}" style="cursor:pointer;">
            <div>
              <strong>${j.start || ""}</strong> ${j.title || ""}
              <div class="muted">${j.customer || ""} ${j.assignee ? "• " + j.assignee : ""}</div>
            </div>
            <div class="muted">${j.status || "scheduled"}</div>
          </div>
        `).join("");
      return `<div class="admin-card" style="margin-bottom:.75rem;"><h3 style="margin:.25rem 0 .5rem;">${d}</h3>${items || '<p class="muted">No jobs</p>'}</div>`;
    }).join("");

    calWrap.innerHTML = html || `<p class="muted">No jobs scheduled yet.</p>`;
  }

  calWrap?.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-id]");
    if (!el) return;
    try {
      const id = el.getAttribute("data-id");
      const jobs = await loadJobs();
      const j = jobs.find((x) => x.id === id);
      if (j) fillJobForm(j);
    } catch (err) {
      showFatal(err);
    }
  });

  jobForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const list = await loadJobs();
      const id = byId("job_id").value || uid();
      const idx = list.findIndex((x) => x.id === id);

      const next = {
        ...(idx >= 0 ? list[idx] : {}),
        id,
        customer: (byId("job_customer").value || "").trim(),
        title: (byId("job_title").value || "").trim(),
        date: byId("job_date").value,
        start: byId("job_start").value,
        end: byId("job_end").value,
        assignee: (byId("job_assignee").value || "").trim(),
        invoice: (byId("job_invoice").value || "").trim(),
        lat: (byId("job_lat").value || "").trim(),
        lon: (byId("job_lon").value || "").trim(),
        risk_rain: Number(byId("job_risk_rain").value || 0),
        risk_gust: Number(byId("job_risk_gust").value || 0),
        status: byId("job_status").value,
        notes: (byId("job_notes").value || "").trim()
      };

      if (!next.customer) throw new Error("Customer is required.");
      if (!next.title) throw new Error("Job title is required.");
      if (!next.date) throw new Error("Date is required.");

      if (idx >= 0) list[idx] = next;
      else list.push(next);

      await saveJobs(list);
      jobMsg.textContent = "Saved.";
      fillJobForm(null);
      await renderCalendar();
    } catch (err) {
      jobMsg.textContent = String(err?.message || err);
      throw err;
    }
  });

  jobReset?.addEventListener("click", () => {
    fillJobForm(null);
    jobMsg.textContent = "";
  });

  // ----------------- Invoices -----------------
  const invForm = byId("inv-form");
  const invMsg = byId("inv_status_msg");
  const invReset = byId("inv_reset");
  const itemsRows = byId("items-rows");
  const addItemBtn = byId("add-item");
  const invTableBody = $("#inv_table tbody");
  const invTotalOut = byId("inv_total");

  const fInvCustomer = byId("f_inv_customer");
  const fInvStatus = byId("f_inv_status");
  const fInvQ = byId("f_inv_q");
  const invExportBtn = byId("inv_export_csv");

  async function loadInvoices() { return (await apiGet(KEYS.invoices, [])) || []; }
  async function saveInvoices(list) { await apiSet(KEYS.invoices, list); }

  function addItemRow(item = {}) {
    const row = document.createElement("div");
    row.className = "items-row";
    row.innerHTML = `
      <input class="it-desc" placeholder="Description" value="${item.desc || ""}">
      <input class="it-qty" type="number" min="0" step="1" value="${Number(item.qty || 0)}">
      <input class="it-unit" type="number" min="0" step="0.01" value="${Number(item.unit || 0)}">
      <button type="button" class="btn-small js-del-item">Remove</button>
    `;
    itemsRows.appendChild(row);
    recalcInvoiceTotal();
  }

  function collectItems() {
    return $$(".items-row", itemsRows).map((r) => {
      const desc = $(".it-desc", r).value.trim();
      const qty = Number($(".it-qty", r).value || 0);
      const unit = Number($(".it-unit", r).value || 0);
      return { desc, qty, unit };
    }).filter((x) => x.desc || x.qty || x.unit);
  }

  function recalcInvoiceTotal() {
    const items = collectItems();
    const subtotal = items.reduce((sum, it) => sum + (Number(it.qty || 0) * Number(it.unit || 0)), 0);
    const taxPct = Number(byId("inv_tax").value || 0);
    const total = subtotal + (subtotal * (taxPct / 100));
    if (invTotalOut) invTotalOut.textContent = money(total);
    return total;
  }

  itemsRows?.addEventListener("input", () => recalcInvoiceTotal());
  itemsRows?.addEventListener("click", (e) => {
    if (!e.target.classList.contains("js-del-item")) return;
    e.target.closest(".items-row")?.remove();
    recalcInvoiceTotal();
  });

  addItemBtn?.addEventListener("click", () => addItemRow());

  function fillInvoiceForm(inv) {
    byId("inv_id").value = inv?.id || "";
    byId("inv_customer").value = inv?.customer_email || "";
    byId("inv_number").value = inv?.number || "";
    byId("inv_status").value = inv?.status || "unpaid";
    byId("inv_date").value = inv?.date || "";
    byId("inv_due").value = inv?.due || "";
    byId("inv_tax").value = Number(inv?.tax || 0);

    if (itemsRows) itemsRows.innerHTML = "";
    (inv?.items || []).forEach(addItemRow);
    if (!inv?.items?.length) addItemRow();

    byId("inv_notes").value = inv?.notes || "";
    recalcInvoiceTotal();
  }

  function invoiceMatches(inv) {
    const cust = fInvCustomer?.value || "all";
    const st = fInvStatus?.value || "all";
    const q = (fInvQ?.value || "").toLowerCase().trim();
    if (cust !== "all" && String(inv.customer_email || "") !== cust) return false;
    if (st !== "all" && String(inv.status || "") !== st) return false;
    if (!q) return true;
    return (
      String(inv.number || "").toLowerCase().includes(q) ||
      String(inv.customer_email || "").toLowerCase().includes(q)
    );
  }

  async function renderInvoices() {
    const list = (await loadInvoices()).slice();
    const rows = list
      .filter(invoiceMatches)
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
      .map((inv) => `
        <tr data-id="${inv.id}">
          <td>${inv.number || ""}</td>
          <td>${inv.customer_email || ""}</td>
          <td>${inv.date || ""}</td>
          <td>${inv.due || ""}</td>
          <td>${money(inv.total || 0)}</td>
          <td>${inv.status || ""}</td>
          <td class="cell-actions">
            <button class="btn-small js-edit">Edit</button>
            <button class="btn-small btn-small--danger js-del">Delete</button>
          </td>
        </tr>
      `).join("");

    invTableBody.innerHTML = rows || `<tr><td colspan="7" class="muted">No invoices.</td></tr>`;
  }

  invForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const list = await loadInvoices();
      const id = byId("inv_id").value || uid();
      const idx = list.findIndex((x) => x.id === id);

      const items = collectItems();
      const total = recalcInvoiceTotal();

      const next = {
        ...(idx >= 0 ? list[idx] : {}),
        id,
        customer_email: (byId("inv_customer").value || "").trim().toLowerCase(),
        number: (byId("inv_number").value || "").trim() || `INV-${String(Date.now()).slice(-6)}`,
        status: byId("inv_status").value || "unpaid",
        date: byId("inv_date").value,
        due: byId("inv_due").value,
        tax: Number(byId("inv_tax").value || 0),
        items,
        total,
        notes: (byId("inv_notes").value || "").trim()
      };

      if (!next.customer_email) throw new Error("Customer email is required.");
      if (!next.date) throw new Error("Invoice date is required.");

      if (idx >= 0) list[idx] = next;
      else list.push(next);

      await saveInvoices(list);
      invMsg.textContent = "Saved.";
      fillInvoiceForm(null);
      await renderInvoices();
    } catch (err) {
      invMsg.textContent = String(err?.message || err);
      throw err;
    }
  });

  invReset?.addEventListener("click", () => {
    fillInvoiceForm(null);
    invMsg.textContent = "";
  });

  invTableBody?.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const id = tr.dataset.id;
    try {
      const list = await loadInvoices();
      const inv = list.find((x) => x.id === id);
      if (!inv) return;

      if (e.target.classList.contains("js-edit")) fillInvoiceForm(inv);

      if (e.target.classList.contains("js-del")) {
        const next = list.filter((x) => x.id !== id);
        await saveInvoices(next);
        await renderInvoices();
      }
    } catch (err) {
      showFatal(err);
    }
  });

  fInvCustomer?.addEventListener("change", () => renderInvoices().catch(showFatal));
  fInvStatus?.addEventListener("change", () => renderInvoices().catch(showFatal));
  fInvQ?.addEventListener("input", () => renderInvoices().catch(showFatal));

  invExportBtn?.addEventListener("click", async () => {
    try {
      const list = (await loadInvoices()).filter(invoiceMatches);
      const header = ["number","customer_email","date","due","total","status"];
      const csv = [header.join(",")]
        .concat(list.map((inv) => header.map((k) => `"${String(inv[k] ?? "").replace(/"/g,'""')}"`).join(",")))
        .join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoices_${todayISO()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showFatal(err);
    }
  });

  // ----------------- Timesheets & Payroll (lightweight) -----------------
  const tsForm = byId("ts-form");
  const tsStatus = byId("ts_status");
  const tsReset = byId("ts_reset");
  const tsTableBody = $("#ts_table tbody");
  const tsFilterEmail = byId("ts_filter_email");
  const tsFrom = byId("ts_filter_from");
  const tsTo = byId("ts_filter_to");
  const tsClear = byId("ts_clear_filters");

  async function loadTimesheets() { return (await apiGet(KEYS.timesheets, [])) || []; }
  async function saveTimesheets(list) { await apiSet(KEYS.timesheets, list); }

  function parseHHMM(t) {
    if (!t) return null;
    const [h, m] = String(t).split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  }

  function hoursBetween(start, end) {
    const s = parseHHMM(start);
    const e = parseHHMM(end);
    if (s == null || e == null) return 0;
    const diff = e - s;
    return diff > 0 ? diff / 60 : 0;
  }

  function entryHours(t) {
    const explicit = Number(t?.hours);
    if (!Number.isNaN(explicit) && explicit > 0) return explicit;
    return hoursBetween(t?.start, t?.end);
  }

  function tsMatches(t) {
    const em = tsFilterEmail?.value || "all";
    const from = tsFrom?.value || "";
    const to = tsTo?.value || "";
    if (em !== "all" && String(t.employee_email || "") !== em) return false;
    if (from && String(t.date || "") < from) return false;
    if (to && String(t.date || "") > to) return false;
    return true;
  }

  function fillTSForm(t) {
    byId("ts_id").value = t?.id || "";
    byId("ts_employee_email").value = t?.employee_email || "";
    byId("ts_date").value = t?.date || "";
    byId("ts_start").value = t?.start || "";
    byId("ts_end").value = t?.end || "";
    byId("ts_notes").value = t?.notes || "";
  }

  async function renderTimesheets() {
    const list = (await loadTimesheets()).filter(tsMatches);
    const rows = list
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
      .map((t) => `
        <tr data-id="${t.id}">
          <td>${t.date || ""}</td>
          <td>${t.employee_email || ""}</td>
          <td>${t.start || ""}</td>
          <td>${t.end || (t.start ? "in progress" : "")}</td>
          <td>${entryHours(t).toFixed(2)}</td>
          <td>${t.notes || ""}</td>
          <td>${t.approved ? "yes" : "no"}</td>
          <td class="cell-actions">
            <button class="btn-small js-edit">Edit</button>
            <button class="btn-small js-toggle">${t.approved ? "Unapprove" : "Approve"}</button>
            <button class="btn-small btn-small--danger js-del">Delete</button>
          </td>
        </tr>
      `).join("");

    tsTableBody.innerHTML = rows || `<tr><td colspan="8" class="muted">No entries.</td></tr>`;
  }

  tsForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const list = await loadTimesheets();
      const id = byId("ts_id").value || uid();
      const idx = list.findIndex((x) => x.id === id);

      const next = {
        ...(idx >= 0 ? list[idx] : {}),
        id,
        employee_email: (byId("ts_employee_email").value || "").trim().toLowerCase(),
        date: byId("ts_date").value,
        start: byId("ts_start").value,
        end: byId("ts_end").value,
        notes: (byId("ts_notes").value || "").trim(),
        approved: (idx >= 0 ? !!list[idx].approved : false)
      };

      if (!next.employee_email) throw new Error("Employee email required.");
      if (!next.date) throw new Error("Date required.");

      if (idx >= 0) list[idx] = next;
      else list.push(next);

      await saveTimesheets(list);
      tsStatus.textContent = "Saved.";
      fillTSForm(null);
      await renderTimesheets();
    } catch (err) {
      tsStatus.textContent = String(err?.message || err);
      throw err;
    }
  });

  tsReset?.addEventListener("click", () => {
    fillTSForm(null);
    tsStatus.textContent = "";
  });

  tsTableBody?.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const id = tr.dataset.id;
    try {
      const list = await loadTimesheets();
      const t = list.find((x) => x.id === id);
      if (!t) return;

      if (e.target.classList.contains("js-edit")) fillTSForm(t);

      if (e.target.classList.contains("js-toggle")) {
        t.approved = !t.approved;
        await saveTimesheets(list);
        await renderTimesheets();
      }

      if (e.target.classList.contains("js-del")) {
        const next = list.filter((x) => x.id !== id);
        await saveTimesheets(next);
        await renderTimesheets();
      }
    } catch (err) {
      showFatal(err);
    }
  });

  [tsFilterEmail, tsFrom, tsTo].forEach((el) => el?.addEventListener("change", () => renderTimesheets().catch(showFatal)));
  tsClear?.addEventListener("click", () => {
    if (tsFilterEmail) tsFilterEmail.value = "all";
    if (tsFrom) tsFrom.value = "";
    if (tsTo) tsTo.value = "";
    renderTimesheets().catch(showFatal);
  });

  // Payroll section (minimal display)
  const prRun = byId("pr_run");
  const prLock = byId("pr_lock");
  const prFrom = byId("pr_from");
  const prTo = byId("pr_to");
  const prStatus = byId("pr_status");
  const prBody = $("#pr_table tbody");

  async function loadPaystubs() { return (await apiGet(KEYS.paystubs, [])) || []; }
  async function savePaystubs(list) { await apiSet(KEYS.paystubs, list); }

  function inRange(d, from, to) {
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }

  async function runPayrollPreview() {
    const from = prFrom?.value || "";
    const to = prTo?.value || "";
    const times = await loadTimesheets();
    const list = times.filter((t) => inRange(String(t.date || ""), from, to));
    const map = new Map();
    for (const t of list) {
      const em = String(t.employee_email || "").toLowerCase();
      const hrs = entryHours(t);
      map.set(em, (map.get(em) || 0) + hrs);
    }

    const rows = Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([email, hrs]) => `
        <tr>
          <td>${email}</td>
          <td>${hrs.toFixed(2)}</td>
          <td>${money(0)}</td>
          <td>preview</td>
          <td class="muted">—</td>
        </tr>
      `).join("");

    prBody.innerHTML = rows || `<tr><td colspan="5" class="muted">No hours in range.</td></tr>`;
  }

  prRun?.addEventListener("click", () => {
    runPayrollPreview().then(() => prStatus.textContent = "Preview generated.").catch(showFatal);
  });

  prLock?.addEventListener("click", async () => {
    try {
      // This “lock” simply marks timesheets approved in range and writes a simple paystub entry
      const from = prFrom?.value || "";
      const to = prTo?.value || "";
      const times = await loadTimesheets();
      const inR = times.filter((t) => inRange(String(t.date || ""), from, to));
      inR.forEach((t) => (t.approved = true));
      await saveTimesheets(times);

      const map = new Map();
      for (const t of inR) {
        const em = String(t.employee_email || "").toLowerCase();
        const hrs = entryHours(t);
        map.set(em, (map.get(em) || 0) + hrs);
      }

      const stubs = await loadPaystubs();
      const period = `${from || "?"}..${to || "?"}`;
      for (const [email, hrs] of map.entries()) {
        stubs.push({
          id: uid(),
          employee: email,
          period,
          hours: Number(hrs.toFixed(2)),
          gross: 0,
          status: "issued"
        });
      }
      await savePaystubs(stubs);

      await runPayrollPreview();
      prStatus.textContent = "Approved & locked (timesheets approved, paystubs issued).";
    } catch (err) {
      showFatal(err);
    }
  });

  // ----------------- Services Catalog (basic) -----------------
  const svcForm = byId("svc-form");
  const svcStatus = byId("svc_status");
  const svcReset = byId("svc_reset");
  const svcBody = $("#svc_table tbody");

  async function loadServices() { return (await apiGet(KEYS.services, [])) || []; }
  async function saveServices(list) { await apiSet(KEYS.services, list); }

  function fillSvc(s) {
    byId("svc_id").value = s?.id || "";
    byId("svc_name").value = s?.name || "";
    byId("svc_tier").value = s?.tier || "essential";
    byId("svc_price").value = Number(s?.price || 35);
    byId("svc_desc").value = s?.desc || "";
  }

  async function renderServices() {
    const list = await loadServices();
    svcBody.innerHTML = list
      .sort((a, b) => String(a.tier || "").localeCompare(String(b.tier || "")) || String(a.name || "").localeCompare(String(b.name || "")))
      .map((s) => `
        <tr data-id="${s.id}">
          <td>${s.tier || ""}</td>
          <td>${s.name || ""}</td>
          <td>${money(s.price || 0)}</td>
          <td>${s.desc || ""}</td>
          <td class="cell-actions">
            <button class="btn-small js-edit">Edit</button>
            <button class="btn-small btn-small--danger js-del">Delete</button>
          </td>
        </tr>
      `).join("") || `<tr><td colspan="5" class="muted">No items.</td></tr>`;
  }

  svcForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const list = await loadServices();
      const id = byId("svc_id").value || uid();
      const idx = list.findIndex((x) => x.id === id);

      const next = {
        ...(idx >= 0 ? list[idx] : {}),
        id,
        name: (byId("svc_name").value || "").trim(),
        tier: byId("svc_tier").value,
        price: Number(byId("svc_price").value || 0),
        desc: (byId("svc_desc").value || "").trim()
      };

      if (!next.name) throw new Error("Service name required.");

      if (idx >= 0) list[idx] = next;
      else list.push(next);

      await saveServices(list);
      svcStatus.textContent = "Saved.";
      fillSvc(null);
      await renderServices();
    } catch (err) {
      svcStatus.textContent = String(err?.message || err);
      throw err;
    }
  });

  svcReset?.addEventListener("click", () => {
    fillSvc(null);
    svcStatus.textContent = "";
  });

  svcBody?.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const id = tr.dataset.id;
    try {
      const list = await loadServices();
      const s = list.find((x) => x.id === id);
      if (!s) return;

      if (e.target.classList.contains("js-edit")) fillSvc(s);

      if (e.target.classList.contains("js-del")) {
        const next = list.filter((x) => x.id !== id);
        await saveServices(next);
        await renderServices();
      }
    } catch (err) {
      showFatal(err);
    }
  });

  // ----------------- Reviews + PTO (render-only basics) -----------------
  async function loadReviews() { return (await apiGet(KEYS.reviews, [])) || []; }
  async function saveReviews(list) { await apiSet(KEYS.reviews, list); }
  async function loadPTO() { return (await apiGet(KEYS.pto, [])) || []; }
  async function savePTO(list) { await apiSet(KEYS.pto, list); }

  const reviewBody = $("#review_table tbody");
  const ptoBody = $("#pto_table tbody");

  function normalizePhotos(list) {
    const raw = Array.isArray(list) ? list : [];
    return raw
      .map((p) => {
        if (!p) return null;
        if (typeof p === "string") return { name: p, key: "" };
        return { name: p.name || "photo", key: p.key || "" };
      })
      .filter(Boolean);
  }

  async function fetchPhotoObjectUrl(key) {
    const t = await tokenStrict();
    const res = await fetch(`/.netlify/functions/photo_get?key=${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${t}` }
    });
    if (!res.ok) throw new Error(`Photo fetch failed: ${res.status} ${res.statusText}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }

  async function openPhotoViewer(review) {
    const photos = normalizePhotos(review?.photos);
    const keys = photos.filter((p) => p.key);
    if (!keys.length) return;

    const win = window.open("", "_blank");
    if (!win) throw new Error("Popup blocked while opening photo viewer.");

    win.document.open();
    win.document.write(`<!doctype html><html><head><meta charset="utf-8">
      <title>Job Photos</title>
      <style>
        body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px;color:#1e2f1e}
        h1{margin:0 0 12px}
        .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
        img{width:100%;height:auto;border-radius:12px;border:1px solid #e6e1d6;box-shadow:0 8px 20px rgba(0,0,0,.08)}
        .cap{font-size:.9rem;color:#556; margin-top:6px}
      </style></head><body>
      <h1>${review?.title || "Job Photos"}</h1>
      <div class="grid" id="photo-grid"></div>
      </body></html>`);
    win.document.close();

    const grid = win.document.getElementById("photo-grid");
    for (const p of keys) {
      const url = await fetchPhotoObjectUrl(p.key);
      const figure = win.document.createElement("div");
      const img = win.document.createElement("img");
      img.src = url;
      img.alt = p.name || "Job photo";
      const cap = win.document.createElement("div");
      cap.className = "cap";
      cap.textContent = p.name || "photo";
      figure.appendChild(img);
      figure.appendChild(cap);
      grid.appendChild(figure);
    }
  }

  async function renderReviews() {
    const list = await loadReviews();
    reviewBody.innerHTML = list
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
      .map((r) => {
        const photos = normalizePhotos(r.photos);
        const viewable = photos.filter((p) => p.key).length;
        const photoCell = viewable
          ? `<button class="btn-small js-view-photos">View (${viewable})</button>`
          : (photos.length ? photos.map((p) => p.name).join(", ") : "—");
        return `
        <tr data-id="${r.id}">
          <td>${r.date || ""}</td>
          <td>${r.customer || ""}</td>
          <td>${r.title || ""}</td>
          <td>${photoCell}</td>
          <td>${r.notes || ""}</td>
          <td class="cell-actions">
            <button class="btn-small js-approve">Approve</button>
            <button class="btn-small btn-small--danger js-reject">Reject</button>
          </td>
        </tr>
      `;
      }).join("") || `<tr><td colspan="6" class="muted">No pending reviews.</td></tr>`;
  }

  reviewBody?.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const id = tr.dataset.id;
    try {
      const list = await loadReviews();
      const r = list.find((x) => x.id === id);
      if (!r) return;

      if (e.target.classList.contains("js-view-photos")) {
        await openPhotoViewer(r);
        return;
      }

      if (e.target.classList.contains("js-approve")) r.status = "approved";
      if (e.target.classList.contains("js-reject")) r.status = "rejected";

      await saveReviews(list);
      await renderReviews();
    } catch (err) {
      showFatal(err);
    }
  });

  async function renderPTO() {
    const list = await loadPTO();
    ptoBody.innerHTML = list
      .sort((a, b) => String(b.from || "").localeCompare(String(a.from || "")))
      .map((p) => `
        <tr data-id="${p.id}">
          <td>${p.employee || ""}</td>
          <td>${p.from || ""}</td>
          <td>${p.to || ""}</td>
          <td>${p.reason || ""}</td>
          <td>${p.status || "pending"}</td>
          <td class="cell-actions">
            <button class="btn-small js-ok">Approve</button>
            <button class="btn-small btn-small--danger js-no">Deny</button>
          </td>
        </tr>
      `).join("") || `<tr><td colspan="6" class="muted">No PTO requests.</td></tr>`;
  }

  ptoBody?.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const id = tr.dataset.id;
    try {
      const list = await loadPTO();
      const p = list.find((x) => x.id === id);
      if (!p) return;

      if (e.target.classList.contains("js-ok")) p.status = "approved";
      if (e.target.classList.contains("js-no")) p.status = "denied";

      await savePTO(list);
      await renderPTO();
    } catch (err) {
      showFatal(err);
    }
  });

  // ----------------- Promos & Prices (basic) -----------------
  const promoForm = byId("promo-form");
  const promoStatus = byId("promo_status");
  const priceForm = byId("price-form");
  const priceStatus = byId("price_status");

  async function loadPromos() { return (await apiGet(KEYS.promos, [])) || []; }
  async function savePromos(list) { await apiSet(KEYS.promos, list); }

  promoForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const list = await loadPromos();
      list.push({
        id: uid(),
        title: (byId("promo_title").value || "").trim(),
        subtitle: (byId("promo_subtitle").value || "").trim(),
        active: String(byId("promo_active").value) === "true",
        date: todayISO()
      });
      await savePromos(list);
      promoStatus.textContent = "Saved promotion.";
      promoForm.reset();
    } catch (err) {
      promoStatus.textContent = String(err?.message || err);
      throw err;
    }
  });

  async function loadPrices() { return (await apiGet(KEYS.prices, null)) || null; }
  async function savePrices(obj) { await apiSet(KEYS.prices, obj); }

  async function renderPrices() {
    const p = await loadPrices();
    if (!p) return;
    if (byId("p_essential")) byId("p_essential").value = Number(p.essential ?? 35);
    if (byId("p_standard")) byId("p_standard").value = Number(p.standard ?? 55);
    if (byId("p_premium")) byId("p_premium").value = Number(p.premium ?? 85);
  }

  priceForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const obj = {
        essential: Number(byId("p_essential").value || 0),
        standard: Number(byId("p_standard").value || 0),
        premium: Number(byId("p_premium").value || 0),
        updatedAt: new Date().toISOString()
      };
      await savePrices(obj);
      priceStatus.textContent = "Saved pricing.";
    } catch (err) {
      priceStatus.textContent = String(err?.message || err);
      throw err;
    }
  });

  // ----------------- Logout -----------------
  byId("admin-logout")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.TNKIdentity?.logout?.();
  });

  // ----------------- INIT -----------------
  (async function init() {
    try {
      // Force identity + token readiness up front (prevents PUT 401)
      await waitForIdentityUser();
      await tokenStrict();

      // Accounts first (also populates datalists)
      await renderAccounts();

      // Schedule
      await renderCalendar();

      // Invoices
      fillInvoiceForm(null);
      await renderInvoices();

      // Timesheets
      await renderTimesheets();

      // Payroll preview (optional)
      await runPayrollPreview().catch(() => {});

      // Services
      await renderServices();

      // Reviews + PTO
      await renderReviews();
      await renderPTO();

      // Prices
      await renderPrices();
    } catch (err) {
      showFatal(err);
    }
  })();
})();
