/* TNK Employee Portal — Identity guard + tabs + Netlify-backed data (NO localStorage, FAIL LOUDLY) */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const byId = (id) => document.getElementById(id);
  const money = (n) => `$${(Number(n || 0)).toFixed(2)}`;
  const todayISO = () => new Date().toISOString().slice(0, 10);

  function fail(msg, err) {
    console.error("[Employee]", msg, err || "");
    const el = byId("global_error");
    if (el) {
      el.textContent = msg;
      el.style.display = "block";
    } else {
      alert(msg);
    }
  }

  function requireEmpOrAdmin() {
    const role = window.TNKIdentity?.role?.() || sessionStorage.getItem("tnk_role");
    if (role === "employee" || role === "admin") return true;
    location.replace("login.html");
    return false;
  }
  if (!requireEmpOrAdmin()) return;

  byId("emp-logout")?.addEventListener("click", (e) => {
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
    jobs: "tnk_jobs",
    reviews: "tnk_reviews",
    timesheets: "tnk_timesheets",
    pto: "tnk_pto",
    paystubs: "tnk_paystubs",
    emp_comments: "tnk_emp_comments"
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

  async function loadJobs() { return (await API.get(KEYS.jobs)) || []; }

  // Today jobs
  const todayBody = $("#emp_today_jobs tbody");
  const jobDrawer = byId("emp_job_drawer");

  async function renderToday() {
    const me = myEmail();
    const today = todayISO();
    const rows = (await loadJobs())
      .filter((j) => j.date === today && (!j.assignee || (j.assignee || "").toLowerCase() === me))
      .sort((a, b) => (a.start || "").localeCompare(b.start || ""))
      .map((j) => `<tr data-id="${j.id}"><td>${j.start || ""}</td><td>${j.customer || ""}</td><td>${j.title || ""}</td><td>${j.notes || ""}</td></tr>`)
      .join("");
    todayBody.innerHTML = rows || `<tr><td colspan="4" class="muted">No jobs today.</td></tr>`;
  }

  todayBody?.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr"); if (!tr) return;
    try {
      const j = (await loadJobs()).find((x) => x.id === tr.dataset.id);
      if (!j) return;
      jobDrawer.innerHTML = `
        <p><strong>${j.title || ""}</strong></p>
        <p><strong>Customer:</strong> ${j.customer || ""}</p>
        <p><strong>When:</strong> ${j.date || ""} ${j.start || ""}${j.end ? "–" + j.end : ""}</p>
        <p><strong>Notes:</strong> ${j.notes || ""}</p>
        <p><strong>Status:</strong> ${j.status || "scheduled"}</p>`;
    } catch (err) {
      fail("Failed to load job details.", err);
    }
  });

  async function renderWeek() {
    const me = myEmail();
    const rows = (await loadJobs())
      .filter((j) => !j.assignee || (j.assignee || "").toLowerCase() === me)
      .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.start || "").localeCompare(b.start || ""))
      .map((j) => `<div class="slot"><div>${j.date} ${j.start || ""}</div><div><strong>${(j.customer || "").split("@")[0]}</strong> — ${j.title || ""}</div></div>`)
      .join("");
    byId("emp_week_calendar").innerHTML = rows || '<p class="muted">No jobs.</p>';
  }

  // Complete job → review queue
  async function loadReviews() { return (await API.get(KEYS.reviews)) || []; }

  const cForm = byId("emp-complete-form");
  const cSel = byId("c_job");
  const cStatus = byId("c_status");

  async function refreshCompleteSelect() {
    const me = myEmail();
    const jobs = await loadJobs();
    cSel.innerHTML =
      `<option value="">Select…</option>` +
      jobs
        .filter((j) => (!j.assignee || (j.assignee || "").toLowerCase() === me) && (j.status === "scheduled" || j.status === "in_progress"))
        .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
        .map((j) => `<option value="${j.id}">${j.date} • ${j.title} (${j.customer})</option>`)
        .join("");
  }

  async function renderCompletions() {
    const me = myEmail();
    const rows = (await loadReviews())
      .filter((r) => (r.employee || "").toLowerCase() === me)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((r) => `<tr><td>${r.date || ""}</td><td>${r.title || ""}</td><td>${r.status || "pending"}</td><td>${r.notes || ""}</td></tr>`)
      .join("") || '<tr><td colspan="4" class="muted">No submissions.</td></tr>';
    $("#emp_completions tbody").innerHTML = rows;
  }

  cForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const id = cSel.value;
      if (!id) { cStatus.textContent = "Pick a job."; return; }

      const jobs = await loadJobs();
      const j = jobs.find((x) => x.id === id);
      if (!j) { cStatus.textContent = "Job not found."; return; }

      const photos = Array.from(byId("c_photos").files || []).map((f) => f.name);

      const list = await loadReviews();
      list.push({
        id: crypto.randomUUID(),
        job_id: j.id,
        date: j.date,
        customer: j.customer,
        title: j.title,
        notes: byId("c_notes").value.trim(),
        photos,
        employee: myEmail(),
        status: "pending"
      });

      await API.set(KEYS.reviews, list);

      j.status = "complete_pending_review";
      await API.set(KEYS.jobs, jobs);

      cStatus.textContent = "Submitted for admin review.";
      cForm.reset();

      await refreshCompleteSelect();
      await renderCompletions();
      await renderToday();
      await renderWeek();
    } catch (err) {
      fail("Failed to submit completion for review.", err);
    }
  });

  // Hours
  async function loadTimesheets() { return (await API.get(KEYS.timesheets)) || []; }
  const hForm = byId("emp-hours-form");
  const hStatus = byId("eh_status");

  hForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const list = await loadTimesheets();
      list.push({
        id: crypto.randomUUID(),
        employee_email: myEmail(),
        date: byId("eh_date").value,
        hours: Number(byId("eh_hours").value || 0),
        start_time: "",
        end_time: "",
        notes: byId("eh_notes").value.trim(),
        approved: false
      });
      await API.set(KEYS.timesheets, list);
      hStatus.textContent = "Saved.";
      hForm.reset();
      await renderHours();
    } catch (err) {
      fail("Failed to save hours.", err);
    }
  });

  async function renderHours() {
    const me = myEmail();
    const rows = (await loadTimesheets())
      .filter((t) => (t.employee_email || "").toLowerCase() === me)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((t) => `<tr><td>${t.date}</td><td>${t.hours || 0}</td><td>${t.approved ? "approved" : "pending"}</td><td>${t.notes || ""}</td></tr>`)
      .join("") || '<tr><td colspan="4" class="muted">No hours yet.</td></tr>';
    $("#emp_hours_table tbody").innerHTML = rows;
  }

  // Paystubs (read only)
  async function loadPaystubs() { return (await API.get(KEYS.paystubs)) || []; }
  async function renderPaystubs() {
    const me = myEmail();
    const rows = (await loadPaystubs())
      .filter((p) => (p.employee || "").toLowerCase() === me)
      .sort((a, b) => (a.period || "").localeCompare(b.period || ""))
      .map((p) => `<tr><td>${p.period}</td><td>${p.hours}</td><td>${money(p.gross)}</td><td>${p.status || "issued"}</td><td><button class="button" disabled>Download</button></td></tr>`)
      .join("") || '<tr><td colspan="5" class="muted">No paystubs yet.</td></tr>';
    $("#emp_paystubs tbody").innerHTML = rows;
  }

  // PTO
  async function loadPTO() { return (await API.get(KEYS.pto)) || []; }
  const ptoForm = byId("pto-form");
  const ptoStatus = byId("pto_status");

  ptoForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const list = await loadPTO();
      list.push({
        id: crypto.randomUUID(),
        employee: myEmail(),
        from: byId("pto_from").value,
        to: byId("pto_to").value,
        reason: byId("pto_reason").value.trim(),
        status: "pending"
      });
      await API.set(KEYS.pto, list);
      ptoStatus.textContent = "Request submitted.";
      ptoForm.reset();
      await renderPTO();
    } catch (err) {
      fail("Failed to submit PTO request.", err);
    }
  });

  async function renderPTO() {
    const me = myEmail();
    const rows = (await loadPTO())
      .filter((p) => (p.employee || "").toLowerCase() === me)
      .sort((a, b) => (a.from < b.from ? 1 : -1))
      .map((p) => `<tr><td>${p.from || ""}</td><td>${p.to || ""}</td><td>${p.reason || ""}</td><td>${p.status || "pending"}</td></tr>`)
      .join("") || '<tr><td colspan="4" class="muted">No requests.</td></tr>';
    $("#pto_table_emp tbody").innerHTML = rows;
  }

  // Employee comments
  async function loadEmpComments() { return (await API.get(KEYS.emp_comments)) || []; }
  const cmForm = byId("emp-comment-form");
  const cmStatus = byId("cmpl_status");
  const cmSel = byId("cmpl_job");

  async function refreshCompletedJobsForComments() {
    const me = myEmail();
    const jobs = (await loadReviews()).filter((r) => (r.employee || "").toLowerCase() === me);
    cmSel.innerHTML =
      jobs.map((j) => `<option value="${j.id}">${j.date || ""} • ${j.title || ""}</option>`).join("") ||
      '<option value="">No completed jobs yet</option>';
  }

  cmForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const jobId = cmSel.value;
      if (!jobId) { cmStatus.textContent = "No job selected."; return; }
      const list = await loadEmpComments();
      list.push({
        id: crypto.randomUUID(),
        employee: myEmail(),
        job_review_id: jobId,
        text: byId("cmpl_notes").value.trim(),
        date: todayISO(),
        status: "submitted"
      });
      await API.set(KEYS.emp_comments, list);
      cmStatus.textContent = "Comment submitted.";
      cmForm.reset();
      await renderEmpComments();
    } catch (err) {
      fail("Failed to submit comment.", err);
    }
  });

  async function renderEmpComments() {
    const me = myEmail();
    const rows = (await loadEmpComments())
      .filter((c) => (c.employee || "").toLowerCase() === me)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((c) => `<tr><td>${c.date}</td><td>${c.job_review_id}</td><td>${c.text || ""}</td><td>${c.status || ""}</td></tr>`)
      .join("") || '<tr><td colspan="4" class="muted">No comments yet.</td></tr>';
    $("#emp_comments_table tbody").innerHTML = rows;
  }

  // Init
  (async function init() {
    try {
      await renderToday();
      await renderWeek();
      await refreshCompleteSelect();
      await renderCompletions();
      await renderHours();
      await renderPaystubs();
      await renderPTO();
      await refreshCompletedJobsForComments();
      await renderEmpComments();
    } catch (err) {
      fail("Employee portal failed to load data (Netlify function / auth).", err);
    }
  })();
})();
