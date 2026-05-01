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

    if (req.method === "POST") {
      return jsonResponse({ error: "Job creation has been removed." }, 405);
    }

    if (req.method === "PATCH") {
      const payload = await req.json().catch(() => ({}));
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
        status,
        startedAt,
        completedAt,
        updatedAt: now
      };

      await writeCollection(COLLECTION_KEY, jobs);
      return jsonResponse({ job: jobs[index] });
    }

    if (req.method === "DELETE") {
      return jsonResponse({ error: "Job deletion has been removed." }, 405);
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
