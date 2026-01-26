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

type TimeOffStatus = "pending" | "approved" | "denied";

type TimeOffRequest = {
  id: string;
  userId: string;
  userEmail?: string;
  startDate: string;
  endDate: string;
  notes?: string;
  status: TimeOffStatus;
  createdAt: string;
  updatedAt: string;
};

const COLLECTION_KEY = "time-off";

export default async (req: Request) => {
  try {
    const auth = await verifyAuth(req);
    const { adminRole, employeeRole } = getRoleConfig();
    requireRole(auth, [adminRole, employeeRole]);

    if (req.method === "GET") {
      const requests = await readCollection<TimeOffRequest>(COLLECTION_KEY);
      if (auth.roles.includes(adminRole)) {
        return jsonResponse({ requests });
      }
      const filtered = requests.filter((item) => item.userId === auth.subject);
      return jsonResponse({ requests: filtered });
    }

    const payload = await req.json().catch(() => ({}));

    if (req.method === "POST") {
      const startDate = String(payload.startDate || "").trim();
      const endDate = String(payload.endDate || "").trim();
      if (!startDate || !endDate) {
        return jsonResponse({ error: "Start and end dates are required." }, 400);
      }
      const now = new Date().toISOString();
      const request: TimeOffRequest = {
        id: crypto.randomUUID(),
        userId: auth.subject,
        userEmail: auth.email,
        startDate,
        endDate,
        notes: payload.notes ? String(payload.notes) : undefined,
        status: "pending",
        createdAt: now,
        updatedAt: now
      };
      const requests = await readCollection<TimeOffRequest>(COLLECTION_KEY);
      requests.push(request);
      await writeCollection(COLLECTION_KEY, requests);
      return jsonResponse({ request }, 201);
    }

    if (req.method === "PATCH") {
      requireRole(auth, [adminRole]);
      const id = String(payload.id || "").trim();
      if (!id) {
        return jsonResponse({ error: "Request id is required." }, 400);
      }
      const requests = await readCollection<TimeOffRequest>(COLLECTION_KEY);
      const index = requests.findIndex((item) => item.id === id);
      if (index === -1) {
        return jsonResponse({ error: "Request not found." }, 404);
      }
      const status = String(payload.status || "");
      if (!(["approved", "denied"] as TimeOffStatus[]).includes(status as TimeOffStatus)) {
        return jsonResponse({ error: "Invalid status." }, 400);
      }
      requests[index] = {
        ...requests[index],
        status: status as TimeOffStatus,
        updatedAt: new Date().toISOString()
      };
      await writeCollection(COLLECTION_KEY, requests);
      return jsonResponse({ request: requests[index] });
    }

    return jsonResponse({ error: "Method not allowed." }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = message === "Forbidden" ? 403 : 401;
    return jsonResponse({ error: message }, status);
  }
};

export const config: Config = {
  path: "/api/time-off"
};
