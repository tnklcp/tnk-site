(() => {
  const userEl = document.getElementById("admin-user");
  const statusEl = document.getElementById("admin-status");
  const logoutBtn = document.getElementById("admin-logout");
  const customerForm = document.getElementById("admin-customer-form");
  const customerList = document.getElementById("admin-customer-list");
  const jobForm = document.getElementById("admin-job-form");
  const jobList = document.getElementById("admin-job-list");
  const timeList = document.getElementById("admin-time-list");
  const openTimeList = document.getElementById("admin-open-time-list");
  const timeoffList = document.getElementById("admin-timeoff-list");
  const recurrenceTypeSelect = document.getElementById("job-recurrence-type");
  const recurrenceIntervalInput = document.getElementById("job-recurrence-interval");
  const recurrenceUnitSelect = document.getElementById("job-recurrence-unit");
  const payPeriodRangeEl = document.getElementById("admin-pay-period-range");
  const payPeriodCurrentList = document.getElementById("admin-pay-period-current-list");
  const payPeriodEmployeeList = document.getElementById("admin-pay-period-employee-list");
  const payPeriodHistoryTitle = document.getElementById("admin-pay-period-history-title");
  const payPeriodHistoryList = document.getElementById("admin-pay-period-history-list");
  const payPeriodTabs = document.getElementById("admin-pay-period-tabs");
  const payPeriodTabPanel = document.getElementById("admin-pay-period-panel");
  const payPeriodTabTitle = document.getElementById("admin-pay-period-tab-title");
  const payPeriodTabList = document.getElementById("admin-pay-period-tab-list");
  const adjustForm = document.getElementById("admin-adjust-form");
  const adjustStatusEl = document.getElementById("admin-adjust-status");
  const adjustEmployeeSelect = document.getElementById("admin-adjust-employee");
  const adjustDateInput = document.getElementById("admin-adjust-date");
  const adjustTypeSelect = document.getElementById("admin-adjust-type");
  const adjustHoursInput = document.getElementById("admin-adjust-hours");
  const adjustMinutesInput = document.getElementById("admin-adjust-minutes");
  const adjustNotesInput = document.getElementById("admin-adjust-notes");
  const dailyTabs = document.getElementById("admin-daily-tabs");
  const dailyTabPanel = document.getElementById("admin-daily-panel");
  const dailyTabTitle = document.getElementById("admin-daily-tab-title");
  const dailyTabList = document.getElementById("admin-daily-tab-list");
  const dailyRangeEl = document.getElementById("admin-daily-range");
  const dailyStartInput = document.getElementById("admin-daily-start");
  const dailyEndInput = document.getElementById("admin-daily-end");
  const dailyResetBtn = document.getElementById("admin-daily-reset");

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

  const formatDateTime = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  };

  const formatServiceDate = (value) => {
    if (!value) return "";
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric"
    }).format(date);
  };

  const formatDuration = (clockIn, clockOut) => {
    if (!clockIn || !clockOut) return "";
    const start = new Date(clockIn);
    const end = new Date(clockOut);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
    const diffMs = Math.max(0, end.getTime() - start.getTime());
    const totalMinutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const hoursLabel = String(hours).padStart(2, "0");
    const minutesLabel = String(minutes).padStart(2, "0");
    return `${hoursLabel}:${minutesLabel}`;
  };

  const PAY_PERIOD_ANCHOR = new Date("2026-01-25T00:00:00");
  const PAY_PERIOD_DAYS = 14;
  const MS_PER_DAY = 86400000;

  const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const addDays = (date, days) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  };

  const formatDate = (date) =>
    new Intl.DateTimeFormat("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric"
    }).format(date);

  const formatMinutes = (minutes) => {
    const totalMinutes = Math.max(0, Math.round(minutes));
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  };

  const formatSignedMinutes = (minutes) => {
    const sign = minutes < 0 ? "-" : "+";
    return `${sign}${formatMinutes(Math.abs(minutes))}`;
  };

  const getPayPeriodForDate = (date) => {
    const base = startOfDay(PAY_PERIOD_ANCHOR);
    const target = startOfDay(date);
    const diffDays = Math.floor((target.getTime() - base.getTime()) / MS_PER_DAY);
    const index = Math.floor(diffDays / PAY_PERIOD_DAYS);
    const start = addDays(base, index * PAY_PERIOD_DAYS);
    const end = addDays(start, PAY_PERIOD_DAYS - 1);
    return { index, start, end };
  };

  const getEntryInterval = (entry, now) => {
    if (!entry?.clockIn) return null;
    const start = new Date(entry.clockIn);
    if (Number.isNaN(start.getTime())) return null;
    const end = entry.clockOut ? new Date(entry.clockOut) : now;
    if (Number.isNaN(end.getTime())) return null;
    return { start, end, open: !entry.clockOut };
  };

  const getOverlapMinutes = (start, end, periodStart, periodEndExclusive) => {
    const rangeStart = Math.max(start.getTime(), periodStart.getTime());
    const rangeEnd = Math.min(end.getTime(), periodEndExclusive.getTime());
    if (rangeEnd <= rangeStart) return 0;
    return (rangeEnd - rangeStart) / 60000;
  };

  const sumMinutesForPeriod = (entries, periodStart, periodEnd, now, includeOpen) => {
    if (!entries?.length) return 0;
    const periodEndExclusive = addDays(periodEnd, 1);
    return entries.reduce((total, entry) => {
      if (typeof entry.adjustMinutes === "number") {
        const effective = new Date(entry.clockIn);
        if (!Number.isNaN(effective.getTime())) {
          if (effective >= periodStart && effective < periodEndExclusive) {
            return total + entry.adjustMinutes;
          }
        }
        return total;
      }
      const interval = getEntryInterval(entry, now);
      if (!interval) return total;
      if (interval.open && !includeOpen) return total;
      return total + getOverlapMinutes(interval.start, interval.end, periodStart, periodEndExclusive);
    }, 0);
  };

  const applyRecurrenceState = (typeSelect, intervalInput, unitSelect) => {
    if (!typeSelect || !intervalInput || !unitSelect) return;
    const isRecurring = typeSelect.value === "recurring";
    intervalInput.disabled = !isRecurring;
    unitSelect.disabled = !isRecurring;
  };

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
      const label = document.createElement("div");
      label.textContent = `${customer.name} (${customer.status})`;
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "button button--accent";
      deleteBtn.type = "button";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", async () => {
        if (!window.confirm(`Delete customer ${customer.name}? This cannot be undone.`)) return;
        await apiRequest("/api/customers", {
          method: "DELETE",
          body: JSON.stringify({ id: customer.id })
        });
        loadCustomers();
      });
      li.appendChild(label);
      li.appendChild(deleteBtn);
      return li;
    });
    renderList(customerList, items, "No customers yet.");
  };

  const loadJobs = async () => {
    const data = await apiRequest("/api/jobs");
    const items = toArray(data?.jobs).map((job) => {
      const li = document.createElement("li");
      const label = document.createElement("div");
      const statusLabel = String(job.status || "").replace("_", " ");
      const customerLabel = job.customerName ? ` — ${job.customerName}` : "";
      label.textContent = `${job.title}${customerLabel} (${statusLabel})`;

      const meta = document.createElement("div");
      meta.className = "job-meta";
      const serviceDateLabel = job.serviceDate ? formatServiceDate(job.serviceDate) : "Not scheduled";
      const recurrenceLabel = job.isRecurring
        ? `Recurring every ${job.recurrenceInterval || 1} ${job.recurrenceUnit || "week"}(s)`
        : "One-time job";
      const nextServiceLabel = job.isRecurring && job.nextServiceDate
        ? formatServiceDate(job.nextServiceDate)
        : "Not set";
      meta.textContent = `Service date: ${serviceDateLabel} · ${recurrenceLabel} · Next: ${nextServiceLabel}`;

      const timing = document.createElement("div");
      timing.className = "job-meta";
      const startedLabel = formatDateTime(job.startedAt);
      const completedLabel = formatDateTime(job.completedAt);
      const durationLabel = formatDuration(job.startedAt, job.completedAt);
      const timingParts = [];
      if (startedLabel) timingParts.push(`Started: ${startedLabel}`);
      if (completedLabel) timingParts.push(`Completed: ${completedLabel}`);
      if (durationLabel) timingParts.push(`Total: ${durationLabel}`);
      timing.textContent = timingParts.join(" · ");

      const editWrap = document.createElement("div");
      editWrap.className = "job-inline";

      const customerField = document.createElement("label");
      customerField.textContent = "Customer";
      const customerInput = document.createElement("input");
      customerInput.type = "text";
      customerInput.value = job.customerName || "";
      customerField.appendChild(customerInput);
      const customerWrap = document.createElement("div");
      customerWrap.className = "field";
      customerWrap.appendChild(customerField);

      const assignedField = document.createElement("label");
      assignedField.textContent = "Assigned To";
      const assignedInput = document.createElement("input");
      assignedInput.type = "text";
      assignedInput.value = Array.isArray(job.assignedTo) ? job.assignedTo.join(", ") : "";
      assignedField.appendChild(assignedInput);
      const assignedWrap = document.createElement("div");
      assignedWrap.className = "field";
      assignedWrap.appendChild(assignedField);

      const serviceField = document.createElement("label");
      serviceField.textContent = "Service Date";
      const serviceInput = document.createElement("input");
      serviceInput.type = "date";
      serviceInput.value = job.serviceDate || "";
      serviceField.appendChild(serviceInput);
      const serviceWrap = document.createElement("div");
      serviceWrap.className = "field";
      serviceWrap.appendChild(serviceField);

      const typeField = document.createElement("label");
      typeField.textContent = "Job Type";
      const typeSelect = document.createElement("select");
      [
        { value: "one_time", label: "One-time" },
        { value: "recurring", label: "Recurring" }
      ].forEach((optionData) => {
        const option = document.createElement("option");
        option.value = optionData.value;
        option.textContent = optionData.label;
        typeSelect.appendChild(option);
      });
      typeSelect.value = job.isRecurring ? "recurring" : "one_time";
      typeField.appendChild(typeSelect);
      const typeWrap = document.createElement("div");
      typeWrap.className = "field";
      typeWrap.appendChild(typeField);

      const intervalField = document.createElement("label");
      intervalField.textContent = "Interval";
      const intervalInput = document.createElement("input");
      intervalInput.type = "number";
      intervalInput.min = "1";
      intervalInput.value = String(job.recurrenceInterval || 1);
      intervalField.appendChild(intervalInput);
      const intervalWrap = document.createElement("div");
      intervalWrap.className = "field";
      intervalWrap.appendChild(intervalField);

      const unitField = document.createElement("label");
      unitField.textContent = "Unit";
      const unitSelect = document.createElement("select");
      [
        { value: "week", label: "Week(s)" },
        { value: "day", label: "Day(s)" },
        { value: "month", label: "Month(s)" }
      ].forEach((optionData) => {
        const option = document.createElement("option");
        option.value = optionData.value;
        option.textContent = optionData.label;
        unitSelect.appendChild(option);
      });
      unitSelect.value = job.recurrenceUnit || "week";
      unitField.appendChild(unitSelect);
      const unitWrap = document.createElement("div");
      unitWrap.className = "field";
      unitWrap.appendChild(unitField);

      const statusField = document.createElement("label");
      statusField.textContent = "Status";
      const select = document.createElement("select");
      ["not_started", "in_progress", "submitted", "approved", "rejected"].forEach((status) => {
        const option = document.createElement("option");
        option.value = status;
        option.textContent = status.replace("_", " ");
        if (status === job.status) option.selected = true;
        select.appendChild(option);
      });
      statusField.appendChild(select);
      const statusWrap = document.createElement("div");
      statusWrap.className = "field";
      statusWrap.appendChild(statusField);

      const actionWrap = document.createElement("div");
      actionWrap.className = "portal-actions";

      const button = document.createElement("button");
      button.className = "button button--primary";
      button.type = "button";
      button.textContent = "Update Job";
      button.addEventListener("click", async () => {
        await apiRequest("/api/jobs", {
          method: "PATCH",
          body: JSON.stringify({
            id: job.id,
            status: select.value,
            customerName: customerInput.value,
            assignedTo: assignedInput.value,
            serviceDate: serviceInput.value,
            recurrenceType: typeSelect.value,
            recurrenceInterval: intervalInput.value,
            recurrenceUnit: unitSelect.value
          })
        });
        loadJobs();
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "button button--accent";
      deleteBtn.type = "button";
      deleteBtn.textContent = "Delete Job";
      deleteBtn.addEventListener("click", async () => {
        if (!window.confirm(`Delete job ${job.title}? This cannot be undone.`)) return;
        await apiRequest("/api/jobs", {
          method: "DELETE",
          body: JSON.stringify({ id: job.id })
        });
        loadJobs();
      });

      actionWrap.appendChild(button);
      actionWrap.appendChild(deleteBtn);

      editWrap.appendChild(customerWrap);
      editWrap.appendChild(assignedWrap);
      editWrap.appendChild(serviceWrap);
      editWrap.appendChild(typeWrap);
      editWrap.appendChild(intervalWrap);
      editWrap.appendChild(unitWrap);
      editWrap.appendChild(statusWrap);

      typeSelect.addEventListener("change", () =>
        applyRecurrenceState(typeSelect, intervalInput, unitSelect)
      );
      applyRecurrenceState(typeSelect, intervalInput, unitSelect);

      li.appendChild(label);
      li.appendChild(meta);
      if (timingParts.length) li.appendChild(timing);
      li.appendChild(editWrap);
      li.appendChild(actionWrap);
      return li;
    });
    renderList(jobList, items, "No jobs created yet.");
  };

  const loadTimeEntries = async () => {
    const data = await apiRequest("/api/time-entries");
    const entries = toArray(data?.entries);
    const items = entries.map((entry) => {
      const li = document.createElement("li");
      if (typeof entry.adjustMinutes === "number") {
        const effectiveLabel = formatDateTime(entry.clockIn);
        const noteLabel = entry.notes ? ` · ${entry.notes}` : "";
        li.textContent = `${entry.userEmail || entry.userId} — Adjustment ${formatSignedMinutes(entry.adjustMinutes)} (${effectiveLabel || entry.clockIn})${noteLabel}`;
        return li;
      }
      const clockInLabel = formatDateTime(entry.clockIn);
      const clockOutLabel = formatDateTime(entry.clockOut);
      const statusLabel = entry.status === "open" ? "Clocked in" : "Clocked out";
      li.textContent = `${entry.userEmail || entry.userId} — ${statusLabel} (${clockInLabel || entry.clockIn}${clockOutLabel ? ` → ${clockOutLabel}` : ""})`;
      return li;
    });
    renderList(timeList, items, "No time entries recorded yet.");

    const openItems = entries
      .filter((entry) => entry.status === "open" && typeof entry.adjustMinutes !== "number")
      .map((entry) => {
        const li = document.createElement("li");
        const label = document.createElement("div");
        const clockInLabel = formatDateTime(entry.clockIn);
        label.textContent = `${entry.userEmail || entry.userId} — Clocked in ${clockInLabel || entry.clockIn}`;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button button--accent";
        button.textContent = "Clock Out";
        button.addEventListener("click", async () => {
          if (!window.confirm(`Clock out ${entry.userEmail || entry.userId}?`)) return;
          await apiRequest("/api/time-entries", {
            method: "POST",
            body: JSON.stringify({ action: "admin_clock_out", entryId: entry.id })
          });
          loadTimeEntries();
          loadPayPeriods();
        });
        li.appendChild(label);
        li.appendChild(button);
        return li;
      });
    renderList(openTimeList, openItems, "No open clocks right now.");
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

  const loadPayPeriods = async () => {
    const [employeeData, timeData] = await Promise.all([
      apiRequest("/api/employees"),
      apiRequest("/api/time-entries")
    ]);
    const employees = toArray(employeeData?.employees);
    const entries = toArray(timeData?.entries);
    const now = new Date();
    const currentPeriod = getPayPeriodForDate(now);

    if (payPeriodRangeEl) {
      payPeriodRangeEl.textContent = `Pay period: ${formatDate(currentPeriod.start)} – ${formatDate(currentPeriod.end)}`;
    }

    const employeeMap = new Map();
    employees.forEach((employee) => {
      employeeMap.set(employee.id, {
        ...employee,
        label: employee.name || employee.email || employee.id,
        entries: []
      });
    });

    entries.forEach((entry) => {
      const id = entry.userId;
      if (!employeeMap.has(id)) {
        employeeMap.set(id, {
          id,
          email: entry.userEmail,
          name: entry.userEmail,
          createdAt: entry.clockIn || now.toISOString(),
          updatedAt: entry.clockOut || entry.clockIn || now.toISOString(),
          label: entry.userEmail || id,
          entries: []
        });
      }
      employeeMap.get(id).entries.push(entry);
    });

    const employeeList = Array.from(employeeMap.values()).sort((a, b) =>
      String(a.label || "").localeCompare(String(b.label || ""))
    );

    if (adjustEmployeeSelect) {
      adjustEmployeeSelect.innerHTML = "";
      employeeList.forEach((employee) => {
        const option = document.createElement("option");
        option.value = employee.id;
        option.textContent = employee.label;
        if (employee.email) option.dataset.email = employee.email;
        adjustEmployeeSelect.appendChild(option);
      });
    }

    const currentItems = employeeList.map((employee) => {
      const minutes = sumMinutesForPeriod(
        employee.entries,
        currentPeriod.start,
        currentPeriod.end,
        now,
        true
      );
      const li = document.createElement("li");
      const label = document.createElement("div");
      label.textContent = employee.label;
      const total = document.createElement("span");
      total.textContent = formatMinutes(minutes);
      li.appendChild(label);
      li.appendChild(total);
      return li;
    });
    renderList(payPeriodCurrentList, currentItems, "No employee hours yet.");

    const getEmployeePeriods = (employee, timestamp) => {
      let createdAt = employee.createdAt ? new Date(employee.createdAt) : timestamp;
      if (Number.isNaN(createdAt.getTime())) {
        createdAt = timestamp;
      }
      const startPeriod = getPayPeriodForDate(createdAt);
      const current = getPayPeriodForDate(timestamp);
      const periods = [];
      for (let index = startPeriod.index; index <= current.index; index += 1) {
        const start = addDays(startOfDay(PAY_PERIOD_ANCHOR), index * PAY_PERIOD_DAYS);
        const end = addDays(start, PAY_PERIOD_DAYS - 1);
        const minutes = sumMinutesForPeriod(
          employee.entries,
          start,
          end,
          timestamp,
          index === current.index
        );
        periods.push({ start, end, minutes });
      }
      return periods;
    };

    const renderEmployeeHistory = (employee, timestamp, titleEl, listEl) => {
      const periods = getEmployeePeriods(employee, timestamp);
      if (titleEl) {
        titleEl.textContent = `${employee.label} pay periods`;
      }
      const listItems = periods.map((period) => {
        const li = document.createElement("li");
        const label = document.createElement("div");
        label.textContent = `${formatDate(period.start)} – ${formatDate(period.end)}`;
        const total = document.createElement("span");
        total.textContent = formatMinutes(period.minutes);
        li.appendChild(label);
        li.appendChild(total);
        return li;
      });
      renderList(listEl, listItems, "No pay periods recorded yet.");
    };

    if (payPeriodEmployeeList || payPeriodHistoryList) {
      const historyItems = employeeList.map((employee) => {
        const li = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "link-button";
        button.textContent = employee.label;
        button.addEventListener("click", () =>
          renderEmployeeHistory(employee, now, payPeriodHistoryTitle, payPeriodHistoryList)
        );
        li.appendChild(button);
        return li;
      });
      renderList(payPeriodEmployeeList, historyItems, "No employees found.");

      if (employeeList.length) {
        renderEmployeeHistory(employeeList[0], now, payPeriodHistoryTitle, payPeriodHistoryList);
      } else {
        renderList(payPeriodHistoryList, [], "No pay periods recorded yet.");
      }
    }

    if (payPeriodTabs && payPeriodTabList) {
      payPeriodTabs.innerHTML = "";
      if (!employeeList.length) {
        if (payPeriodTabTitle) payPeriodTabTitle.textContent = "Pay periods";
        renderList(payPeriodTabList, [], "No employees found.");
        return;
      }

      const tabEntries = employeeList.map((employee, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "tab-button";
        button.textContent = employee.label;
        button.id = `pay-period-tab-${index}`;
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", "false");
        button.addEventListener("click", () => selectTab(index));
        payPeriodTabs.appendChild(button);
        return { employee, button };
      });

      const selectTab = (index) => {
        tabEntries.forEach((entry, idx) => {
          const isActive = idx === index;
          entry.button.classList.toggle("is-active", isActive);
          entry.button.setAttribute("aria-selected", String(isActive));
        });
        const active = tabEntries[index];
        if (payPeriodTabPanel) {
          payPeriodTabPanel.setAttribute("aria-labelledby", active.button.id);
        }
        renderEmployeeHistory(active.employee, now, payPeriodTabTitle, payPeriodTabList);
      };

      selectTab(0);
    }
  };

  const toIsoDate = (date) => {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  };

  const parseIsoDate = (value) => {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const computeDailyTotals = (entries, rangeStart, rangeEnd, now) => {
    const totals = new Map();
    if (!entries?.length) return totals;
    const cursor = new Date(rangeStart);
    while (cursor <= rangeEnd) {
      totals.set(toIsoDate(cursor), 0);
      cursor.setDate(cursor.getDate() + 1);
    }
    entries.forEach((entry) => {
      if (typeof entry.adjustMinutes === "number") {
        const effective = parseIsoDate(toIsoDate(new Date(entry.clockIn)));
        if (!effective) return;
        if (effective < rangeStart || effective > rangeEnd) return;
        const key = toIsoDate(effective);
        totals.set(key, (totals.get(key) || 0) + entry.adjustMinutes);
        return;
      }
      const interval = getEntryInterval(entry, now);
      if (!interval) return;
      const dayCursor = startOfDay(interval.start);
      while (dayCursor <= interval.end) {
        const dayStart = startOfDay(dayCursor);
        const dayEnd = addDays(dayStart, 1);
        const overlap = getOverlapMinutes(interval.start, interval.end, dayStart, dayEnd);
        if (overlap > 0 && dayStart >= rangeStart && dayStart <= rangeEnd) {
          const key = toIsoDate(dayStart);
          totals.set(key, (totals.get(key) || 0) + overlap);
        }
        dayCursor.setDate(dayCursor.getDate() + 1);
      }
    });
    return totals;
  };

  const dailyState = {
    employees: [],
    rangeStart: null,
    rangeEnd: null,
    activeIndex: 0
  };

  const renderDailyTotals = () => {
    if (!dailyTabList) return;
    const employee = dailyState.employees[dailyState.activeIndex];
    if (!employee || !dailyState.rangeStart || !dailyState.rangeEnd) {
      if (dailyTabTitle) dailyTabTitle.textContent = "Daily hours";
      renderList(dailyTabList, [], "No employees found.");
      return;
    }
    if (dailyTabTitle) dailyTabTitle.textContent = `${employee.label} — daily hours`;
    const now = new Date();
    const totals = computeDailyTotals(employee.entries, dailyState.rangeStart, dailyState.rangeEnd, now);
    const sortedKeys = Array.from(totals.keys()).sort();
    let grandTotal = 0;
    const items = sortedKeys.map((key) => {
      const minutes = totals.get(key) || 0;
      grandTotal += minutes;
      const li = document.createElement("li");
      const label = document.createElement("div");
      const date = parseIsoDate(key);
      label.textContent = date ? formatDate(date) : key;
      const total = document.createElement("span");
      total.textContent = minutes < 0 ? formatSignedMinutes(minutes) : formatMinutes(minutes);
      li.appendChild(label);
      li.appendChild(total);
      return li;
    });
    const totalLi = document.createElement("li");
    const totalLabel = document.createElement("div");
    totalLabel.textContent = "Total";
    totalLabel.style.fontWeight = "700";
    const totalValue = document.createElement("span");
    totalValue.textContent = formatMinutes(grandTotal);
    totalValue.style.fontWeight = "700";
    totalLi.appendChild(totalLabel);
    totalLi.appendChild(totalValue);
    items.push(totalLi);
    renderList(dailyTabList, items, "No hours in this range.");
  };

  const renderDailyTabs = () => {
    if (!dailyTabs) return;
    dailyTabs.innerHTML = "";
    if (!dailyState.employees.length) {
      if (dailyTabTitle) dailyTabTitle.textContent = "Daily hours";
      renderList(dailyTabList, [], "No employees found.");
      return;
    }
    const tabEntries = dailyState.employees.map((employee, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tab-button";
      button.textContent = employee.label;
      button.id = `daily-hours-tab-${index}`;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(index === dailyState.activeIndex));
      if (index === dailyState.activeIndex) button.classList.add("is-active");
      button.addEventListener("click", () => {
        dailyState.activeIndex = index;
        Array.from(dailyTabs.children).forEach((child, idx) => {
          const isActive = idx === index;
          child.classList.toggle("is-active", isActive);
          child.setAttribute("aria-selected", String(isActive));
        });
        if (dailyTabPanel) {
          dailyTabPanel.setAttribute("aria-labelledby", button.id);
        }
        renderDailyTotals();
      });
      dailyTabs.appendChild(button);
      return button;
    });
    if (dailyTabPanel && tabEntries.length) {
      dailyTabPanel.setAttribute("aria-labelledby", tabEntries[dailyState.activeIndex]?.id || tabEntries[0].id);
    }
    renderDailyTotals();
  };

  const updateDailyRangeLabel = () => {
    if (!dailyRangeEl) return;
    if (!dailyState.rangeStart || !dailyState.rangeEnd) {
      dailyRangeEl.textContent = "";
      return;
    }
    dailyRangeEl.textContent = `Showing ${formatDate(dailyState.rangeStart)} – ${formatDate(dailyState.rangeEnd)}`;
  };

  const applyDailyInputs = () => {
    if (!dailyState.rangeStart || !dailyState.rangeEnd) return;
    if (dailyStartInput) dailyStartInput.value = toIsoDate(dailyState.rangeStart);
    if (dailyEndInput) dailyEndInput.value = toIsoDate(dailyState.rangeEnd);
  };

  const loadDailyHours = async () => {
    const [employeeData, timeData] = await Promise.all([
      apiRequest("/api/employees"),
      apiRequest("/api/time-entries")
    ]);
    const employees = toArray(employeeData?.employees);
    const entries = toArray(timeData?.entries);
    const now = new Date();
    if (!dailyState.rangeStart || !dailyState.rangeEnd) {
      const period = getPayPeriodForDate(now);
      dailyState.rangeStart = period.start;
      dailyState.rangeEnd = period.end;
    }

    const employeeMap = new Map();
    employees.forEach((employee) => {
      employeeMap.set(employee.id, {
        ...employee,
        label: employee.name || employee.email || employee.id,
        entries: []
      });
    });
    entries.forEach((entry) => {
      const id = entry.userId;
      if (!employeeMap.has(id)) {
        employeeMap.set(id, {
          id,
          email: entry.userEmail,
          name: entry.userEmail,
          label: entry.userEmail || id,
          entries: []
        });
      }
      employeeMap.get(id).entries.push(entry);
    });
    dailyState.employees = Array.from(employeeMap.values()).sort((a, b) =>
      String(a.label || "").localeCompare(String(b.label || ""))
    );
    if (dailyState.activeIndex >= dailyState.employees.length) {
      dailyState.activeIndex = 0;
    }
    applyDailyInputs();
    updateDailyRangeLabel();
    renderDailyTabs();
  };

  const handleDailyRangeChange = () => {
    const start = parseIsoDate(dailyStartInput?.value);
    const end = parseIsoDate(dailyEndInput?.value);
    if (!start || !end || end < start) return;
    dailyState.rangeStart = start;
    dailyState.rangeEnd = end;
    updateDailyRangeLabel();
    renderDailyTotals();
  };

  dailyStartInput?.addEventListener("change", handleDailyRangeChange);
  dailyEndInput?.addEventListener("change", handleDailyRangeChange);
  dailyResetBtn?.addEventListener("click", () => {
    const period = getPayPeriodForDate(new Date());
    dailyState.rangeStart = period.start;
    dailyState.rangeEnd = period.end;
    applyDailyInputs();
    updateDailyRangeLabel();
    renderDailyTotals();
  });

  const loadAll = async () => {
    const tasks = [];
    if (customerForm || customerList) {
      tasks.push(safeLoad(loadCustomers, customerList, "Unable to load customers."));
    }
    if (jobForm || jobList) {
      tasks.push(safeLoad(loadJobs, jobList, "Unable to load jobs."));
    }
    if (timeList || openTimeList) {
      tasks.push(safeLoad(loadTimeEntries, timeList, "Unable to load time entries."));
    }
    if (timeoffList) {
      tasks.push(safeLoad(loadTimeOff, timeoffList, "Unable to load time-off requests."));
    }
    if (
      payPeriodCurrentList ||
      payPeriodEmployeeList ||
      payPeriodHistoryList ||
      payPeriodTabs ||
      payPeriodTabList
    ) {
      tasks.push(safeLoad(loadPayPeriods, payPeriodCurrentList, "Unable to load pay periods."));
    }
    if (dailyTabs || dailyTabList) {
      tasks.push(safeLoad(loadDailyHours, dailyTabList, "Unable to load daily hours."));
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
      if (recurrenceTypeSelect) recurrenceTypeSelect.value = "one_time";
      applyRecurrenceState(recurrenceTypeSelect, recurrenceIntervalInput, recurrenceUnitSelect);
      loadJobs();
    } catch (error) {
      setStatus(error.message);
    }
  });

  adjustForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!adjustEmployeeSelect || !adjustDateInput) return;
    if (adjustStatusEl) adjustStatusEl.textContent = "";
    const hours = adjustHoursInput?.value ? Number(adjustHoursInput.value) : 0;
    const minutes = adjustMinutesInput?.value ? Number(adjustMinutesInput.value) : 0;
    const totalMinutes = Math.round(hours * 60 + minutes);
    const isSubtract = adjustTypeSelect?.value === "subtract";
    const signedMinutes = isSubtract ? -Math.abs(totalMinutes) : Math.abs(totalMinutes);
    if (!signedMinutes) {
      if (adjustStatusEl) adjustStatusEl.textContent = "Enter hours or minutes.";
      return;
    }
    try {
      await apiRequest("/api/time-entries", {
        method: "POST",
        body: JSON.stringify({
          action: "admin_adjust",
          userId: adjustEmployeeSelect.value,
          userEmail: adjustEmployeeSelect.selectedOptions[0]?.dataset.email || undefined,
          date: adjustDateInput.value,
          minutes: signedMinutes,
          notes: adjustNotesInput?.value || ""
        })
      });
      if (adjustStatusEl) adjustStatusEl.textContent = "Adjustment saved.";
      if (adjustHoursInput) adjustHoursInput.value = "";
      if (adjustMinutesInput) adjustMinutesInput.value = "";
      if (adjustNotesInput) adjustNotesInput.value = "";
      loadTimeEntries();
      loadPayPeriods();
    } catch (error) {
      if (adjustStatusEl) adjustStatusEl.textContent = formatErrorSummary(error);
    }
  });

  if (adjustDateInput) {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    adjustDateInput.value = `${today.getFullYear()}-${month}-${day}`;
  }

  recurrenceTypeSelect?.addEventListener("change", () =>
    applyRecurrenceState(recurrenceTypeSelect, recurrenceIntervalInput, recurrenceUnitSelect)
  );
  applyRecurrenceState(recurrenceTypeSelect, recurrenceIntervalInput, recurrenceUnitSelect);

  boot();
})();
