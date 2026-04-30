import type { Config } from "@netlify/functions";
import { getRoleConfig, requireRole, verifyAuth } from "./_shared/auth.mts";
import { readCollection, writeCollection } from "./_shared/storage.mts";

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });

type TimeEntry = {
  id: string;
  jobId?: string;
  userId: string;
  userEmail?: string;
  status: "open" | "closed";
  clockIn: string;
  clockOut?: string;
  notes?: string;
  entryType?: "time" | "adjustment";
  adjustMinutes?: number;
  adjustedBy?: string;
  adjustedAt?: string;
  closedBy?: string;
  closedAt?: string;
};

const COLLECTION_KEY = "time-entries";

const isAdjustmentEntry = (entry: TimeEntry) =>
  entry.entryType === "adjustment" || typeof entry.adjustMinutes === "number";

const findOpenEntry = (entries: TimeEntry[], userId: string, jobId?: string) =>
  entries.find(
    (entry) =>
      entry.userId === userId &&
      entry.status === "open" &&
      !isAdjustmentEntry(entry) &&
      (jobId ? entry.jobId === jobId : true)
  );

const parseNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseEffectiveDate = (value?: unknown): Date | null => {
  if (!value) return new Date();
  const raw = String(value);
  const normalized = raw.includes("T") ? raw : `${raw}T12:00:00`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

export default async (req: Request) => {
  try {
    const auth = await verifyAuth(req);
    const { adminRole, employeeRole } = getRoleConfig();
    requireRole(auth, [adminRole, employeeRole]);

    if (req.method === "GET") {
      const entries = await readCollection<TimeEntry>(COLLECTION_KEY);
      if (auth.roles.includes(adminRole)) {
        return jsonResponse({ entries });
      }
      const filtered = entries.filter((entry) => entry.userId === auth.subject);
      return jsonResponse({ entries: filtered });
    }

    const payload = await req.json().catch(() => ({}));
    if (req.method === "POST") {
      const action = String(payload.action || "").toLowerCase();
      const entries = await readCollection<TimeEntry>(COLLECTION_KEY);

      if (action === "clock_in") {
        const jobId = payload.jobId ? String(payload.jobId) : undefined;
        const existingOpen = findOpenEntry(entries, auth.subject, jobId);
        if (existingOpen) {
          return jsonResponse({ error: "Already clocked in." }, 409);
        }
        const entry: TimeEntry = {
          id: crypto.randomUUID(),
          jobId,
          userId: auth.subject,
          userEmail: auth.email,
          status: "open",
          clockIn: new Date().toISOString(),
          notes: payload.notes ? String(payload.notes) : undefined,
          entryType: "time"
        };
        entries.push(entry);
        await writeCollection(COLLECTION_KEY, entries);
        return jsonResponse({ entry }, 201);
      }

      if (action === "clock_out") {
        const entryId = payload.entryId ? String(payload.entryId) : undefined;
        const jobId = payload.jobId ? String(payload.jobId) : undefined;
        const entry = entryId
          ? entries.find((item) => item.id === entryId)
          : findOpenEntry(entries, auth.subject, jobId);
        if (!entry || entry.userId !== auth.subject) {
          return jsonResponse({ error: "No open time entry found." }, 404);
        }
        if (entry.status === "closed") {
          return jsonResponse({ error: "Entry is already closed." }, 409);
        }
        entry.status = "closed";
        entry.clockOut = new Date().toISOString();
        await writeCollection(COLLECTION_KEY, entries);
        return jsonResponse({ entry });
      }

      if (action === "admin_clock_out") {
        if (!auth.roles.includes(adminRole)) {
          return jsonResponse({ error: "Forbidden" }, 403);
        }
        const entryId = payload.entryId ? String(payload.entryId) : undefined;
        const userId = payload.userId ? String(payload.userId) : undefined;
        const jobId = payload.jobId ? String(payload.jobId) : undefined;
        if (!entryId && !userId) {
          return jsonResponse({ error: "Entry id or user id required." }, 400);
        }
        const entry = entryId
          ? entries.find((item) => item.id === entryId)
          : findOpenEntry(entries, userId || auth.subject, jobId);
        if (!entry) {
          return jsonResponse({ error: "No open time entry found." }, 404);
        }
        if (entry.status === "closed") {
          return jsonResponse({ error: "Entry is already closed." }, 409);
        }
        entry.status = "closed";
        entry.clockOut = new Date().toISOString();
        entry.closedBy = auth.subject;
        entry.closedAt = new Date().toISOString();
        await writeCollection(COLLECTION_KEY, entries);
        return jsonResponse({ entry });
      }

      if (action === "admin_adjust") {
        if (!auth.roles.includes(adminRole)) {
          return jsonResponse({ error: "Forbidden" }, 403);
        }
        const userId = payload.userId ? String(payload.userId) : "";
        if (!userId) {
          return jsonResponse({ error: "Employee is required." }, 400);
        }
        const minutesValue = parseNumber(payload.minutes);
        const hoursValue = parseNumber(payload.hours);
        const adjustMinutes =
          minutesValue !== null ? minutesValue : hoursValue !== null ? hoursValue * 60 : null;
        if (adjustMinutes === null || !Number.isFinite(adjustMinutes) || adjustMinutes === 0) {
          return jsonResponse({ error: "Adjustment minutes are required." }, 400);
        }
        const effectiveDate = parseEffectiveDate(payload.date || payload.effectiveDate);
        if (!effectiveDate) {
          return jsonResponse({ error: "Invalid adjustment date." }, 400);
        }
        const now = new Date().toISOString();
        const entry: TimeEntry = {
          id: crypto.randomUUID(),
          userId,
          userEmail: payload.userEmail ? String(payload.userEmail) : undefined,
          status: "closed",
          clockIn: effectiveDate.toISOString(),
          clockOut: effectiveDate.toISOString(),
          notes: payload.notes ? String(payload.notes) : undefined,
          entryType: "adjustment",
          adjustMinutes: Math.round(adjustMinutes),
          adjustedBy: auth.subject,
          adjustedAt: now
        };
        entries.push(entry);
        await writeCollection(COLLECTION_KEY, entries);
        return jsonResponse({ entry }, 201);
      }

      if (action === "employee_adjust") {
        const minutesValue = parseNumber(payload.minutes);
        const hoursValue = parseNumber(payload.hours);
        const adjustMinutes =
          minutesValue !== null ? minutesValue : hoursValue !== null ? hoursValue * 60 : null;
        if (adjustMinutes === null || !Number.isFinite(adjustMinutes) || adjustMinutes === 0) {
          return jsonResponse({ error: "Adjustment minutes are required." }, 400);
        }
        const effectiveDate = parseEffectiveDate(payload.date || payload.effectiveDate);
        if (!effectiveDate) {
          return jsonResponse({ error: "Invalid adjustment date." }, 400);
        }
        const now = new Date().toISOString();
        const entry: TimeEntry = {
          id: crypto.randomUUID(),
          userId: auth.subject,
          userEmail: auth.email,
          status: "closed",
          clockIn: effectiveDate.toISOString(),
          clockOut: effectiveDate.toISOString(),
          notes: payload.notes ? String(payload.notes) : undefined,
          entryType: "adjustment",
          adjustMinutes: Math.round(adjustMinutes),
          adjustedBy: auth.subject,
          adjustedAt: now
        };
        entries.push(entry);
        await writeCollection(COLLECTION_KEY, entries);
        return jsonResponse({ entry }, 201);
      }

      return jsonResponse({ error: "Unknown action." }, 400);
    }

    return jsonResponse({ error: "Method not allowed." }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = message === "Forbidden" ? 403 : 401;
    return jsonResponse({ error: message }, status);
  }
};

export const config: Config = {
  path: "/api/time-entries"
};
