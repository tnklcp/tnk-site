(() => {
  const userEl = document.getElementById("admin-user");
  const logoutBtn = document.getElementById("admin-logout");
  const customerForm = document.getElementById("admin-customer-form");
  const customerList = document.getElementById("admin-customer-list");
  const jobForm = document.getElementById("admin-job-form");
  const jobList = document.getElementById("admin-job-list");
  const timeList = document.getElementById("admin-time-list");
  const timeoffList = document.getElementById("admin-timeoff-list");

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

  const loadCustomers = async () => {
    const data = await apiRequest("/api/customers");
    const items = data.customers.map((customer) => {
      const li = document.createElement("li");
      li.textContent = `${customer.name} (${customer.status})`;
      return li;
    });
    renderList(customerList, items, "No customers yet.");
  };

  const loadJobs = async () => {
    const data = await apiRequest("/api/jobs");
    const items = data.jobs.map((job) => {
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
    const items = data.entries.map((entry) => {
      const li = document.createElement("li");
      li.textContent = `${entry.userEmail || entry.userId} — ${entry.status} (${entry.clockIn})`;
      return li;
    });
    renderList(timeList, items, "No time entries recorded yet.");
  };

  const loadTimeOff = async () => {
    const data = await apiRequest("/api/time-off");
    const items = data.requests.map((request) => {
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
    await Promise.all([loadCustomers(), loadJobs(), loadTimeEntries(), loadTimeOff()]);
  };

  const boot = async () => {
    try {
      await window.tnkAuth.requireAuth();
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
      userEl.textContent = "Unable to load admin portal.";
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
      userEl.textContent = error.message;
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
      userEl.textContent = error.message;
    }
  });

  boot();
})();
