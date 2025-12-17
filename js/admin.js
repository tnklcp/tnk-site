/* TNK Admin Portal — Identity guard + tabs + Netlify-backed data (NO localStorage, fail loudly) */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const byId = (id) => document.getElementById(id);
  const money = (n) => `$${(Number(n || 0)).toFixed(2)}`;

  function fatal(msg, err) {
    console.error("[ADMIN]", msg, err || "");
    const root = byId("admin-root");
    if (root) {
      root.innerHTML = `
        <div class="admin-card" style="max-width:900px;margin:2rem auto;">
          <h2 style="margin:.25rem 0;color:var(--clr-primary-600)">System Error</h2>
          <p class="muted">${msg}</p>
          <p class="muted">Open DevTools → Console for details.</p>
        </div>`;
    } else {
      alert(msg);
    }
    throw new Error(msg);
  }

  // ----- Auth -----
  function assertAdmin() {
    const role = window.TNKIdentity?.role?.();
    const r = sessionStorage.getItem("tnk_role");
    if (role === "admin" || r === "admin") return true;
    location.replace("login.html");
    return false;
  }
  if (!assertAdmin()) return;

  byId("admin-logout")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.TNKIdentity?.logout?.();
  });

  if (!window.TNK_API) fatal("Missing TNK_API. Ensure js/api.js is loaded before admin.js.");

  const KEYS = {
    accounts: "tnk_accounts",
    timesheets: "tnk_timesheets",
    prices: "tnk_prices",
    promos: "tnk_promotions",
    invoices: "tnk_invoices",
    services: "tnk_services",
    jobs: "tnk_jobs",
    reviews: "tnk_reviews",
    pto: "tnk_pto",
    paystubs: "tnk_paystubs",
    availability: "tnk_availability",
    balances: "tnk_cust_balances",
  };

  // ----- tabs -----
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

  // ===== ACCOUNTS =====
  const accForm = byId("acc-form");
  const accTableBody = $("#acc_table tbody");
  const accFilterRole = byId("acc_filter_role");
  const accSearch = byId("acc_search");
  const accStatus = byId("acc_status");

  const accFields = {
    id: byId("acc_id"),
    role: byId("acc_role"),
    email: byId("acc_email"),
    name: byId("acc_name"),
    phone: byId("acc_phone"),
    address: byId("acc_address"),
  };

  async function loadAccounts() {
    const v = await TNK_API.get(KEYS.accounts);
    return Array.isArray(v) ? v : [];
  }
  async function saveAccounts(list) {
    await TNK_API.set(KEYS.accounts, list);
    await renderAccounts();
    await refreshSelects();
  }

  async function renderAccounts() {
    try {
      const role = accFilterRole?.value || "all";
      const q = (accSearch?.value || "").toLowerCase();
      const list = await loadAccounts();

      accTableBody.innerHTML =
        list
          .filter((a) => (role === "all" ? true : a.role === role))
          .filter((a) => !q || (a.name || "").toLowerCase().includes(q) || (a.email || "").toLowerCase().includes(q))
          .map(
            (a) => `
            <tr data-id="${a.id}">
              <td>${a.role}</td><td>${a.name || ""}</td><td>${a.email || ""}</td>
              <td>${a.phone || ""}</td><td>${a.role === "customer" ? a.address || "" : ""}</td>
              <td>
                <button class="btn-small js-edit" type="button">Edit</button>
                <button class="btn-small btn-small--danger js-del" type="button">Delete</button>
              </td>
            </tr>`
          )
          .join("") || '<tr><td colspan="6" class="muted">No accounts.</td></tr>';
    } catch (e) {
      fatal("Failed to load accounts.", e);
    }
  }

  accForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const id = accFields.id.value || crypto.randomUUID();
      const data = {
        id,
        role: accFields.role.value,
        email: accFields.email.value.trim().toLowerCase(),
        name: accFields.name.value.trim(),
        phone: accFields.phone.value.trim(),
        address: accFields.address.value.trim(),
      };
      const list = await loadAccounts();
      const i = list.findIndex((a) => a.id === id);
      if (i >= 0) list[i] = data;
      else list.push(data);

      await saveAccounts(list);
      accStatus.textContent = "Saved.";
      accForm.reset();
      accFields.id.value = "";
    } catch (e2) {
      fatal("Failed to save account.", e2);
    }
  });

  byId("acc_reset")?.addEventListener("click", () => {
    accForm.reset();
    accFields.id.value = "";
    accStatus.textContent = "";
  });
  accFilterRole?.addEventListener("change", renderAccounts);
  accSearch?.addEventListener("input", renderAccounts);

  accTableBody?.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const id = tr.dataset.id;
    try {
      const list = await loadAccounts();
      const a = list.find((x) => x.id === id);
      if (!a) return;

      if (e.target.classList.contains("js-edit")) {
        accFields.id.value = a.id;
        accFields.role.value = a.role;
        accFields.email.value = a.email || "";
        accFields.name.value = a.name || "";
        accFields.phone.value = a.phone || "";
        accFields.address.value = a.address || "";
        window.scrollTo({ top: byId("panel-accounts").offsetTop - 12, behavior: "smooth" });
      }
      if (e.target.classList.contains("js-del")) {
        if (confirm("Delete this account?")) await saveAccounts(list.filter((x) => x.id !== id));
      }
    } catch (e2) {
      fatal("Accounts action failed.", e2);
    }
  });

  async function refreshSelects() {
    const accounts = await loadAccounts();
    const customers = accounts.filter((a) => a.role === "customer");
    const employees = accounts.filter((a) => a.role === "employee");

    const dlCust = byId("admin-customer-emails");
    if (dlCust) dlCust.innerHTML = customers.map((c) => `<option value="${c.email}">`).join("");

    const filterCust = byId("f_inv_customer");
    if (filterCust) {
      const keep = filterCust.value;
      filterCust.innerHTML =
        `<option value="all">All Customers</option>` +
        customers.map((c) => `<option value="${c.email}">${c.name || c.email} (${c.email})</option>`).join("");
      if ([...filterCust.options].some((o) => o.value === keep)) filterCust.value = keep;
    }

    const dlEmp = byId("admin-employees");
    if (dlEmp) dlEmp.innerHTML = employees.map((e) => `<option value="${e.email}">`).join("");

    const tsSel = byId("ts_filter_email");
    if (tsSel) {
      const keep = tsSel.value;
      tsSel.innerHTML =
        `<option value="all">All Employees</option>` +
        employees.map((e) => `<option value="${e.email}">${e.name || e.email} (${e.email})</option>`).join("");
      if ([...tsSel.options].some((o) => o.value === keep)) tsSel.value = keep;
    }

    // Also fill datalist used by job form (admin-customers)
    const adminCustomers = byId("admin-customers");
    if (adminCustomers) {
      adminCustomers.innerHTML = customers.map((c) => `<option value="${c.email}">${c.name || ""}</option>`).join("");
    }

    const employeeEmailsDL = byId("employee-emails");
    if (employeeEmailsDL) employeeEmailsDL.innerHTML = employees.map((e) => `<option value="${e.email}">`).join("");
  }

  // ===== JOBS =====
  const jobForm = byId("job-form");
  const jobStatus = byId("job_status_msg");

  async function loadJobs() {
    const v = await TNK_API.get(KEYS.jobs);
    return Array.isArray(v) ? v : [];
  }
  async function saveJobs(list) {
    await TNK_API.set(KEYS.jobs, list);
    await renderAdminCalendar();
  }

  async function renderAdminCalendar() {
    const cal = byId("admin-calendar");
    if (!cal) return;
    try {
      const jobs = (await loadJobs()).sort(
        (a, b) => (a.date || "").localeCompare(b.date || "") || (a.start || "").localeCompare(b.start || "")
      );
      if (jobs.length === 0) {
        cal.innerHTML = "<p class='muted'>No jobs scheduled.</p>";
        return;
      }
      cal.innerHTML = jobs
        .map((j) => {
          const cust = (j.customer || "").split("@")[0];
          return `<div class="slot" data-id="${j.id}">
            <div><strong>${cust || j.customer}</strong> — ${j.title || ""}</div>
            <div>${j.date || ""} ${j.start || ""}${j.end ? "–" + j.end : ""}</div>
          </div>`;
        })
        .join("");

      cal.onclick = async (e) => {
        const el = e.target.closest(".slot");
        if (!el) return;
        const id = el.dataset.id;
        const j = (await loadJobs()).find((x) => x.id === id);
        if (!j) return;

        const map = {
          job_id: "id",
          job_customer: "customer",
          job_title: "title",
          job_date: "date",
          job_start: "start",
          job_end: "end",
          job_assignee: "assignee",
          job_invoice: "invoice",
          job_lat: "lat",
          job_lon: "lon",
          job_status: "status",
          job_notes: "notes",
        };
        Object.entries(map).forEach(([elId, key]) => {
          const node = byId(elId);
          if (node) node.value = j[key] || "";
        });
        byId("job_risk_rain").value = j.risk_rain ?? 50;
        byId("job_risk_gust").value = j.risk_gust ?? 35;

        window.scrollTo({ top: jobForm.offsetTop - 12, behavior: "smooth" });
      };
    } catch (e) {
      fatal("Failed to load jobs calendar.", e);
    }
  }

  jobForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const id = byId("job_id").value || crypto.randomUUID();
      const data = {
        id,
        customer: byId("job_customer").value.trim(),
        title: byId("job_title").value.trim(),
        date: byId("job_date").value,
        start: byId("job_start").value,
        end: byId("job_end").value,
        assignee: byId("job_assignee").value.trim(),
        invoice: byId("job_invoice").value.trim(),
        lat: "", // disabled inputs; left for future
        lon: "",
        risk_rain: Number(byId("job_risk_rain").value || 50),
        risk_gust: Number(byId("job_risk_gust").value || 35),
        status: byId("job_status").value,
        notes: byId("job_notes").value.trim(),
      };

      const list = await loadJobs();
      const i = list.findIndex((x) => x.id === id);
      if (i >= 0) list[i] = data;
      else list.push(data);

      await saveJobs(list);
      jobStatus.textContent = "Saved.";
      jobForm.reset();
      byId("job_id").value = "";
    } catch (e2) {
      fatal("Failed to save job.", e2);
    }
  });

  byId("job_reset")?.addEventListener("click", () => {
    jobForm.reset();
    byId("job_id").value = "";
    jobStatus.textContent = "";
  });

  // ===== INVOICES =====
  const invForm = byId("inv-form");
  const invItemsWrap = byId("items-rows");
  const invAddItemBtn = byId("add-item");
  const invTableBody = $("#inv_table tbody");
  const fInvCustomer = byId("f_inv_customer");
  const fInvStatus = byId("f_inv_status");
  const fInvQ = byId("f_inv_q");
  const invStatusMsg = byId("inv_status_msg");
  const invResetBtn = byId("inv_reset");
  const invTotalOut = byId("inv_total");

  async function loadInvoices() {
    const v = await TNK_API.get(KEYS.invoices);
    return Array.isArray(v) ? v : [];
  }
  async function saveInvoices(list) {
    await TNK_API.set(KEYS.invoices, list);
    await renderInvoices();
  }

  function autoInvoiceNumber() {
    // No localStorage. Unique enough for small biz:
    // INV-YYYYMMDD-HHMMSS-XXX
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp =
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
      `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const rand = Math.floor(Math.random() * 900 + 100);
    return `INV-${stamp}-${rand}`;
  }

  function addItemRow(item = { desc: "", qty: 1, unit: 35 }) {
    const row = document.createElement("div");
    row.className = "items-row";
    row.innerHTML = `
      <input type="text" class="it-desc" placeholder="Description" value="${item.desc || ""}" />
      <input type="number" class="it-qty" min="0" step="1" value="${item.qty ?? 1}" />
      <input type="number" class="it-unit" min="0" step="0.01" value="${item.unit ?? 0}" />
      <button type="button" class="btn-small js-del-item">Delete</button>`;
    invItemsWrap.appendChild(row);
    row.addEventListener("input", recalcInvoice);
    row.querySelector(".js-del-item").addEventListener("click", () => {
      row.remove();
      recalcInvoice();
    });
    recalcInvoice();
  }

  function invoiceItems() {
    return $$(".items-row", invItemsWrap)
      .map((r) => ({
        desc: $(".it-desc", r).value.trim(),
        qty: Number($(".it-qty", r).value || 0),
        unit: Number($(".it-unit", r).value || 0),
      }))
      .filter((i) => i.desc || i.qty || i.unit);
  }

  function recalcInvoice() {
    const items = invoiceItems();
    const sub = items.reduce((s, i) => s + i.qty * i.unit, 0);
    const taxPct = Number(byId("inv_tax").value || 0);
    const total = sub + sub * (taxPct / 100);
    invTotalOut.textContent = money(total);
  }

  invAddItemBtn?.addEventListener("click", () => addItemRow());

  function resetInvoiceForm() {
    byId("inv_id").value = "";
    byId("inv_customer").value = "";
    byId("inv_number").value = autoInvoiceNumber();
    byId("inv_status").value = "unpaid";
    byId("inv_date").valueAsDate = new Date();
    byId("inv_due").value = "";
    byId("inv_tax").value = "0";
    byId("inv_notes").value = "";
    invItemsWrap.innerHTML = "";
    addItemRow({ desc: "Mowing / Trimming", qty: 1, unit: 35 });
    invStatusMsg.textContent = "";
    recalcInvoice();
  }

  invForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const id = byId("inv_id").value || crypto.randomUUID();
      const items = invoiceItems();
      const subtotal = items.reduce((s, i) => s + i.qty * i.unit, 0);
      const taxPct = Number(byId("inv_tax").value || 0);
      const total = subtotal + subtotal * (taxPct / 100);

      const data = {
        id,
        customer_email: byId("inv_customer").value.trim().toLowerCase(),
        number: byId("inv_number").value.trim() || autoInvoiceNumber(),
        status: byId("inv_status").value,
        date: byId("inv_date").value,
        due: byId("inv_due").value,
        tax_pct: taxPct,
        items,
        subtotal,
        tax: subtotal * (taxPct / 100),
        total,
        notes: byId("inv_notes").value.trim(),
      };

      const list = await loadInvoices();
      const i = list.findIndex((x) => x.id === id);
      if (i >= 0) list[i] = data;
      else list.push(data);

      await saveInvoices(list);
      invStatusMsg.textContent = "Invoice saved.";
      resetInvoiceForm();
    } catch (e2) {
      fatal("Failed to save invoice.", e2);
    }
  });

  invResetBtn?.addEventListener("click", resetInvoiceForm);
  byId("inv_tax")?.addEventListener("input", recalcInvoice);

  async function renderInvoices() {
    try {
      const list = await loadInvoices();
      const fCust = fInvCustomer?.value || "all";
      const fStat = fInvStatus?.value || "all";
      const q = (fInvQ?.value || "").toLowerCase();

      invTableBody.innerHTML =
        list
          .filter((i) => (fCust === "all" ? true : i.customer_email === fCust))
          .filter((i) => (fStat === "all" ? true : i.status === fStat))
          .filter((i) => !q || (i.number || "").toLowerCase().includes(q) || (i.customer_email || "").toLowerCase().includes(q))
          .sort((a, b) => ((a.date || "") < (b.date || "") ? 1 : -1))
          .map(
            (i) => `
            <tr data-id="${i.id}">
              <td>${i.number}</td><td>${i.customer_email}</td><td>${i.date || ""}</td><td>${i.due || ""}</td>
              <td>${money(i.total)}</td><td>${i.status}</td>
              <td>
                <button class="btn-small js-view" type="button">View</button>
                <button class="btn-small js-edit" type="button">Edit</button>
                <button class="btn-small ${i.status === "paid" ? "" : "btn-small--ok"} js-toggle" type="button">
                  ${i.status === "paid" ? "Mark Unpaid" : "Mark Paid"}
                </button>
                <button class="btn-small btn-small--danger js-del" type="button">Delete</button>
              </td>
            </tr>`
          )
          .join("") || '<tr><td colspan="7" class="muted">No invoices.</td></tr>';
    } catch (e) {
      fatal("Failed to load invoices.", e);
    }
  }

  invTableBody?.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const id = tr.dataset.id;

    try {
      const list = await loadInvoices();
      const inv = list.find((x) => x.id === id);
      if (!inv) return;

      if (e.target.classList.contains("js-edit")) {
        byId("inv_id").value = inv.id;
        byId("inv_customer").value = inv.customer_email;
        byId("inv_number").value = inv.number;
        byId("inv_status").value = inv.status;
        byId("inv_date").value = inv.date || "";
        byId("inv_due").value = inv.due || "";
        byId("inv_tax").value = inv.tax_pct || 0;
        byId("inv_notes").value = inv.notes || "";
        invItemsWrap.innerHTML = "";
        (inv.items || []).forEach(addItemRow);
        if (!inv.items || inv.items.length === 0) addItemRow();
        recalcInvoice();
        window.scrollTo({ top: invForm.offsetTop - 12, behavior: "smooth" });
      }

      if (e.target.classList.contains("js-toggle")) {
        inv.status = inv.status === "paid" ? "unpaid" : "paid";
        await saveInvoices(list);
      }

      if (e.target.classList.contains("js-del")) {
        if (confirm("Delete this invoice?")) await saveInvoices(list.filter((x) => x.id !== id));
      }

      if (e.target.classList.contains("js-view")) openInvoiceWindow(inv);
    } catch (e2) {
      fatal("Invoice action failed.", e2);
    }
  });

  function openInvoiceWindow(inv) {
    const rows = (inv.items || [])
      .map(
        (it) =>
          `<tr><td>${it.desc || ""}</td><td>${it.qty || 0}</td><td>${money(it.unit || 0)}</td><td>${money(
            (it.qty || 0) * (it.unit || 0)
          )}</td></tr>`
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${inv.number}</title>
      <style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:24px;color:#1e2f1e}
      table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #e8e1d6;padding:8px;text-align:left}</style></head>
      <body><h1>${inv.number}</h1><div>${inv.date || ""} • ${inv.status}</div><div>Bill To: ${inv.customer_email}</div>
      <table><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Amount</th></tr></thead><tbody>${rows || "<tr><td colspan='4'>No items</td></tr>"}</tbody></table>
      <p><strong>Total: ${money(inv.total || 0)}</strong></p></body></html>`;
    const win = window.open("", "_blank");
    win.document.open();
    win.document.write(html);
    win.document.close();
    try {
      win.focus();
    } catch {}
  }

  byId("inv_export_csv")?.addEventListener("click", async () => {
    try {
      const list = await loadInvoices();
      const rows = [
        ["number", "customer_email", "date", "due", "status", "subtotal", "tax", "total", "notes"],
        ...list.map((i) => [i.number, i.customer_email, i.date || "", i.due || "", i.status, i.subtotal, i.tax, i.total, i.notes || ""]),
      ];
      const csv = rows
        .map((r) =>
          r
            .map((v) => {
              const s = String(v ?? "");
              return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
            })
            .join(",")
        )
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "invoices.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      fatal("Failed to export CSV.", e);
    }
  });

  // ===== TIMESHEETS =====
  const tsForm = byId("ts-form");
  const tsStatus = byId("ts_status");
  const tsTableBody = $("#ts_table tbody");
  const tsFilterEmail = byId("ts_filter_email");
  const tsFilterFrom = byId("ts_filter_from");
  const tsFilterTo = byId("ts_filter_to");

  byId("ts_clear_filters")?.addEventListener("click", () => {
    tsFilterEmail.value = "all";
    tsFilterFrom.value = "";
    tsFilterTo.value = "";
    renderTimesheets();
  });

  function parseH(hm) {
    if (!hm) return 0;
    const [h, m] = hm.split(":").map(Number);
    return h + (m || 0) / 60;
  }

  async function loadTimesheets() {
    const v = await TNK_API.get(KEYS.timesheets);
    return Array.isArray(v) ? v : [];
  }
  async function saveTimesheets(list) {
    await TNK_API.set(KEYS.timesheets, list);
    await renderTimesheets();
  }

  tsForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const id = byId("ts_id").value || crypto.randomUUID();
      const data = {
        id,
        employee_email: byId("ts_employee_email").value.trim().toLowerCase(),
        date: byId("ts_date").value,
        start_time: byId("ts_start").value,
        end_time: byId("ts_end").value,
        notes: byId("ts_notes").value.trim(),
        approved: false,
      };

      const list = await loadTimesheets();
      const i = list.findIndex((x) => x.id === id);
      if (i >= 0) data.approved = !!list[i].approved;
      if (i >= 0) list[i] = data;
      else list.push(data);

      await saveTimesheets(list);
      tsStatus.textContent = "Saved.";
      tsForm.reset();
      byId("ts_id").value = "";
    } catch (e2) {
      fatal("Failed to save timesheet.", e2);
    }
  });

  byId("ts_reset")?.addEventListener("click", () => {
    tsForm.reset();
    byId("ts_id").value = "";
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

      if (e.target.classList.contains("btn-edit")) {
        ["ts_id", "ts_employee_email", "ts_date", "ts_start", "ts_end", "ts_notes"].forEach((k) => {
          const node = byId(k);
          node.value = k === "ts_id" ? t.id : t[k.replace("ts_", "")] || "";
        });
        window.scrollTo({ top: tsForm.offsetTop - 12, behavior: "smooth" });
      }

      if (e.target.classList.contains("btn-del")) {
        if (confirm("Delete this timesheet?")) await saveTimesheets(list.filter((x) => x.id !== id));
      }

      if (e.target.classList.contains("btn-approve")) {
        t.approved = !t.approved;
        await saveTimesheets(list);
      }
    } catch (e2) {
      fatal("Timesheet action failed.", e2);
    }
  });

  async function renderTimesheets() {
    try {
      const list = await loadTimesheets();
      const f = tsFilterEmail?.value || "all";
      const from = tsFilterFrom?.value ? new Date(tsFilterFrom.value) : null;
      const to = tsFilterTo?.value ? new Date(tsFilterTo.value) : null;

      tsTableBody.innerHTML =
        list
          .filter((t) => (f === "all" ? true : t.employee_email === f))
          .filter((t) => {
            const d = new Date(t.date);
            if (from && d < from) return false;
            if (to && d > to) return false;
            return true;
          })
          .sort((a, b) => ((a.date || "") < (b.date || "") ? 1 : -1))
          .map(
            (t) => `<tr data-id="${t.id}">
              <td>${t.date}</td><td>${t.employee_email}</td><td>${t.start_time}</td><td>${t.end_time}</td>
              <td>${(parseH(t.end_time) - parseH(t.start_time)).toFixed(2)}</td><td>${t.notes || ""}</td>
              <td><button class="btn-small btn-approve ${t.approved ? "btn-small--ok" : ""}" type="button">${t.approved ? "Approved" : "Approve"}</button></td>
              <td><button class="btn-small btn-edit" type="button">Edit</button><button class="btn-small btn-small--danger btn-del" type="button">Delete</button></td>
            </tr>`
          )
          .join("") || '<tr><td colspan="8" class="muted">No entries.</td></tr>';
    } catch (e) {
      fatal("Failed to load timesheets.", e);
    }
  }

  // ===== PROMOS / PRICES =====
  const promoForm = byId("promo-form");
  const promoStatus = byId("promo_status");
  const priceForm = byId("price-form");
  const priceStatus = byId("price_status");

  promoForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await TNK_API.set(KEYS.promos, {
        title: byId("promo_title").value.trim(),
        subtitle: byId("promo_subtitle").value.trim(),
        active: byId("promo_active").value === "true",
      });
      promoStatus.textContent = "Promotion saved.";
    } catch (err) {
      fatal("Failed to save promotion.", err);
    }
  });

  priceForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await TNK_API.set(KEYS.prices, {
        essential: Number(byId("p_essential").value || 35),
        standard: Number(byId("p_standard").value || 55),
        premium: Number(byId("p_premium").value || 85),
      });
      priceStatus.textContent = "Prices saved.";
    } catch (err) {
      fatal("Failed to save prices.", err);
    }
  });

  // ===== basic renders for tables that exist in HTML but you may expand later =====
  async function renderServices() {
    const tbody = $("#svc_table tbody");
    if (!tbody) return;
    const v = await TNK_API.get(KEYS.services);
    const list = Array.isArray(v) ? v : [];
    tbody.innerHTML =
      list.map((s) => `<tr><td>${s.tier}</td><td>${s.name}</td><td>${money(s.price_from)}</td><td>${s.desc || ""}</td><td></td></tr>`).join("") ||
      '<tr><td colspan="5" class="muted">No services yet.</td></tr>';
  }

  async function renderReviews() {
    const tbody = $("#review_table tbody");
    if (!tbody) return;
    const v = await TNK_API.get(KEYS.reviews);
    const list = Array.isArray(v) ? v : [];
    tbody.innerHTML =
      list.map((r) => `<tr><td>${r.date || ""}</td><td>${r.customer || ""}</td><td>${r.title || ""}</td><td>${(r.photos || []).length}</td><td>${r.notes || ""}</td><td>${r.status || "pending"}</td></tr>`).join("") ||
      '<tr><td colspan="6" class="muted">No completed jobs pending.</td></tr>';
  }

  async function renderPTO() {
    const tbody = $("#pto_table tbody");
    if (!tbody) return;
    const v = await TNK_API.get(KEYS.pto);
    const list = Array.isArray(v) ? v : [];
    tbody.innerHTML =
      list.map((p) => `<tr><td>${p.employee || ""}</td><td>${p.from || ""}</td><td>${p.to || ""}</td><td>${p.reason || ""}</td><td>${p.status || "pending"}</td><td></td></tr>`).join("") ||
      '<tr><td colspan="6" class="muted">No requests.</td></tr>';
  }

  // ----- init -----
  (async function init() {
    try {
      await renderAccounts();
      await refreshSelects();
      await renderAdminCalendar();
      resetInvoiceForm();
      await renderInvoices();
      await renderTimesheets();
      await renderServices();
      await renderReviews();
      await renderPTO();
    } catch (e) {
      fatal("Admin portal failed to initialize.", e);
    }
  })();
})();
