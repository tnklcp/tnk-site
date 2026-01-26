(() => {
  const userEl = document.getElementById("employee-user");
  const logoutBtn = document.getElementById("employee-logout");
  const jobList = document.getElementById("employee-job-list");
  const timeForm = document.getElementById("employee-time-form");
  const timeList = document.getElementById("employee-time-list");
  const timeoffForm = document.getElementById("employee-timeoff-form");
  const timeoffList = document.getElementById("employee-timeoff-list");

  if (!userEl || !logoutBtn) return;

  const apiRequest = async (path, options = {}) => {
    const token = await window.tnkAuth.getAccessToken();
    const headers = new Headers(options.headers || {});
    headers.set("authorization", `Bearer ${token}`);
    if (options.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const response = await fetch(path, { ...options, headers });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Request failed.");
    }
    return response.json();
  };

  const renderList = (el, items, emptyMessage) => {
    if (!el) return;
    el.innerHTML = "";
    if (!items.length) {
      const li = document.createElement("li");
      li.textContent = emptyMessage;
      el.appendChild(li);
      return;
    }
    items.forEach((item) => el.appendChild(item));
  };

  const loadJobs = async () => {
    const data = await apiRequest("/api/jobs");
    const items = data.jobs.map((job) => {
      const li = document.createElement("li");
      const label = document.createElement("div");
      label.textContent = `${job.title} — ${job.status}`;
      const startBtn = document.createElement("button");
      startBtn.className = "button button--primary";
      startBtn.type = "button";
      startBtn.textContent = "Start";
      startBtn.addEventListener("click", async () => {
        await apiRequest("/api/jobs", {
          method: "PATCH",
          body: JSON.stringify({ id: job.id, status: "in_progress" })
        });
        loadJobs();
      });
      const submitBtn = document.createElement("button");
      submitBtn.className = "button button--accent";
      submitBtn.type = "button";
      submitBtn.textContent = "Submit";
      submitBtn.addEventListener("click", async () => {
        await apiRequest("/api/jobs", {
          method: "PATCH",
          body: JSON.stringify({ id: job.id, status: "submitted" })
        });
        loadJobs();
      });
      li.appendChild(label);
      li.appendChild(startBtn);
      li.appendChild(submitBtn);
      return li;
    });
    renderList(jobList, items, "No assigned jobs found.");
  };

  const loadTimeEntries = async () => {
    const data = await apiRequest("/api/time-entries");
    const items = data.entries.map((entry) => {
      const li = document.createElement("li");
      li.textContent = `${entry.status} — ${entry.clockIn}${entry.clockOut ? ` → ${entry.clockOut}` : ""}`;
      return li;
    });
    renderList(timeList, items, "No time entries yet.");
  };

  const loadTimeOff = async () => {
    const data = await apiRequest("/api/time-off");
    const items = data.requests.map((request) => {
      const li = document.createElement("li");
      li.textContent = `${request.startDate} → ${request.endDate} (${request.status})`;
      return li;
    });
    renderList(timeoffList, items, "No time-off requests yet.");
  };

  const loadAll = async () => {
    await Promise.all([loadJobs(), loadTimeEntries(), loadTimeOff()]);
  };

  const boot = async () => {
    try {
      await window.tnkAuth.requireAuth();
      const profile = await window.tnkAuth.getUserProfile();
      userEl.textContent = `Signed in as ${profile.user?.name || profile.user?.email || "Employee"}.`;
      await loadAll();
    } catch (error) {
      userEl.textContent = "Unable to load employee portal.";
    }
  };

  logoutBtn.addEventListener("click", () => window.tnkAuth.logout());

  timeForm?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    if (!target.dataset.action) return;
    event.preventDefault();
    const formData = new FormData(timeForm);
    const body = Object.fromEntries(formData.entries());
    body.action = target.dataset.action;
    try {
      await apiRequest("/api/time-entries", {
        method: "POST",
        body: JSON.stringify(body)
      });
      timeForm.reset();
      loadTimeEntries();
    } catch (error) {
      userEl.textContent = error.message;
    }
  });

  timeoffForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(timeoffForm);
    try {
      await apiRequest("/api/time-off", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(formData.entries()))
      });
      timeoffForm.reset();
      loadTimeOff();
    } catch (error) {
      userEl.textContent = error.message;
    }
  });

  boot();
})();
