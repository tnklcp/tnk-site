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

type JobStatus = "not_started" | "in_progress" | "submitted" | "approved" | "rejected";
type RecurrenceUnit = "day" | "week" | "month";

type Job = {
  id: string;
  title: string;
  customerName?: string;
  status: JobStatus;
  assignedTo: string[];
  notes?: string;
  isRecurring: boolean;
  recurrenceInterval?: number;
  recurrenceUnit?: RecurrenceUnit;
  serviceDate?: string;
  nextServiceDate?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
};

const COLLECTION_KEY = "jobs";

const normalizeAssigned = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const normalizeServiceDate = (value: unknown): string | undefined => {
  if (!value) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
};

const normalizeRecurrenceUnit = (value: unknown): RecurrenceUnit | undefined => {
  if (!value) return undefined;
  let text = String(value).trim().toLowerCase();
  if (text.endsWith("s")) {
    text = text.slice(0, -1);
  }
  if (text === "day" || text === "week" || text === "month") {
    return text as RecurrenceUnit;
  }
  return undefined;
};

const normalizeRecurrenceInterval = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed);
};

const parseIsRecurring = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  const text = String(value).trim().toLowerCase();
  if (["recurring", "true", "yes", "1"].includes(text)) return true;
  if (["one_time", "one-time", "once", "false", "no", "0"].includes(text)) return false;
  return undefined;
};

