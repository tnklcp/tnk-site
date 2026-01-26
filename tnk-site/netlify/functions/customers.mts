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

type Customer = {
  id: string;
  name: string;
  status: "active" | "archived";
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  createdAt: string;
  updatedAt: string;
};

const COLLECTION_KEY = "customers";

export default async (req: Request) => {
  try {
    const auth = await verifyAuth(req);
    const { adminRole } = getRoleConfig();
    requireRole(auth, [adminRole]);

    if (req.method === "GET") {
      const customers = await readCollection<Customer>(COLLECTION_KEY);
      return jsonResponse({ customers });
    }

    const payload = await req.json().catch(() => ({}));

    if (req.method === "POST") {
      const name = String(payload.name || "").trim();
      if (!name) {
        return jsonResponse({ error: "Customer name is required." }, 400);
      }
      const now = new Date().toISOString();
      const customer: Customer = {
        id: crypto.randomUUID(),
        name,
        status: "active",
        contactName: payload.contactName ? String(payload.contactName) : undefined,
        contactEmail: payload.contactEmail ? String(payload.contactEmail) : undefined,
        contactPhone: payload.contactPhone ? String(payload.contactPhone) : undefined,
        createdAt: now,
        updatedAt: now
      };

      const customers = await readCollection<Customer>(COLLECTION_KEY);
      customers.push(customer);
      await writeCollection(COLLECTION_KEY, customers);
      return jsonResponse({ customer }, 201);
    }

    if (req.method === "PATCH") {
      const id = String(payload.id || "").trim();
      if (!id) {
        return jsonResponse({ error: "Customer id is required." }, 400);
      }
      const customers = await readCollection<Customer>(COLLECTION_KEY);
      const index = customers.findIndex((item) => item.id === id);
      if (index === -1) {
        return jsonResponse({ error: "Customer not found." }, 404);
      }
      const now = new Date().toISOString();
      const existing = customers[index];
      customers[index] = {
        ...existing,
        name: payload.name ? String(payload.name) : existing.name,
        status: payload.status === "archived" ? "archived" : existing.status,
        contactName: payload.contactName ? String(payload.contactName) : existing.contactName,
        contactEmail: payload.contactEmail ? String(payload.contactEmail) : existing.contactEmail,
        contactPhone: payload.contactPhone ? String(payload.contactPhone) : existing.contactPhone,
        updatedAt: now
      };
      await writeCollection(COLLECTION_KEY, customers);
      return jsonResponse({ customer: customers[index] });
    }

    if (req.method === "DELETE") {
      const id = String(payload.id || "").trim();
      if (!id) {
        return jsonResponse({ error: "Customer id is required." }, 400);
      }
      const customers = await readCollection<Customer>(COLLECTION_KEY);
      const next = customers.filter((item) => item.id !== id);
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
  path: "/api/customers"
};
