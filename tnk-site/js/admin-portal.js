(() => {
  const userEl = document.getElementById("admin-user");
  const statusEl = document.getElementById("admin-status");
  const logoutBtn = document.getElementById("admin-logout");
  const customerForm = document.getElementById("admin-customer-form");
  const customerList = document.getElementById("admin-customer-list");
  const jobForm = document.getElementById("admin-job-form");
  const jobList = document.getElementById("admin-job-list");
  const timeList = document.getElementById("admin-time-list");
  const timeoffList = document.getElementById("admin-timeoff-list");

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

  const loadCustomers = async () => {
    const data = await apiRequest("/api/customers");
    const items = toArray(data?.customers).map((customer) => {
      const li = document.createElement("li");
      li.textContent = `${customer.name} (${customer.status})`;
      return li;
    });
    renderList(customerList, items, "No customers yet.");
  };

  const loadJobs = async () => {
    const data = await apiRequest("/api/jobs");
    const items = toArray(data?.jobs).map((job) => {
      const li = document.createElement("li");
      const label = document.createElement("div");
      label.textContent = `${job.title} — ${job.status}`;
      const select = document.createElement("select");
      ["not_started", "in_progress", "submitted", "approved", "rejected"].forEach((status) => {
        const option = document.createElement("option");
        option.value = status;
        option.textContent = status.replace("_", " ");
        if (status === job.status) option.selected = true;
        select.appendChild(option);
      });
      const button = document.createElement("button");
      button.className = "button button--primary";
      button.type = "button";
      button.textContent = "Update";
      button.addEventListener("click", async () => {
        await apiRequest("/api/jobs", {
          method: "PATCH",
          body: JSON.stringify({ id: job.id, status: select.value })
        });
        loadJobs();
      });
      li.appendChild(label);
      li.appendChild(select);
      li.appendChild(button);
      return li;
    });
    renderList(jobList, items, "No jobs created yet.");
  };

  const loadTimeEntries = async () => {
    const data = await apiRequest("/api/time-entries");
    const items = toArray(data?.entries).map((entry) => {
      const li = document.createElement("li");
      li.textContent = `${entry.userEmail || entry.userId} — ${entry.status} (${entry.clockIn})`;
      return li;
    });
    renderList(timeList, items, "No time entries recorded yet.");
  };

  const loadTimeOff = async () => {
    const data = await apiRequest("/api/time-off");
    const items = toArray(data?.requests).map((request) => {
      const li = document.createElement("li");
      const text = document.createElement("div");
      text.textContent = `${request.userEmail || request.userId}: ${request.startDate} → ${request.endDate} (${request.status})`;
      li.appendChild(text);
      if (request.status === "pending") {
        ["approved", "denied"].forEach((status) => {
          const button = document.createElement("button");
          button.className = "button button--primary";
          button.type = "button";
          button.textContent = status === "approved" ? "Approve" : "Deny";
          button.addEventListener("click", async () => {
            await apiRequest("/api/time-off", {
              method: "PATCH",
              body: JSON.stringify({ id: request.id, status })
            });
            loadTimeOff();
          });
          li.appendChild(button);
        });
      }
      return li;
    });
    renderList(timeoffList, items, "No time-off requests yet.");
  };

  const loadAll = async () => {
    const tasks = [];
    if (customerForm || customerList) {
      tasks.push(safeLoad(loadCustomers, customerList, "Unable to load customers."));
    }
    if (jobForm || jobList) {
      tasks.push(safeLoad(loadJobs, jobList, "Unable to load jobs."));
    }
    if (timeList) {
      tasks.push(safeLoad(loadTimeEntries, timeList, "Unable to load time entries."));
    }
    if (timeoffList) {
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
      const config = window.tnkAuth.getConfig?.() || {};
      const adminRole = config.adminRole || "admin";
      if (!profile.roles.includes(adminRole)) {
        userEl.textContent = "Admin access required. Redirecting to employee portal...";
        window.location.href = "employee.html";
        return;
      }
      userEl.textContent = `Signed in as ${profile.user?.name || profile.user?.email || "Admin"}.`;
      await loadAll();
    } catch (error) {
      userEl.textContent = "Unable to load admin profile.";
      setStatus("");
    }
  };

  logoutBtn.addEventListener("click", () => window.tnkAuth.logout());

  customerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(customerForm);
    try {
      await apiRequest("/api/customers", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(formData.entries()))
      });
      customerForm.reset();
      loadCustomers();
    } catch (error) {
      setStatus(error.message);
    }
  });

  jobForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(jobForm);
    try {
      await apiRequest("/api/jobs", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(formData.entries()))
      });
      jobForm.reset();
      loadJobs();
    } catch (error) {
      setStatus(error.message);
    }
  });

  boot();
})();
