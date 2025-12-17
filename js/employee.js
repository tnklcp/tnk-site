/* TNK Employee Portal — Identity guard + tabs + Netlify-backed data (NO localStorage, fail loudly) */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const byId = (id) => document.getElementById(id);
  const money = (n) => `$${(Number(n || 0)).toFixed(2)}`;
  const todayISO = () => new Date().toISOString().slice(0, 10);

  function fatal(msg, err) {
    console.error("[EMPLOYEE]", msg, err || "");
    const root = byId("emp-root");
    if (root) {
      root.innerHTML = `
        <div class="card" style="max-width:900px;margin:2rem auto;">
          <h2 style="margin:.25rem 0;color:var(--clr-primary-600)">System Error</h2>
          <p class="muted">${msg}</p>
          <p class="muted">Open DevTools → Console for details.</p>
        </div>`;
    } else alert(msg);
    throw new Error(msg);
  }

  if (!window.TNKIdentity) fatal("Missing TNKIdentity. Ensure js/identity.js is loaded.");
  if (!window.TNK_API) fatal("Missing TNK_API. Ensure js/api.js is loaded.");

  function ok() {
    const role = window.TNKIdentity.role?.();
    const r = sessionStorage.getItem("tnk_role");
    const finalRole = role || r;
    if (finalRole === "employee" || finalRole === "admin") return true;
    location.replace("login.html");
    return false;
  }
  if (!ok()) return;

  byId("emp-logout")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.TNKIdentity.logout();
  });

  const myEmail = () => (sessionStorage.getItem("tnk_user_email") || window.TNKIdentity.email?.() || "").toLowerCase();

  const KEYS = {
    jobs: "tnk_jobs",
    reviews: "tnk_reviews",
    timesheets: "tnk_timesheets",
    pto: "tnk_pto",
    paystubs: "tnk_paystubs",
    emp_comments: "tnk_emp_comments",
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

  async function loadJobs() {
    const v = await TNK_API.get(KEYS.jobs);
    if (v == null) return [];
    if (!Array.isArray(v)) fatal("Jobs store is corrupted (expected array).");
    return v;
  }
  async function loadReviews() {
    const v = await TNK_API.get(KEYS.reviews);
    if (v == null) return [];
    if (!Array.isArray(v)) fatal("Reviews store is corrupted (expected array).");
    return v;
  }
  async function loadTimesheets() {
    const v = await TNK_API.get(KEYS.timesheets);
    if (v == null) return [];
    if (!Array.isArray(v)) fatal("Timesheets store is corrupted (expected array).");
    return v;
  }
  async function loadPaystubs() {
    const v = await TNK_API.get(KEYS.paystubs);
    if (v == null) return [];
    if (!Array.isArray(v)) fatal("Paystubs store is corrupted (expected array).");
    return v;
  }
  async function loadPTO() {
    const v = await TNK_API.get(KEYS.pto);
    if (v == null) return [];
    if (!Array.isArray(v)) fatal("PTO store is corrupted (expected array).");
    return v;
  }
  async function loadEmpComments() {
    const v = await TNK_API.get(KEYS.emp_comments);
    if (v == null) return [];
    if (!Array.isArray(v)) fatal("Employee comments store is corrupted (expected array).");
    return v;
  }

  // Today / Week
  const todayBody = $("#emp_today_jobs tbody");
  const jobDrawer = byId("emp_job_drawer");

  async function renderToday() {
    const me = myEmail();
    const today = todayISO();
    const rows = (await loadJobs())
      .filter((j) => j.date === today && (!j.assignee || String(j.assignee).toLowerCase() === me))
      .sort((a, b) => (a.start || "").localeCompare(b.start || ""))
      .map((j) => `<tr data-id="${j.id}"><td>${j.start || ""}</td><td>${j.customer || ""}</td><td>${j.title || ""}</td><td>${j.notes || ""}</td></tr>`)
      .join("");
    todayBody.innerHTML = rows || `<tr><td colspan="4" class="muted">No jobs today.</td></tr>`;
  }

  todayBody?.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const j = (await loadJobs()).find((x) => x.id === tr.dataset.id);
    if (!j) return;
    jobDrawer.innerHTML =
      `<p><strong>${j.title || ""}</strong></p>
       <p><strong>Customer:</strong> ${j.customer || ""}</p>
       <p><strong>When:</strong> ${j.date || ""} ${j.start || ""}${j.end ? "–" + j.end : ""}</p>
       <p><strong>Notes:</strong> ${j.notes || ""}</p>
       <p><strong>Status:</strong> ${j.status || "scheduled"}</p>`;
  });

  async function renderWeek() {
    const me = myEmail();
    const rows = (await loadJobs())
      .filter((j) => !j.assignee || String(j.assignee).toLowerCase() === me)
      .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.start || "").localeCompare(b.start || ""))
      .map((j) => `<div class="slot"><div>${j.date} ${j.start || ""}</div><div><strong>${(j.customer || "").split("@")[0]}</strong> — ${j.title || ""}</div></div>`)
      .join("");
    byId("emp_week_calendar").innerHTML = rows || '<p class="muted">No jobs.</p>';
  }

  // Complete job -> reviews array + update job status
  const cForm = byId("emp-complete-form");
  const cSel = byId("c_job");
  const cStatus = byId("c_status");

  async function refreshCompleteSelect() {
    const me = myEmail();
    const jobs = await loadJobs();
    cSel.innerHTML =
      `<option value="">Select…</option>` +
      jobs
        .filter((j) => (!j.assignee || String(j.assignee).toLowerCase() === me) && (j.status === "scheduled" || j.status === "in_progress"))
        .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
        .map((j) => `<option value="${j.id}">${j.date} • ${j.title} (${j.customer})</option>`)
        .join("");
  }

  async function renderCompletions() {
    const me = myEmail();
    const rows = (await loadReviews())
      .filter((r) => String(r.employee || "").toLowerCase() === me)
      .sort((a, b) => ((a.date || "") < (b.date || "") ? 1 : -1))
      .map((r) => `<tr><td>${r.date || ""}</td><td>${r.title || ""}</td><td>${r.status || "pending"}</td><td>${r.notes || ""}</td></tr>`)
      .join("") || '<tr><td colspan="4" class="muted">No submissions.</td></tr>';
    $("#emp_completions tbody").innerHTML = rows;
  }

  cForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const jobId = cSel.value;
      if (!jobId) { cStatus.textContent = "Pick a job."; return; }

      const jobs = await loadJobs();
      const j = jobs.find((x) => x.id === jobId);
      if (!j) { cStatus.textContent = "Job not found."; return; }

      const photos = Array.from(byId("c_photos").files || []).map((f) => f.name);

      const reviews = await loadReviews();
      reviews.push({
        id: crypto.randomUUID(),
        job_id: j.id,
        date: j.date,
        customer: j.customer,
        title: j.title,
        notes: byId("c_notes").value.trim(),
        photos,
        employee: myEmail(),
        status: "pending",
      });

      await TNK_API.set(KEYS.reviews, reviews);

      j.status = "complete_pending_review";
      await TNK_API.set(KEYS.jobs, jobs);

      cStatus.textContent = "Submitted for admin review.";
      cForm.reset();
      await refreshCompleteSelect();
      await renderCompletions();
    } catch (err) {
      fatal("Failed to submit completion.", err);
    }
  });

  // Hours (timesheets)
  const hForm = byId("emp-hours-form");
  const hStatus = byId("eh_status");

  async function renderHours() {
    const me = myEmail();
    const rows = (await loadTimesheets())
      .filter((t) => String(t.employee_email || "").toLowerCase() === me)
      .sort((a, b) => ((a.date || "") < (b.date || "") ? 1 : -1))
      .map((t) => `<tr><td>${t.date}</td><td>${t.hours || 0}</td><td>${t.approved ? "approved" : "pending"}</td><td>${t.notes || ""}</td></tr>`)
      .join("") || '<tr><td colspan="4" class="muted">No hours yet.</td></tr>';
    $("#emp_hours_table tbody").innerHTML = rows;
  }

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
        approved: false,
      });
      await TNK_API.set(KEYS.timesheets, list);
      hStatus.textContent = "Saved.";
      hForm.reset();
      await renderHours();
    } catch (err) {
      fatal("Failed to save hours.", err);
    }
  });

  // Paystubs
  async function renderPaystubs() {
    const me = myEmail();
    const rows = (await loadPaystubs())
      .filter((p) => String(p.employee || "").toLowerCase() === me)
      .sort((a, b) => (a.period || "").localeCompare(b.period || ""))
      .map((p) => `<tr><td>${p.period}</td><td>${p.hours}</td><td>${money(p.gross)}</td><td>${p.status || "issued"}</td><td><button class="button" disabled>Download</button></td></tr>`)
      .join("") || '<tr><td colspan="5" class="muted">No paystubs yet.</td></tr>';
    $("#emp_paystubs tbody").innerHTML = rows;
  }

  // PTO
  const ptoForm = byId("pto-form");
  const ptoStatus = byId("pto_status");

  async function renderPTO() {
    const me = myEmail();
    const rows = (await loadPTO())
      .filter((p) => String(p.employee || "").toLowerCase() === me)
      .sort((a, b) => ((a.from || "") < (b.from || "") ? 1 : -1))
      .map((p) => `<tr><td>${p.from || ""}</td><td>${p.to || ""}</td><td>${p.reason || ""}</td><td>${p.status || "pending"}</td></tr>`)
      .join("") || '<tr><td colspan="4" class="muted">No requests.</td></tr>';
    $("#pto_table_emp tbody").innerHTML = rows;
  }

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
        status: "pending",
      });
      await TNK_API.set(KEYS.pto, list);
      ptoStatus.textContent = "Request submitted.";
      ptoForm.reset();
      await renderPTO();
    } catch (err) {
      fatal("Failed to submit PTO request.", err);
    }
  });

  // Comments on completed jobs
  const cmForm = byId("emp-comment-form");
  const cmStatus = byId("cmpl_status");
  const cmSel = byId("cmpl_job");

  async function refreshCompletedJobsForComments() {
    const me = myEmail();
    const jobs = (await loadReviews()).filter((r) => String(r.employee || "").toLowerCase() === me);
    cmSel.innerHTML =
      jobs.map((j) => `<option value="${j.id}">${j.date || ""} • ${j.title || ""}</option>`).join("") ||
      '<option value="">No completed jobs yet</option>';
  }

  async function renderEmpComments() {
    const me = myEmail();
    const rows = (await loadEmpComments())
      .filter((c) => String(c.employee || "").toLowerCase() === me)
      .sort((a, b) => ((a.date || "") < (b.date || "") ? 1 : -1))
      .map((c) => `<tr><td>${c.date}</td><td>${c.job_review_id}</td><td>${c.text || ""}</td><td>${c.status || ""}</td></tr>`)
      .join("") || '<tr><td colspan="4" class="muted">No comments yet.</td></tr>';
    $("#emp_comments_table tbody").innerHTML = rows;
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
        status: "submitted",
      });

      await TNK_API.set(KEYS.emp_comments, list);
      cmStatus.textContent = "Comment submitted.";
      cmForm.reset();
      await renderEmpComments();
    } catch (err) {
      fatal("Failed to submit employee comment.", err);
    }
  });

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
    } catch (e) {
      fatal("Employee portal failed to initialize.", e);
    }
  })();
})();
