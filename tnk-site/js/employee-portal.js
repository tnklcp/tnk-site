(() => {
  const userEl = document.getElementById("employee-user");
  const statusEl = document.getElementById("employee-status");
  const logoutBtn = document.getElementById("employee-logout");
  const jobList = document.getElementById("employee-job-list");
  const timeForm = document.getElementById("employee-time-form");
  const timeList = document.getElementById("employee-time-list");
  const timeoffForm = document.getElementById("employee-timeoff-form");
  const timeoffList = document.getElementById("employee-timeoff-list");

  if (!userEl || !logoutBtn) return;

  const setStatus = (message = "") => {
    if (!statusEl) return;
    statusEl.textContent = message;
  };

  const apiRequest = async (path, options = {}) => {
    const parseErrorDetail = async (response) => {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return response.json().catch(() => null);
      }
      return response.text().catch(() => "");
    };

    const stringifyDetail = (detail) => {
      if (!detail) return "";
      if (typeof detail === "string") return detail.trim();
      if (typeof detail === "object") {
        if (detail.error) return String(detail.error);
        try {
          return JSON.stringify(detail);
        } catch {
          return String(detail);
        }
      }
      return String(detail);
    };

    const truncate = (value, max = 300) => {
      if (!value) return "";
      return value.length > max ? `${value.slice(0, max)}…` : value;
    };

    const send = async (forceRefresh = false) => {
      const token = await window.tnkAuth.getAccessToken(forceRefresh);
      const headers = new Headers(options.headers || {});
      headers.set("authorization", `Bearer ${token}`);
      if (options.body && !headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
      return fetch(path, { ...options, headers });
    };

    let response = await send(false);
    if (!response.ok && response.status === 401) {
      response = await send(true);
    }
    if (!response.ok) {
      const detail = await parseErrorDetail(response);
      const detailText = truncate(stringifyDetail(detail));
      const statusLabel = `${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
      const parts = [`Request failed (${statusLabel})`, `Endpoint: ${path}`];
      if (detailText) parts.push(`Detail: ${detailText}`);
      const err = new Error(parts.join(" | "));
      err.status = response.status;
      err.statusText = response.statusText;
      err.endpoint = path;
      err.detail = detail;
      throw err;
    }
    return response.json();
  };

  const toArray = (value) => (Array.isArray(value) ? value : []);

  const formatErrorSummary = (error) => {
    if (!error) return "Unknown error.";
    if (typeof error === "string") return error;
    if (error.message) return error.message;
    return String(error);
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

  const safeLoad = async (loader, listEl, errorMessage) => {
    try {
      await loader();
      return true;
    } catch (error) {
      const detail = formatErrorSummary(error);
      if (listEl) {
        renderList(listEl, [], `${errorMessage || "Unable to load data."} ${detail}`);
      }
      setStatus(`${errorMessage || "Unable to load data."} ${detail}`);
      console.error("Dashboard load failed:", error);
      return false;
    }
  };

  const loadJobs = async () => {
    const data = await apiRequest("/api/jobs");
    const items = toArray(data?.jobs).map((job) => {
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
    const items = toArray(data?.entries).map((entry) => {
      const li = document.createElement("li");
      li.textContent = `${entry.status} — ${entry.clockIn}${entry.clockOut ? ` → ${entry.clockOut}` : ""}`;
      return li;
    });
    renderList(timeList, items, "No time entries yet.");
  };

  const loadTimeOff = async () => {
    const data = await apiRequest("/api/time-off");
    const items = toArray(data?.requests).map((request) => {
      const li = document.createElement("li");
      li.textContent = `${request.startDate} → ${request.endDate} (${request.status})`;
      return li;
    });
    renderList(timeoffList, items, "No time-off requests yet.");
  };

  const loadAll = async () => {
    const tasks = [];
    if (jobList) {
      tasks.push(safeLoad(loadJobs, jobList, "Unable to load jobs."));
    }
    if (timeList || timeForm) {
      tasks.push(safeLoad(loadTimeEntries, timeList, "Unable to load time entries."));
    }
    if (timeoffList || timeoffForm) {
      tasks.push(safeLoad(loadTimeOff, timeoffList, "Unable to load time-off requests."));
    }
    const results = await Promise.all(tasks);
    if (results.some((ok) => !ok)) {
      setStatus("Some dashboard sections could not be loaded. Refresh to try again.");
    } else {
      setStatus("");
    }
  };

  const boot = async () => {
    try {
      const user = await window.tnkAuth.requireAuth();
      if (!user) return;
      const profile = await window.tnkAuth.getUserProfile();
      userEl.textContent = `Signed in as ${profile.user?.name || profile.user?.email || "Employee"}.`;
      await loadAll();
    } catch (error) {
      userEl.textContent = "Unable to load employee profile.";
      setStatus("");
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
      setStatus(error.message);
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
      setStatus(error.message);
    }
  });

  boot();
})();
