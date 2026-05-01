(() => {
  const userEl = document.getElementById("employee-user");
  const statusEl = document.getElementById("employee-status");
  const logoutBtn = document.getElementById("employee-logout");
  const jobList = document.getElementById("employee-job-list");
  const timeForm = document.getElementById("employee-time-form");
  const timeList = document.getElementById("employee-time-list");
  const clockStatusEl = document.getElementById("employee-clock-status");
  const adjustForm = document.getElementById("employee-adjust-form");
  const adjustStatusEl = document.getElementById("employee-adjust-status");
  const adjustDateInput = document.getElementById("employee-adjust-date");
  const adjustTypeSelect = document.getElementById("employee-adjust-type");
  const adjustHoursInput = document.getElementById("employee-adjust-hours");
  const adjustMinutesInput = document.getElementById("employee-adjust-minutes");
  const adjustNotesInput = document.getElementById("employee-adjust-notes");
  const payPeriodRangeEl = document.getElementById("employee-pay-period-range");
  const payPeriodCurrentEl = document.getElementById("employee-pay-period-current");
  const payPeriodLastEl = document.getElementById("employee-pay-period-last");

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

  const setClockStatus = (message = "") => {
    if (!clockStatusEl) return;
    clockStatusEl.textContent = message;
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
    const items = toArray(data?.jobs).map((job) => {
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
      meta.textContent = `Service date: ${serviceDateLabel} · ${recurrenceLabel}`;

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

      const isCompleted = ["submitted", "approved"].includes(job.status);
      const actionWrap = document.createElement("span");
      actionWrap.className = "portal-actions";

      if (!isCompleted) {
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
        actionWrap.appendChild(startBtn);

        const completeBtn = document.createElement("button");
        completeBtn.className = "button button--accent";
        completeBtn.type = "button";
        completeBtn.textContent = "Complete";
        completeBtn.addEventListener("click", async () => {
          await apiRequest("/api/jobs", {
            method: "PATCH",
            body: JSON.stringify({ id: job.id, status: "submitted" })
          });
          loadJobs();
        });
        actionWrap.appendChild(completeBtn);
      } else {
        const completedTag = document.createElement("span");
        completedTag.className = "status-pill";
        completedTag.textContent = job.status === "approved" ? "Approved" : "Submitted";
        actionWrap.appendChild(completedTag);
      }
      li.appendChild(label);
      li.appendChild(meta);
      if (timingParts.length) li.appendChild(timing);
      li.appendChild(actionWrap);
      return li;
    });
    renderList(jobList, items, "No assigned jobs found.");
  };

  const loadTimeEntries = async () => {
    const data = await apiRequest("/api/time-entries");
    const entries = toArray(data?.entries);
    const now = new Date();
    const openEntry = entries.find(
      (entry) => entry.status === "open" && entry.clockIn && typeof entry.adjustMinutes !== "number"
    );
    if (openEntry) {
      const clockInLabel = formatDateTime(openEntry.clockIn);
      setClockStatus(clockInLabel ? `Clocked in since ${clockInLabel}` : "Clocked in");
    } else if (entries.length) {
      const latestEntry = entries
        .filter((entry) => entry.clockIn && typeof entry.adjustMinutes !== "number")
        .sort((a, b) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime())[0];
      const lastTime = formatDateTime(latestEntry?.clockOut || latestEntry?.clockIn);
      const durationLabel = formatDuration(latestEntry?.clockIn, latestEntry?.clockOut);
      if (lastTime && durationLabel) {
        setClockStatus(`Clocked out (last at ${lastTime}, total ${durationLabel})`);
      } else if (lastTime) {
        setClockStatus(`Clocked out (last at ${lastTime})`);
      } else {
        setClockStatus("Clocked out");
      }
    } else {
      setClockStatus("Clocked out");
    }

    const items = entries.map((entry) => {
      const li = document.createElement("li");
      if (typeof entry.adjustMinutes === "number") {
        const effectiveLabel = formatDateTime(entry.clockIn);
        const noteLabel = entry.notes ? ` · ${entry.notes}` : "";
        li.textContent = `Adjustment ${formatSignedMinutes(entry.adjustMinutes)} — ${effectiveLabel || entry.clockIn}${noteLabel}`;
        return li;
      }
      const clockInLabel = formatDateTime(entry.clockIn);
      const clockOutLabel = formatDateTime(entry.clockOut);
      const statusLabel = entry.status === "open" ? "Clocked in" : "Clocked out";
      const durationLabel = formatDuration(entry.clockIn, entry.clockOut);
      const durationSuffix = durationLabel ? ` (${durationLabel})` : "";
      li.textContent = `${statusLabel} — ${clockInLabel || entry.clockIn}${clockOutLabel ? ` → ${clockOutLabel}` : ""}${durationSuffix}`;
      return li;
    });
    renderList(timeList, items, "No time entries yet.");

    if (payPeriodCurrentEl || payPeriodLastEl || payPeriodRangeEl) {
      const currentPeriod = getPayPeriodForDate(now);
      const lastPeriod = {
        index: currentPeriod.index - 1,
        start: addDays(currentPeriod.start, -PAY_PERIOD_DAYS),
        end: addDays(currentPeriod.end, -PAY_PERIOD_DAYS)
      };
      if (payPeriodRangeEl) {
        payPeriodRangeEl.textContent = `Pay period: ${formatDate(currentPeriod.start)} – ${formatDate(currentPeriod.end)}`;
      }
      const currentMinutes = sumMinutesForPeriod(entries, currentPeriod.start, currentPeriod.end, now, true);
      const lastMinutes = sumMinutesForPeriod(entries, lastPeriod.start, lastPeriod.end, now, false);
      if (payPeriodCurrentEl) payPeriodCurrentEl.textContent = formatMinutes(currentMinutes);
      if (payPeriodLastEl) payPeriodLastEl.textContent = formatMinutes(lastMinutes);
    }
  };

  const loadAll = async () => {
    const tasks = [];
    if (jobList) {
      tasks.push(safeLoad(loadJobs, jobList, "Unable to load jobs."));
    }
    if (timeList || timeForm) {
      tasks.push(safeLoad(loadTimeEntries, timeList, "Unable to load time entries."));
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
      apiRequest("/api/employees", { method: "POST", body: JSON.stringify({ action: "register" }) }).catch(
        () => {}
      );
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

  adjustForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!adjustDateInput) return;
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
          action: "employee_adjust",
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

  boot();
})();
