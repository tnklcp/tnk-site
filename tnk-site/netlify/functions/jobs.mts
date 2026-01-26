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

type Job = {
  id: string;
  title: string;
  customerName?: string;
  status: JobStatus;
  assignedTo: string[];
  notes?: string;
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
      const job: Job = {
        id: crypto.randomUUID(),
        title,
        customerName: payload.customerName ? String(payload.customerName) : undefined,
        status: "not_started",
        assignedTo: normalizeAssigned(payload.assignedTo),
        notes: payload.notes ? String(payload.notes) : undefined,
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
      jobs[index] = {
        ...existing,
        title: isAdmin && payload.title ? String(payload.title) : existing.title,
        customerName: isAdmin && payload.customerName ? String(payload.customerName) : existing.customerName,
        notes: payload.notes ? String(payload.notes) : existing.notes,
        status,
        assignedTo: isAdmin && payload.assignedTo ? normalizeAssigned(payload.assignedTo) : existing.assignedTo,
        updatedAt: now
      };
      await writeCollection(COLLECTION_KEY, jobs);
      return jsonResponse({ job: jobs[index] });
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