const computeNextServiceDate = (
  serviceDate: string | undefined,
  interval: number | undefined,
  unit: RecurrenceUnit | undefined,
  isRecurring: boolean
): string | undefined => {
  if (!isRecurring || !serviceDate || !interval || !unit) return undefined;
  const date = new Date(`${serviceDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  if (unit === "day") {
    date.setDate(date.getDate() + interval);
  } else if (unit === "week") {
    date.setDate(date.getDate() + interval * 7);
  } else {
    date.setMonth(date.getMonth() + interval);
  }
  return date.toISOString().slice(0, 10);
};

const canEditJob = (job: Job, authId: string, allowedEmails: string[], role: string) => {
  if (role === "admin") return true;
  if (!authId) return false;
  return job.assignedTo.includes(authId) || allowedEmails.some((email) => job.assignedTo.includes(email));
};

export default async (req: Request) => {
  try {
    const auth = await verifyAuth(req);
    const { adminRole, employeeRole } = getRoleConfig();
    requireRole(auth, [adminRole, employeeRole]);

    if (req.method === "GET") {
      const jobs = await readCollection<Job>(COLLECTION_KEY);
      if (auth.roles.includes(adminRole)) {
        return jsonResponse({ jobs });
      }
      const filtered = jobs.filter((job) =>
        job.assignedTo.includes(auth.subject) || (auth.email && job.assignedTo.includes(auth.email))
      );
      return jsonResponse({ jobs: filtered });
    }

    const payload = await req.json().catch(() => ({}));

    if (req.method === "POST") {
      requireRole(auth, [adminRole]);
      const title = String(payload.title || "").trim();
      if (!title) {
        return jsonResponse({ error: "Job title is required." }, 400);
      }
      const now = new Date().toISOString();
      const isRecurring = parseIsRecurring(payload.recurrenceType ?? payload.isRecurring ?? payload.recurring) ?? false;
      const serviceDate = normalizeServiceDate(payload.serviceDate);
      const recurrenceInterval = isRecurring ? normalizeRecurrenceInterval(payload.recurrenceInterval) ?? 1 : undefined;
      const recurrenceUnit = isRecurring ? normalizeRecurrenceUnit(payload.recurrenceUnit) ?? "week" : undefined;
      const nextServiceDate = computeNextServiceDate(
        serviceDate,
        recurrenceInterval,
        recurrenceUnit,
        isRecurring
      );
      const job: Job = {
        id: crypto.randomUUID(),
        title,
        customerName: payload.customerName ? String(payload.customerName) : undefined,
        status: "not_started",
        assignedTo: normalizeAssigned(payload.assignedTo),
        notes: payload.notes ? String(payload.notes) : undefined,
        isRecurring,
        recurrenceInterval,
        recurrenceUnit,
        serviceDate,
        nextServiceDate,
        createdAt: now,
        updatedAt: now
      };
      const jobs = await readCollection<Job>(COLLECTION_KEY);
      jobs.push(job);
      await writeCollection(COLLECTION_KEY, jobs);
      return jsonResponse({ job }, 201);
    }

    if (req.method === "PATCH") {
      const id = String(payload.id || "").trim();
      if (!id) {
        return jsonResponse({ error: "Job id is required." }, 400);
      }
      const jobs = await readCollection<Job>(COLLECTION_KEY);
      const index = jobs.findIndex((item) => item.id === id);
      if (index === -1) {
        return jsonResponse({ error: "Job not found." }, 404);
      }
      const existing = jobs[index];
      const previousStatus = existing.status;
      const isAdmin = auth.roles.includes(adminRole);
      const isEmployee = auth.roles.includes(employeeRole);
      if (!isAdmin && isEmployee) {
        const canEdit = canEditJob(existing, auth.subject, auth.email ? [auth.email] : [], "employee");
        if (!canEdit) {
          return jsonResponse({ error: "Forbidden" }, 403);
        }
      }
      const now = new Date().toISOString();
      const nextStatus = payload.status ? String(payload.status) : existing.status;
      const allowedStatuses: JobStatus[] = isAdmin
        ? ["not_started", "in_progress", "submitted", "approved", "rejected"]
        : ["not_started", "in_progress", "submitted"];
      const status = allowedStatuses.includes(nextStatus as JobStatus)
        ? (nextStatus as JobStatus)
        : existing.status;
      const incomingRecurring = isAdmin
        ? parseIsRecurring(payload.recurrenceType ?? payload.isRecurring ?? payload.recurring)
        : undefined;
      const isRecurring = incomingRecurring ?? existing.isRecurring ?? false;
      const serviceDate = isAdmin && payload.serviceDate !== undefined
        ? normalizeServiceDate(payload.serviceDate)
        : existing.serviceDate;
      const recurrenceInterval = isAdmin && payload.recurrenceInterval !== undefined
        ? normalizeRecurrenceInterval(payload.recurrenceInterval)
        : existing.recurrenceInterval;
      const recurrenceUnit = isAdmin && payload.recurrenceUnit !== undefined
        ? normalizeRecurrenceUnit(payload.recurrenceUnit)
        : existing.recurrenceUnit;
      const finalInterval = isRecurring ? recurrenceInterval ?? 1 : undefined;
      const finalUnit = isRecurring ? recurrenceUnit ?? "week" : undefined;
      const nextServiceDate = computeNextServiceDate(serviceDate, finalInterval, finalUnit, isRecurring);
      let startedAt = existing.startedAt;
      let completedAt = existing.completedAt;
      if (status === "not_started") {
        startedAt = undefined;
        completedAt = undefined;
      } else if (status === "in_progress") {
        if (!startedAt) startedAt = now;
        completedAt = undefined;
      } else if (status === "submitted") {
        if (!completedAt) completedAt = now;
      } else if ((status === "approved" || status === "rejected") && !completedAt) {
        completedAt = now;
      }
      jobs[index] = {
        ...existing,
        title: isAdmin && payload.title ? String(payload.title) : existing.title,
        customerName: isAdmin && payload.customerName ? String(payload.customerName) : existing.customerName,
        notes: payload.notes ? String(payload.notes) : existing.notes,
        status,
        assignedTo: isAdmin && payload.assignedTo ? normalizeAssigned(payload.assignedTo) : existing.assignedTo,
        isRecurring,
        recurrenceInterval: finalInterval,
        recurrenceUnit: finalUnit,
        serviceDate,
        nextServiceDate,
        startedAt,
        completedAt,
        updatedAt: now
      };

      const updatedJob = jobs[index];
      const shouldCreateNext =
        previousStatus !== "submitted" &&
        updatedJob.status === "submitted" &&
        updatedJob.isRecurring &&
        updatedJob.nextServiceDate;
      if (shouldCreateNext) {
        const nextServiceDateForNewJob = updatedJob.nextServiceDate;
        const nextJobInterval = updatedJob.recurrenceInterval || 1;
        const nextJobUnit = updatedJob.recurrenceUnit || "week";
        const nextJobNextService = computeNextServiceDate(
          nextServiceDateForNewJob,
          nextJobInterval,
          nextJobUnit,
          true
        );
        const nextJob: Job = {
          id: crypto.randomUUID(),
          title: updatedJob.title,
          customerName: updatedJob.customerName,
          status: "not_started",
          assignedTo: updatedJob.assignedTo,
          notes: updatedJob.notes,
          isRecurring: updatedJob.isRecurring,
          recurrenceInterval: nextJobInterval,
          recurrenceUnit: nextJobUnit,
          serviceDate: nextServiceDateForNewJob,
          nextServiceDate: nextJobNextService,
          createdAt: now,
          updatedAt: now
        };
        jobs.push(nextJob);
      }
      await writeCollection(COLLECTION_KEY, jobs);
      return jsonResponse({ job: jobs[index] });
    }

    if (req.method === "DELETE") {
      requireRole(auth, [adminRole]);
      const id = String(payload.id || "").trim();
      if (!id) {
        return jsonResponse({ error: "Job id is required." }, 400);
      }
      const jobs = await readCollection<Job>(COLLECTION_KEY);
      const next = jobs.filter((item) => item.id !== id);
      await writeCollection(COLLECTION_KEY, next);
      return jsonResponse({ deleted: id });
    }

    return jsonResponse({ error: "Method not allowed." }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = message === "Forbidden" ? 403 : 401;
    return jsonResponse({ error: message }, status);
  }
};

export const config: Config = {
  path: "/api/jobs"
};
