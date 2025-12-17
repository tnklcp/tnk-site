/* TNK Employee Portal — Identity guard + tabs + Netlify-backed data (NO localStorage, fail loudly) */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const byId = (id) => document.getElementById(id);
  const money = (n) => `$${(Number(n || 0)).toFixed(2)}`;
  const todayISO = () => new Date().toISOString().slice(0, 10);

  // ----- Auth: employee or admin -----
  function assertAllowed() {
    const role = sessionStorage.getItem("tnk_role");
    if (role === "employee" || role === "admin") return true;
    location.replace("login.html");
    return false;
  }
  if (!assertAllowed()) return;

  byId("emp-logout")?.addEventListener("click", (e) => {
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

  async function apiGet(name) {
    const t = await token();
    const res = await fetch(`/.netlify/functions/collections?name=${encodeURIComponent(name)}`, {
      headers: {
        "Content-Type": "application/json",
        ...(t ? { Authorization: `Bearer ${t}` } : {})
      }
    });
    if (!res.ok) throw new Error(`GET ${name} failed: ${res.status} ${res.statusText}`);
    const j = await res.json();
    return (j && j.data) ?? null;
  }

  async function apiSet(name, data) {
    const t = await token();
    const res = await fetch(`/.netlify/functions/collections`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(t ? { Authorization: `Bearer ${t}` } : {})
      },
      body: JSON.stringify({ name, data })
    });
    if (!res.ok) throw new Error(`PUT ${name} failed: ${res.status} ${res.statusText}`);
  }

  function showFatal(err) {
    console.error(err);
    const root = byId("emp-root") || document.body;
    const div = document.createElement("div");
    div.className = "card";
    div.style.border = "1px solid #e6b6b6";
    div.innerHTML = `
      <h2 style="color:#7b1f1f;margin-top:0;">Data Error</h2>
      <p class="muted">The employee portal could not load/save data from Netlify.</p>
      <pre style="white-space:pre-wrap;background:#fff;border:1px solid #e6b6b6;padding:.75rem;border-radius:10px;">${String(err?.message || err)}</pre>
    `;
    root.prepend(div);
    throw err;
  }

  const KEYS = {
    jobs: "tnk_jobs",
    reviews: "tnk_reviews",
    timesheets: "tnk_timesheets",
    pto: "tnk_pto",
    paystubs: "tnk_paystubs",
    emp_comments: "tnk_emp_comments"
  };

  // ----- tabs (clean) -----
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

  // ----- data loads/saves -----
  async function loadJobs() { return (await apiGet(KEYS.jobs)) || []; }
  async function loadReviews() { return (await apiGet(KEYS.reviews)) || []; }
  async function loadTimesheets() { return (await apiGet(KEYS.timesheets)) || []; }
  async function loadPaystubs() { return (await apiGet(KEYS.paystubs)) || []; }
  async function loadPTO() { return (await apiGet(KEYS.pto)) || []; }
  async function loadEmpComments() { return (await apiGet(KEYS.emp_comments)) || []; }

  async function saveJobs(v) { await apiSet(KEYS.jobs, v); }
  async function saveReviews(v) { await apiSet(KEYS.reviews, v); }
  async function saveTimesheets(v) { await apiSet(KEYS.timesheets, v); }
  async function savePTO(v) { await apiSet(KEYS.pto, v); }
  async function saveEmpComments(v) { await apiSet(KEYS.emp_comments, v); }

  // ----- jobs: Today -----
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
    if (todayBody) todayBody.innerHTML = rows || `<tr><td colspan="4" class="muted">No jobs today.</td></tr>`;
  }

  todayBody?.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr"); if (!tr) return;
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
      .filter((j) => !j.assignee || (j.assignee || "").toLowerCase() === me)
      .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.start || "").localeCompare(b.start || ""))
      .map((j) => `<div class="slot"><div>${j.date || ""} ${j.start || ""}</div><div><strong>${(j.customer || "").split("@")[0]}</strong> — ${j.title || ""}</div></div>`)
      .join("");
    byId("emp_week_calendar").innerHTML = rows || `<p class="muted">No jobs.</p>`;
  }

  // ----- complete job -----
  const cForm = byId("emp-complete-form");
  const cSel = byId("c_job");
  const cStatus = byId("c_status");

  async function refreshCompleteSelect() {
    const me = myEmail();
    const jobs = await loadJobs();
    cSel.innerHTML =
      `<option value="">Select…</option>` +
      jobs
        .filter((j) =>
          (!j.assignee || (j.assignee || "").toLowerCase() === me) &&
          (j.status === "scheduled" || j.status === "in_progress")
        )
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

    await saveReviews(list);

    j.status = "complete_pending_review";
    await saveJobs(jobs);

    cStatus.textContent = "Submitted for admin review.";
    cForm.reset();
    await refreshCompleteSelect();
    await renderCompletions();
  });

  // ----- hours -----
  const hForm = byId("emp-hours-form");
  const hStatus = byId("eh_status");

  async function renderHours() {
    const me = myEmail();
    const rows = (await loadTimesheets())
      .filter((t) => (t.employee_email || "").toLowerCase() === me)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((t) => `<tr><td>${t.date}</td><td>${t.hours || 0}</td><td>${t.approved ? "approved" : "pending"}</td><td>${t.notes || ""}</td></tr>`)
      .join("") || '<tr><td colspan="4" class="muted">No hours yet.</td></tr>';
    $("#emp_hours_table tbody").innerHTML = rows;
  }

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
      approved: false
    });
    await saveTimesheets(list);
    hStatus.textContent = "Saved.";
    hForm.reset();
    await renderHours();
  });

  // ----- paystubs -----
  async function renderPaystubs() {
    const me = myEmail();
    const rows = (await loadPaystubs())
      .filter((p) => (p.employee || "").toLowerCase() === me)
      .sort((a, b) => (a.period || "").localeCompare(b.period || ""))
      .map((p) => `<tr><td>${p.period}</td><td>${p.hours}</td><td>${money(p.gross)}</td><td>${p.status || "issued"}</td><td><button class="button" disabled>Download</button></td></tr>`)
      .join("") || '<tr><td colspan="5" class="muted">No paystubs yet.</td></tr>';
    $("#emp_paystubs tbody").innerHTML = rows;
  }

  // ----- PTO -----
  const ptoForm = byId("pto-form");
  const ptoStatus = byId("pto_status");

  async function renderPTO() {
    const me = myEmail();
    const rows = (await loadPTO())
      .filter((p) => (p.employee || "").toLowerCase() === me)
      .sort((a, b) => (a.from < b.from ? 1 : -1))
      .map((p) => `<tr><td>${p.from || ""}</td><td>${p.to || ""}</td><td>${p.reason || ""}</td><td>${p.status || "pending"}</td></tr>`)
      .join("") || '<tr><td colspan="4" class="muted">No requests.</td></tr>';
    $("#pto_table_emp tbody").innerHTML = rows;
  }

  ptoForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const list = await loadPTO();
    list.push({
      id: crypto.randomUUID(),
      employee: myEmail(),
      from: byId("pto_from").value,
      to: byId("pto_to").value,
      reason: byId("pto_reason").value.trim(),
      status: "pending"
    });
    await savePTO(list);
    ptoStatus.textContent = "Request submitted.";
    ptoForm.reset();
    await renderPTO();
  });

  // ----- comments on completed jobs -----
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

  async function renderEmpComments() {
    const me = myEmail();
    const rows = (await loadEmpComments())
      .filter((c) => (c.employee || "").toLowerCase() === me)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((c) => `<tr><td>${c.date}</td><td>${c.job_review_id}</td><td>${c.text || ""}</td><td>${c.status || ""}</td></tr>`)
      .join("") || '<tr><td colspan="4" class="muted">No comments yet.</td></tr>';
    $("#emp_comments_table tbody").innerHTML = rows;
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
      status: "submitted"
    });
    await saveEmpComments(list);
    cmStatus.textContent = "Comment submitted.";
    cmForm.reset();
    await renderEmpComments();
  });

  // ----- init -----
  (async function init() {
    try {
      const email = myEmail();
      if (!email) throw new Error("No logged-in user email found in session/identity.");

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
      showFatal(e);
    }
  })();
})();
