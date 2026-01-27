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

type Employee = {
  id: string;
  email?: string;
  name?: string;
  createdAt: string;
  updatedAt: string;
};

const COLLECTION_KEY = "employees";

const normalizeText = (value: unknown): string | undefined => {
  if (!value) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
};

export default async (req: Request) => {
  try {
    const auth = await verifyAuth(req);
    const { adminRole, employeeRole } = getRoleConfig();
    requireRole(auth, [adminRole, employeeRole]);

    if (req.method === "GET") {
      requireRole(auth, [adminRole]);
      const employees = await readCollection<Employee>(COLLECTION_KEY);
      return jsonResponse({ employees });
    }

    const payload = await req.json().catch(() => ({}));

    if (req.method === "POST") {
      const now = new Date().toISOString();
      const employees = await readCollection<Employee>(COLLECTION_KEY);
      const index = employees.findIndex((item) => item.id === auth.subject);
      const email = normalizeText(auth.email);
      const name = normalizeText(auth.name);

      if (index === -1) {
        const employee: Employee = {
          id: auth.subject,
          email,
          name,
          createdAt: now,
          updatedAt: now
        };
        employees.push(employee);
        await writeCollection(COLLECTION_KEY, employees);
        return jsonResponse({ employee }, 201);
      }

      employees[index] = {
        ...employees[index],
        email: email || employees[index].email,
        name: name || employees[index].name,
        updatedAt: now
      };
      await writeCollection(COLLECTION_KEY, employees);
      return jsonResponse({ employee: employees[index] });
    }

    return jsonResponse({ error: "Method not allowed." }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = message === "Forbidden" ? 403 : 401;
    return jsonResponse({ error: message }, status);
  }
};

export const config: Config = {
  path: "/api/employees"
};
