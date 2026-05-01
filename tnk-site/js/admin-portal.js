(() => {
  const userEl = document.getElementById("admin-user");
  const statusEl = document.getElementById("admin-status");
  const logoutBtn = document.getElementById("admin-logout");
  const jobList = document.getElementById("admin-job-list");
  const timeList = document.getElementById("admin-time-list");
  const openTimeList = document.getElementById("admin-open-time-list");
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
  const statClockedIn = document.getElementById("admin-stat-clocked-in");
  const statPeriodHours = document.getElementById("admin-stat-period-hours");
  const statPeriodPay = document.getElementById("admin-stat-period-pay");
  const payRateList = document.getElementById("admin-pay-rate-list");
  const taxProfileList = document.getElementById("admin-tax-profile-list");
  const taxCalcForm = document.getElementById("admin-tax-calc-form");
  const taxCalcEmployeeSelect = document.getElementById("admin-tax-calc-employee");
  const taxCalcResult = document.getElementById("admin-tax-calc-result");

  if (!userEl || !logoutBtn) return;

  const setStat = (el, value) => {
    if (el) el.textContent = String(value);
  };

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
    const submittedJobs = toArray(data?.jobs).filter((job) => job.status === "submitted");
    const items = submittedJobs.map((job) => {
      const li = document.createElement("li");
      const label = document.createElement("div");
      const statusLabel = String(job.status || "").replace("_", " ");
      label.textContent = `${job.title} (${statusLabel})`;

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

      const actionWrap = document.createElement("div");
      actionWrap.className = "portal-actions";

      const approveBtn = document.createElement("button");
      approveBtn.className = "button button--primary";
      approveBtn.type = "button";
      approveBtn.textContent = "Approve";
      approveBtn.addEventListener("click", async () => {
        await apiRequest("/api/jobs", {
          method: "PATCH",
          body: JSON.stringify({
            id: job.id,
            status: "approved"
          })
        });
        loadJobs();
      });

      const rejectBtn = document.createElement("button");
      rejectBtn.className = "button button--accent";
      rejectBtn.type = "button";
      rejectBtn.textContent = "Reject";
      rejectBtn.addEventListener("click", async () => {
        await apiRequest("/api/jobs", {
          method: "PATCH",
          body: JSON.stringify({
            id: job.id,
            status: "rejected"
          })
        });
        loadJobs();
      });

      actionWrap.appendChild(approveBtn);
      actionWrap.appendChild(rejectBtn);

      li.appendChild(label);
      li.appendChild(meta);
      if (timingParts.length) li.appendChild(timing);
      li.appendChild(actionWrap);
      return li;
    });
    renderList(jobList, items, "No submitted jobs awaiting review.");
  };

  const employeeNameCache = new Map();

  const refreshEmployeeNameCache = async () => {
    try {
      const data = await apiRequest("/api/employees");
      const employees = toArray(data?.employees);
      employees.forEach((employee) => {
        const label = employee.name || employee.email || employee.id;
        employeeNameCache.set(employee.id, label);
        if (employee.email) employeeNameCache.set(employee.email, label);
      });
    } catch (error) {
      console.warn("Unable to load employee names", error);
    }
  };

  const labelForEntry = (entry) => {
    if (employeeNameCache.has(entry.userId)) return employeeNameCache.get(entry.userId);
    if (entry.userEmail && employeeNameCache.has(entry.userEmail)) {
      return employeeNameCache.get(entry.userEmail);
    }
    if (entry.userEmail) {
      const fromEmail = String(entry.userEmail).split("@")[0] || "";
      if (fromEmail) {
        return fromEmail
          .split(/[._-]+/)
          .filter(Boolean)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ") || entry.userEmail;
      }
      return entry.userEmail;
    }
    return entry.userId;
  };

  const formatTimeOnly = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  };

  const formatDayHeading = (date) =>
    new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    }).format(date);

  const groupKeyForDate = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  const loadTimeEntries = async () => {
    if (!employeeNameCache.size) {
      await refreshEmployeeNameCache();
    }
    const data = await apiRequest("/api/time-entries");
    const entries = toArray(data?.entries);

    setStat(
      statClockedIn,
      entries.filter((entry) => entry.status === "open" && typeof entry.adjustMinutes !== "number").length
    );

    const sorted = [...entries].sort((a, b) => {
      const aTime = new Date(a.clockIn || 0).getTime();
      const bTime = new Date(b.clockIn || 0).getTime();
      return bTime - aTime;
    });

    const groups = new Map();
    sorted.forEach((entry) => {
      const ts = new Date(entry.clockIn);
      if (Number.isNaN(ts.getTime())) return;
      const key = groupKeyForDate(ts);
      if (!groups.has(key)) {
        groups.set(key, { heading: formatDayHeading(ts), entries: [] });
      }
      groups.get(key).entries.push(entry);
    });

    const items = [];
    Array.from(groups.values()).forEach((group) => {
      const headerLi = document.createElement("li");
      headerLi.className = "time-log-day";
      headerLi.textContent = group.heading;
      items.push(headerLi);

      group.entries.forEach((entry) => {
        const li = document.createElement("li");
        li.className = "time-log-entry";
        const name = document.createElement("div");
        name.className = "time-log-name";
        name.textContent = labelForEntry(entry);

        const detail = document.createElement("div");
        detail.className = "time-log-detail";

        if (typeof entry.adjustMinutes === "number") {
          const noteLabel = entry.notes ? ` · ${entry.notes}` : "";
          detail.textContent = `Adjustment ${formatSignedMinutes(entry.adjustMinutes)}${noteLabel}`;
          li.dataset.kind = "adjustment";
        } else if (entry.status === "open") {
          detail.textContent = `Clocked in at ${formatTimeOnly(entry.clockIn)} · Still on the clock`;
          li.dataset.kind = "open";
        } else {
          const clockInLabel = formatTimeOnly(entry.clockIn);
          const clockOutLabel = formatTimeOnly(entry.clockOut);
          const duration = formatDuration(entry.clockIn, entry.clockOut);
          const segments = [];
          segments.push(`${clockInLabel} → ${clockOutLabel}`);
          if (duration) segments.push(`Total ${duration}`);
          detail.textContent = segments.join(" · ");
          li.dataset.kind = "closed";
        }

        li.appendChild(name);
        li.appendChild(detail);
        items.push(li);
      });
    });

    renderList(timeList, items, "No time entries recorded yet.");

    const openItems = entries
      .filter((entry) => entry.status === "open" && typeof entry.adjustMinutes !== "number")
      .map((entry) => {
        const li = document.createElement("li");
        const label = document.createElement("div");
        const clockInLabel = formatDateTime(entry.clockIn);
        const employeeLabel = labelForEntry(entry);
        label.textContent = `${employeeLabel} — Clocked in ${clockInLabel || entry.clockIn}`;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button button--accent";
        button.textContent = "Clock Out";
        button.addEventListener("click", async () => {
          if (!window.confirm(`Clock out ${employeeLabel}?`)) return;
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

  const formatCurrency = (value) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
      Number.isFinite(value) ? value : 0
    );

  const minutesToHours = (minutes) => Math.max(0, minutes) / 60;

  const filingStatusLabel = (value) => {
    switch (value) {
      case "mfj":
        return "Married, joint";
      case "mfs":
        return "Married, separate";
      case "hoh":
        return "Head of household";
      case "single":
        return "Single";
      default:
        return "—";
    }
  };

  const renderPayRates = (employeeList, currentPeriod, now) => {
    if (!payRateList) return;
    if (!employeeList.length) {
      renderList(payRateList, [], "No employees yet.");
      return;
    }
    const items = employeeList.map((employee) => {
      const li = document.createElement("li");
      li.className = "pay-rate-row";

      const label = document.createElement("div");
      label.className = "pay-rate-row__label";
      const name = document.createElement("strong");
      name.textContent = employee.label;
      label.appendChild(name);
      const meta = document.createElement("span");
      meta.className = "pay-rate-row__meta";
      const minutes = sumMinutesForPeriod(
        employee.entries,
        currentPeriod.start,
        currentPeriod.end,
        now,
        true
      );
      const hours = minutesToHours(minutes);
      const rate = Number.isFinite(employee.payRate) ? Number(employee.payRate) : 0;
      const pay = hours * rate;
      meta.textContent = `${formatMinutes(minutes)} this period · ${formatCurrency(pay)} gross`;
      label.appendChild(meta);

      const inputWrap = document.createElement("div");
      inputWrap.className = "pay-rate-row__input";
      const rateLabel = document.createElement("label");
      rateLabel.textContent = "$/hr";
      const rateInput = document.createElement("input");
      rateInput.type = "number";
      rateInput.min = "0";
      rateInput.step = "0.01";
      rateInput.value = Number.isFinite(employee.payRate) ? String(employee.payRate) : "";
      rateInput.placeholder = "0.00";
      rateLabel.appendChild(rateInput);
      inputWrap.appendChild(rateLabel);

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "button button--primary";
      saveBtn.textContent = "Save";
      saveBtn.addEventListener("click", async () => {
        const newRate = Number(rateInput.value);
        if (!Number.isFinite(newRate) || newRate < 0) {
          saveBtn.textContent = "Invalid";
          return;
        }
        saveBtn.disabled = true;
        saveBtn.textContent = "Saving…";
        try {
          await apiRequest("/api/employees", {
            method: "PATCH",
            body: JSON.stringify({ id: employee.id, payRate: newRate })
          });
          saveBtn.textContent = "Saved";
          await loadPayPeriods();
        } catch (error) {
          saveBtn.textContent = "Retry";
          console.error("Pay rate save failed", error);
        } finally {
          saveBtn.disabled = false;
          setTimeout(() => {
            saveBtn.textContent = "Save";
          }, 1500);
        }
      });

      inputWrap.appendChild(saveBtn);
      li.appendChild(label);
      li.appendChild(inputWrap);
      return li;
    });
    renderList(payRateList, items, "No employees yet.");
  };

  const renderTaxProfiles = (employeeList) => {
    if (!taxProfileList) return;
    if (!window.tnkTax2026) {
      renderList(taxProfileList, [], "Tax module unavailable.");
      return;
    }
    if (!employeeList.length) {
      renderList(taxProfileList, [], "No employees yet.");
      return;
    }
    const stateOptions = window.tnkTax2026.stateOptions();
    const items = employeeList.map((employee) => {
      const profile = employee.taxProfile || {};
      const li = document.createElement("li");
      li.className = "tax-profile-row";

      const header = document.createElement("div");
      header.className = "tax-profile-row__header";
      const title = document.createElement("strong");
      title.textContent = employee.label;
      header.appendChild(title);
      li.appendChild(header);

      const grid = document.createElement("div");
      grid.className = "tax-profile-row__grid";

      const makeField = (labelText, control) => {
        const wrap = document.createElement("label");
        wrap.className = "field";
        const span = document.createElement("span");
        span.textContent = labelText;
        wrap.appendChild(span);
        wrap.appendChild(control);
        return wrap;
      };

      const stateSelect = document.createElement("select");
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "—";
      stateSelect.appendChild(blank);
      stateOptions.forEach((option) => {
        const opt = document.createElement("option");
        opt.value = option.code;
        opt.textContent = `${option.code} — ${option.name}`;
        if (profile.state === option.code) opt.selected = true;
        stateSelect.appendChild(opt);
      });

      const filingSelect = document.createElement("select");
      window.tnkTax2026.filingStatuses.forEach((option) => {
        const opt = document.createElement("option");
        opt.value = option.value;
        opt.textContent = option.label;
        if (profile.filingStatus === option.value) opt.selected = true;
        filingSelect.appendChild(opt);
      });

      const dependentsInput = document.createElement("input");
      dependentsInput.type = "number";
      dependentsInput.min = "0";
      dependentsInput.step = "1";
      dependentsInput.value = profile.dependents != null ? String(profile.dependents) : "";
      dependentsInput.placeholder = "0";

      const addlInput = document.createElement("input");
      addlInput.type = "number";
      addlInput.min = "0";
      addlInput.step = "0.01";
      addlInput.value = profile.additionalWithholding != null ? String(profile.additionalWithholding) : "";
      addlInput.placeholder = "0.00";

      const preTaxInput = document.createElement("input");
      preTaxInput.type = "number";
      preTaxInput.min = "0";
      preTaxInput.step = "0.01";
      preTaxInput.value = profile.preTaxDeductionsPerCheck != null
        ? String(profile.preTaxDeductionsPerCheck)
        : "";
      preTaxInput.placeholder = "0.00";

      const otherIncomeInput = document.createElement("input");
      otherIncomeInput.type = "number";
      otherIncomeInput.min = "0";
      otherIncomeInput.step = "1";
      otherIncomeInput.value = profile.annualOtherIncome != null ? String(profile.annualOtherIncome) : "";
      otherIncomeInput.placeholder = "0";

      grid.appendChild(makeField("State", stateSelect));
      grid.appendChild(makeField("Filing status", filingSelect));
      grid.appendChild(makeField("Dependents (CTC)", dependentsInput));
      grid.appendChild(makeField("Extra fed/check", addlInput));
      grid.appendChild(makeField("Pre-tax/check", preTaxInput));
      grid.appendChild(makeField("Other annual income", otherIncomeInput));
      li.appendChild(grid);

      const actions = document.createElement("div");
      actions.className = "portal-actions";
      const status = document.createElement("span");
      status.className = "status-pill";
      status.setAttribute("aria-live", "polite");
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "button button--primary";
      saveBtn.textContent = "Save tax profile";
      saveBtn.addEventListener("click", async () => {
        status.textContent = "";
        saveBtn.disabled = true;
        try {
          const taxProfile = {
            state: stateSelect.value || null,
            filingStatus: filingSelect.value || null,
            dependents: dependentsInput.value ? Number(dependentsInput.value) : 0,
            additionalWithholding: addlInput.value ? Number(addlInput.value) : 0,
            preTaxDeductionsPerCheck: preTaxInput.value ? Number(preTaxInput.value) : 0,
            annualOtherIncome: otherIncomeInput.value ? Number(otherIncomeInput.value) : 0
          };
          await apiRequest("/api/employees", {
            method: "PATCH",
            body: JSON.stringify({ id: employee.id, taxProfile })
          });
          status.textContent = "Saved";
          await loadPayPeriods();
        } catch (error) {
          status.textContent = formatErrorSummary(error);
        } finally {
          saveBtn.disabled = false;
        }
      });
      actions.appendChild(saveBtn);
      actions.appendChild(status);
      li.appendChild(actions);
      return li;
    });
    renderList(taxProfileList, items, "No employees yet.");
  };

  const taxCalcState = { employees: [] };

  const renderTaxCalcEmployees = () => {
    if (!taxCalcEmployeeSelect) return;
    taxCalcEmployeeSelect.innerHTML = "";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "— Manual entry —";
    taxCalcEmployeeSelect.appendChild(blank);
    taxCalcState.employees.forEach((employee) => {
      const opt = document.createElement("option");
      opt.value = employee.id;
      opt.textContent = employee.label;
      taxCalcEmployeeSelect.appendChild(opt);
    });
  };

  const renderTaxResult = (result) => {
    if (!taxCalcResult) return;
    taxCalcResult.innerHTML = "";
    if (!result) {
      taxCalcResult.textContent = "Enter the inputs above and recalculate.";
      return;
    }
    const annual = result.annual;
    const period = result.perPaycheck;
    const wrap = document.createElement("div");
    wrap.className = "tax-result";

    const head = document.createElement("p");
    head.className = "tax-result__head";
    const stateName = annual.stateName ? `${annual.stateName} ` : "";
    const note = annual.stateNote ? ` (${annual.stateNote})` : "";
    head.textContent = `${stateName}2026 estimate · effective rate ${(result.effectiveRate * 100).toFixed(2)}%${note}`;
    wrap.appendChild(head);

    const makeRow = (label, value) => {
      const row = document.createElement("div");
      row.className = "tax-result__row";
      const span = document.createElement("span");
      span.textContent = label;
      const strong = document.createElement("strong");
      strong.textContent = value;
      row.appendChild(span);
      row.appendChild(strong);
      return row;
    };

    const annualBlock = document.createElement("div");
    annualBlock.className = "tax-result__block";
    const annualTitle = document.createElement("h4");
    annualTitle.textContent = "Annual";
    annualBlock.appendChild(annualTitle);
    annualBlock.appendChild(makeRow("Gross wages", formatCurrency(annual.gross)));
    annualBlock.appendChild(makeRow("Pre-tax deductions", formatCurrency(annual.preTax)));
    annualBlock.appendChild(makeRow("Federal income tax", formatCurrency(annual.federal)));
    annualBlock.appendChild(makeRow("Social Security (6.2%)", formatCurrency(annual.socialSecurity)));
    annualBlock.appendChild(makeRow("Medicare (1.45% +)", formatCurrency(annual.medicare)));
    annualBlock.appendChild(makeRow("State income tax", formatCurrency(annual.state)));
    annualBlock.appendChild(makeRow("Total tax", formatCurrency(annual.totalTax)));
    annualBlock.appendChild(makeRow("Net take-home", formatCurrency(annual.net)));
    wrap.appendChild(annualBlock);

    if (period) {
      const periodBlock = document.createElement("div");
      periodBlock.className = "tax-result__block";
      const periodTitle = document.createElement("h4");
      periodTitle.textContent = "This pay period";
      periodBlock.appendChild(periodTitle);
      periodBlock.appendChild(makeRow("Gross", formatCurrency(period.gross)));
      periodBlock.appendChild(makeRow("Pre-tax deductions", formatCurrency(period.preTax)));
      periodBlock.appendChild(makeRow("Federal", formatCurrency(period.federal)));
      periodBlock.appendChild(makeRow("Social Security", formatCurrency(period.socialSecurity)));
      periodBlock.appendChild(makeRow("Medicare", formatCurrency(period.medicare)));
      periodBlock.appendChild(makeRow("State", formatCurrency(period.state)));
      periodBlock.appendChild(makeRow("Total tax", formatCurrency(period.totalTax)));
      periodBlock.appendChild(makeRow("Net pay", formatCurrency(period.net)));
      wrap.appendChild(periodBlock);
    }

    taxCalcResult.appendChild(wrap);
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
      const hours = minutesToHours(minutes);
      const rate = Number.isFinite(employee.payRate) ? Number(employee.payRate) : 0;
      const pay = hours * rate;
      const li = document.createElement("li");
      const label = document.createElement("div");
      label.textContent = `${employee.label}${rate ? ` · ${formatCurrency(rate)}/hr` : ""}`;
      const total = document.createElement("span");
      total.textContent = rate
        ? `${formatMinutes(minutes)} · ${formatCurrency(pay)}`
        : formatMinutes(minutes);
      li.appendChild(label);
      li.appendChild(total);
      return li;
    });
    renderList(payPeriodCurrentList, currentItems, "No employee hours yet.");

    let totalPeriodMinutes = 0;
    let totalPeriodPay = 0;
    employeeList.forEach((employee) => {
      const minutes = sumMinutesForPeriod(
        employee.entries,
        currentPeriod.start,
        currentPeriod.end,
        now,
        true
      );
      totalPeriodMinutes += minutes;
      const rate = Number.isFinite(employee.payRate) ? Number(employee.payRate) : 0;
      totalPeriodPay += minutesToHours(minutes) * rate;
    });
    setStat(statPeriodHours, formatMinutes(totalPeriodMinutes));
    setStat(statPeriodPay, formatCurrency(totalPeriodPay));

    renderPayRates(employeeList, currentPeriod, now);
    renderTaxProfiles(employeeList);
    taxCalcState.employees = employeeList.map((employee) => {
      const minutes = sumMinutesForPeriod(
        employee.entries,
        currentPeriod.start,
        currentPeriod.end,
        now,
        true
      );
      const rate = Number.isFinite(employee.payRate) ? Number(employee.payRate) : 0;
      return {
        id: employee.id,
        label: employee.label,
        payRate: rate,
        taxProfile: employee.taxProfile || {},
        currentPeriodMinutes: minutes,
        currentPeriodGross: minutesToHours(minutes) * rate
      };
    });
    renderTaxCalcEmployees();

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
      const rate = Number.isFinite(employee.payRate) ? Number(employee.payRate) : 0;
      if (titleEl) {
        titleEl.textContent = rate
          ? `${employee.label} pay periods · ${formatCurrency(rate)}/hr`
          : `${employee.label} pay periods`;
      }
      const listItems = periods.map((period) => {
        const li = document.createElement("li");
        const label = document.createElement("div");
        label.textContent = `${formatDate(period.start)} – ${formatDate(period.end)}`;
        const total = document.createElement("span");
        const pay = minutesToHours(period.minutes) * rate;
        total.textContent = rate
          ? `${formatMinutes(period.minutes)} · ${formatCurrency(pay)}`
          : formatMinutes(period.minutes);
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
    if (jobList) {
      tasks.push(safeLoad(loadJobs, jobList, "Unable to load jobs."));
    }
    if (timeList || openTimeList) {
      tasks.push(safeLoad(loadTimeEntries, timeList, "Unable to load time entries."));
    }
    if (
      payPeriodCurrentList ||
      payPeriodEmployeeList ||
      payPeriodHistoryList ||
      payPeriodTabs ||
      payPeriodTabList ||
      payRateList ||
      taxProfileList ||
      taxCalcEmployeeSelect ||
      statPeriodHours ||
      statPeriodPay
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

  taxCalcForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!window.tnkTax2026 || !taxCalcResult) return;
    const formData = new FormData(taxCalcForm);
    const employeeId = String(formData.get("employeeId") || "");
    const matched = taxCalcState.employees.find((e) => e.id === employeeId);
    const annualGross = Number(formData.get("annualGross"));
    const periodGrossRaw = formData.get("periodGross");
    const periodGross = periodGrossRaw === "" || periodGrossRaw == null
      ? (matched ? matched.currentPeriodGross : NaN)
      : Number(periodGrossRaw);
    const result = window.tnkTax2026.calculate({
      annualGross: Number.isFinite(annualGross) ? annualGross : 0,
      periodGross: Number.isFinite(periodGross) ? periodGross : NaN,
      periodsPerYear: Number(formData.get("periodsPerYear")) || 26,
      filingStatus: String(formData.get("filingStatus") || "single"),
      state: String(formData.get("state") || "").toUpperCase(),
      dependents: Number(formData.get("dependents")) || 0,
      additionalWithholding: Number(formData.get("additionalWithholding")) || 0,
      preTaxDeductionsPerCheck: Number(formData.get("preTaxDeductionsPerCheck")) || 0,
      annualOtherIncome: Number(formData.get("annualOtherIncome")) || 0
    });
    renderTaxResult(result);
  });

  taxCalcEmployeeSelect?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || !taxCalcForm) return;
    const employee = taxCalcState.employees.find((e) => e.id === target.value);
    if (!employee) return;
    const profile = employee.taxProfile || {};
    const setField = (name, value) => {
      const field = taxCalcForm.elements.namedItem(name);
      if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
        field.value = value == null ? "" : String(value);
      }
    };
    setField("state", profile.state || "");
    setField("filingStatus", profile.filingStatus || "single");
    setField("dependents", profile.dependents || 0);
    setField("additionalWithholding", profile.additionalWithholding || 0);
    setField("preTaxDeductionsPerCheck", profile.preTaxDeductionsPerCheck || 0);
    setField("annualOtherIncome", profile.annualOtherIncome || 0);
    setField("periodGross", employee.currentPeriodGross.toFixed(2));
    const annualField = taxCalcForm.elements.namedItem("annualGross");
    if ((annualField instanceof HTMLInputElement) && !annualField.value) {
      annualField.value = (employee.payRate * 2080).toFixed(2);
    }
  });

  boot();
})();
