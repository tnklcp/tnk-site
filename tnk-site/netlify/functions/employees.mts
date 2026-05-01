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

type FilingStatus = "single" | "mfj" | "mfs" | "hoh";

type TaxProfile = {
  state?: string;
  filingStatus?: FilingStatus;
  dependents?: number;
  additionalWithholding?: number;
  preTaxDeductionsPerCheck?: number;
  annualOtherIncome?: number;
};

type Employee = {
  id: string;
  email?: string;
  name?: string;
  payRate?: number;
  taxProfile?: TaxProfile;
  createdAt: string;
  updatedAt: string;
};

const COLLECTION_KEY = "employees";

const normalizeText = (value: unknown): string | undefined => {
  if (!value) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
};

const parseNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const FILING_STATUSES: FilingStatus[] = ["single", "mfj", "mfs", "hoh"];

const sanitizeTaxProfile = (input: unknown, base?: TaxProfile): TaxProfile => {
  const next: TaxProfile = { ...(base || {}) };
  if (!input || typeof input !== "object") return next;
  const data = input as Record<string, unknown>;
  if ("state" in data) {
    const state = normalizeText(data.state);
    if (state) next.state = state.toUpperCase().slice(0, 2);
    else delete next.state;
  }
  if ("filingStatus" in data) {
    const fs = String(data.filingStatus || "").toLowerCase() as FilingStatus;
    if (FILING_STATUSES.includes(fs)) next.filingStatus = fs;
    else delete next.filingStatus;
  }
  if ("dependents" in data) {
    const n = parseNumber(data.dependents);
    if (n !== null && n >= 0) next.dependents = Math.floor(n);
    else delete next.dependents;
  }
  if ("additionalWithholding" in data) {
    const n = parseNumber(data.additionalWithholding);
    if (n !== null && n >= 0) next.additionalWithholding = n;
    else delete next.additionalWithholding;
  }
  if ("preTaxDeductionsPerCheck" in data) {
    const n = parseNumber(data.preTaxDeductionsPerCheck);
    if (n !== null && n >= 0) next.preTaxDeductionsPerCheck = n;
    else delete next.preTaxDeductionsPerCheck;
  }
  if ("annualOtherIncome" in data) {
    const n = parseNumber(data.annualOtherIncome);
    if (n !== null && n >= 0) next.annualOtherIncome = n;
    else delete next.annualOtherIncome;
  }
  return next;
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

    if (req.method === "PATCH") {
      requireRole(auth, [adminRole]);
      const id = normalizeText((payload as Record<string, unknown>).id);
      if (!id) return jsonResponse({ error: "Employee id is required." }, 400);
      const employees = await readCollection<Employee>(COLLECTION_KEY);
      const index = employees.findIndex((item) => item.id === id);
      if (index === -1) return jsonResponse({ error: "Employee not found." }, 404);

      const data = payload as Record<string, unknown>;
      const next: Employee = { ...employees[index] };
      if ("payRate" in data) {
        const rate = parseNumber(data.payRate);
        if (rate === null || rate < 0) {
          return jsonResponse({ error: "Pay rate must be a non-negative number." }, 400);
        }
        next.payRate = rate;
      }
      if ("name" in data) {
        const name = normalizeText(data.name);
        if (name) next.name = name;
      }
      if ("taxProfile" in data) {
        next.taxProfile = sanitizeTaxProfile(data.taxProfile, next.taxProfile);
      }
      next.updatedAt = new Date().toISOString();
      employees[index] = next;
      await writeCollection(COLLECTION_KEY, employees);
      return jsonResponse({ employee: next });
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
