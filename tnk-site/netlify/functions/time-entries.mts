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
};

const COLLECTION_KEY = "time-entries";

const findOpenEntry = (entries: TimeEntry[], userId: string, jobId?: string) =>
  entries.find(
    (entry) =>
      entry.userId === userId &&
      entry.status === "open" &&
      (jobId ? entry.jobId === jobId : true)
  );

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
          notes: payload.notes ? String(payload.notes) : undefined
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
