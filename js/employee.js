/* TNK Employee Portal — Identity guard + tabs + Netlify-backed data (FAIL LOUDLY) */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const byId = (id) => document.getElementById(id);
  const money = (n) => `$${(Number(n || 0)).toFixed(2)}`;
  const todayISO = () => new Date().toISOString().slice(0, 10);

  function fatal(msg, detail) {
    const root = byId("emp-root") || document.body;
    const box = document.createElement("div");
    box.style.cssText =
      "max-width:900px;margin:1rem auto;padding:1rem 1.1rem;border-radius:12px;" +
      "background:#fff3f3;border:1px solid #e5b1b1;color:#7b1f1f;box-shadow:0 4px 12px rgba(0,0,0,.08)";
    box.innerHTML = `
      <h2 style="margin:.1rem 0 .35rem;">Data Unavailable</h2>
      <p style="margin:.25rem 0 .6rem;">${msg}</p>
      ${detail ? `<pre style="white-space:pre-wrap;margin:.5rem 0 0;opacity:.9;">${detail}</pre>` : ""}
      <p style="margin:.75rem 0 0;">
        <a class="button" href="index.html">← Back to Site</a>
      </p>
    `;
    root.prepend(box);

    document.querySelectorAll("button, input, select, textarea").forEach((el) => {
      if (el.id === "emp-logout") return;
      el.disabled = true;
    });

    throw new Error(msg);
  }

  // ---- Auth guard: employee or admin ----
  function ok() {
    const role = window.TNKIdentity?.role?.();
    const r = sessionStorage.getItem("tnk_role");
    const finalRole = role || r;

    if (finalRole === "employee" || finalRole === "admin") return true;
    location.replace("login.html");
    return false;
  }
  if (!ok()) return;

  byId("emp-logout")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.TNKIdentity?.logout?.();
  });

  const myEmail = () =>
    sessionStorage.getItem("tnk_user_email") ||
    window.TNKIdentity?.email?.() ||
    "";

  async function jwt() {
    try { return await window.netlifyIdentity?.currentUser()?.jwt(true); }
    catch { return null; }
  }

  async function apiGet(collection) {
    const token = await jwt();
    const res = await fetch(`/.netlify/functions/collections?name=${encodeURIComponent(collection)}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) throw new Error(`GET ${collection} failed: ${res.status}`);
    const j = await res.json();
    return j?.data;
  }

  async function apiSet(collection, data) {
    const token = await jwt();
    const res = await fetch(`/.netlify/functions/collections`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ name: collection, data }),
    });
    if (!res.ok) throw new Error(`PUT ${collection} failed: ${res.status}`);
  }

  const KEYS = {
    jobs: "tnk_jobs",
    reviews: "tnk_reviews",
    timesheets: "tnk_timesheets",
    pto: "tnk_pto",
    paystubs: "tnk_paystubs",
    emp_comments: "tnk_emp_comments",
  };

  // ---- tabs ----
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

  // ---- jobs ----
  async function loadJobs() { return (await apiGet(KEYS.jobs)) || []; }

  const todayBody = $("#emp_today_jobs tbody");
  const jobDrawer = byId("emp_job_drawer");

  async function renderToday() {
    const me = (myEmail() || "").toLowerCase();
    const today = todayISO();
    const rows = (await loadJobs())
      .filter((j) => j.date === today && (!j.assignee || (j.assignee || "").toLowerCase() === me))
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
    const me = (myEmail() || "").toLowerCase();
    const rows = (await loadJobs())
      .filter((j) => !j.assignee || (j.assignee || "").toLowerCase() === me)
      .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.start || "").localeCompare(b.start || ""))
      .map((j) => `<div class="slot"><div>${j.date} ${j.start || ""}</div><div><strong>${(j.customer || "").split("@")[0]}</strong> — ${j.title || ""}</div></div>`)
      .join("");
    byId("emp_week_calendar").innerHTML = rows || '<p class="muted">No jobs.</p>';
  }

  // ---- complete job ----
  async function loadReviews() { return (await apiGet(KEYS.reviews)) || []; }

  const cForm = byId("emp-complete-form");
  const cSel = byId("c_job");
  const cStatus = byId("c_status");

  async function refreshCompleteSelect() {
    const me = (myEmail() || "").toLowerCase();
    const jobs = await loadJobs();
    cSel.innerHTML =
      `<option value="">Select…</option>` +
      jobs
        .filter((j) => (!j.assignee || (j.assignee || "").toLowerCase() === me) && (j.status === "scheduled" || j.status === "in_progress"))
        .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
        .map((j) => `<option value="${j.id}">${j.date} • ${j.title} (${j.customer})</option>`)
        .join("");
  }

  cForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = cSel.value;
    if (!id) { cStatus.textContent = "Pick a job."; return; }

    const jobs = await loadJobs();
    const j = jobs.find((x) => x.id === id);
    if (!j) { cStatus.textContent = "Job not found."; return; }

    // NOTE: This stores photo *names only*; actual file upload not implemented yet
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

    await apiSet(KEYS.reviews, reviews);

    j.status = "complete_pending_review";
    await apiSet(KEYS.jobs, jobs);

    cStatus.textContent = "Submitted for admin review.";
    cForm.reset();
    await refreshCompleteSelect();
    await renderCompletions();
  });

  async function renderCompletions() {
    const me = (myEmail() || "").toLowerCase();
    const rows = (await loadReviews())
      .filter((r) => (r.employee || "").toLowerCase() === me)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((r) => `<tr><td>${r.date || ""}</td><td>${r.title || ""}</td><td>${r.status || "pending"}</td><td>${r.notes || ""}</td></tr>`)
      .join("") || '<tr><td colspan="4" class="muted">No submissions.</td></tr>';
    $("#emp_completions tbody").innerHTML = rows;
  }

  // ---- hours ----
  async function loadTimesheets() { return (await apiGet(KEYS.timesheets)) || []; }

  const hForm = byId("emp-hours-form");
  const hStatus = byId("eh_status");

  hForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
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
    await apiSet(KEYS.timesheets, list);
    hStatus.textContent = "Saved.";
    hForm.reset();
    await renderHours();
  });

  async function renderHours() {
    const me = (myEmail() || "").toLowerCase();
    const rows = (await loadTimesheets())
      .filter((t) => (t.employee_email || "").toLowerCase() === me)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((t) => `<tr><td>${t.date}</td><td>${t.hours || 0}</td><td>${t.approved ? "approved" : "pending"}</td><td>${t.notes || ""}</td></tr>`)
      .join("") || '<tr><td colspan="4" class="muted">No hours yet.</td></tr>';
    $("#emp_hours_table tbody").innerHTML = rows;
  }

  // ---- paystubs ----
  async function renderPaystubs() {
    const me = (myEmail() || "").toLowerCase();
    const list = (await apiGet(KEYS.paystubs)) || [];
    const rows = list
      .filter((p) => (p.employee || "").toLowerCase() === me)
      .sort((a, b) => (a.period || "").localeCompare(b.period || ""))
      .map((p) => `<tr><td>${p.period}</td><td>${p.hours}</td><td>${money(p.gross)}</td><td>${p.status || "issued"}</td><td><button class="button" disabled>Download</button></td></tr>`)
      .join("") || '<tr><td colspan="5" class="muted">No paystubs yet.</td></tr>';
    $("#emp_paystubs tbody").innerHTML = rows;
  }

  // ---- PTO ----
  async function loadPTO() { return (await apiGet(KEYS.pto)) || []; }

  const ptoForm = byId("pto-form");
  const ptoStatus = byId("pto_status");

  ptoForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const list = await loadPTO();
    list.push({
      id: crypto.randomUUID(),
      employee: myEmail(),
      from: byId("pto_from").value,
      to: byId("pto_to").value,
      reason: byId("pto_reason").value.trim(),
      status: "pending",
    });
    await apiSet(KEYS.pto, list);
    ptoStatus.textContent = "Request submitted.";
    ptoForm.reset();
    await renderPTO();
  });

  async function renderPTO() {
    const me = (myEmail() || "").toLowerCase();
    const rows = (await loadPTO())
      .filter((p) => (p.employee || "").toLowerCase() === me)
      .sort((a, b) => (a.from < b.from ? 1 : -1))
      .map((p) => `<tr><td>${p.from || ""}</td><td>${p.to || ""}</td><td>${p.reason || ""}</td><td>${p.status || "pending"}</td></tr>`)
      .join("") || '<tr><td colspan="4" class="muted">No requests.</td></tr>';
    $("#pto_table_emp tbody").innerHTML = rows;
  }

  // ---- comments ----
  async function loadEmpComments() { return (await apiGet(KEYS.emp_comments)) || []; }

  const cmForm = byId("emp-comment-form");
  const cmStatus = byId("cmpl_status");
  const cmSel = byId("cmpl_job");

  async function refreshCompletedJobsForComments() {
    const me = (myEmail() || "").toLowerCase();
    const jobs = (await loadReviews()).filter((r) => (r.employee || "").toLowerCase() === me);
    cmSel.innerHTML =
      jobs.map((j) => `<option value="${j.id}">${j.date || ""} • ${j.title || ""}</option>`).join("") ||
      '<option value="">No completed jobs yet</option>';
  }

  cmForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
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

    await apiSet(KEYS.emp_comments, list);
    cmStatus.textContent = "Comment submitted.";
    cmForm.reset();
    await renderEmpComments();
  });

  async function renderEmpComments() {
    const me = (myEmail() || "").toLowerCase();
    const rows = (await loadEmpComments())
      .filter((c) => (c.employee || "").toLowerCase() === me)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((c) => `<tr><td>${c.date}</td><td>${c.job_review_id}</td><td>${c.text || ""}</td><td>${c.status || ""}</td></tr>`)
      .join("") || '<tr><td colspan="4" class="muted">No comments yet.</td></tr>';
    $("#emp_comments_table tbody").innerHTML = rows;
  }

  // ---- init (fail loudly) ----
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
      fatal("We couldn’t load your employee portal data. Please refresh, and if it continues contact an admin.", String(e?.message || e));
    }
  })();
})();
