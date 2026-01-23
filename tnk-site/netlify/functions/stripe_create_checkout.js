import Stripe from "stripe";
import { getStore } from "@netlify/blobs";
import { getStripeSecretKey, stripeSecretKeyError } from "./stripe-utils.js";

function json(statusCode, bodyObj, extraHeaders = {}) {
  return new Response(JSON.stringify(bodyObj), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function getEnv() {
  return globalThis.Netlify?.env || process.env || {};
}

function getSiteUrl(request) {
  const env = getEnv();
  const envUrl = env.SITE_URL;
  if (envUrl && /^https?:\/\//i.test(envUrl)) return envUrl.replace(/\/+$/, "");
  try {
    const origin = new URL(request.url).origin;
    if (origin && /^https?:\/\//i.test(origin)) return origin.replace(/\/+$/, "");
  } catch {}
  const netlifyUrl = env.URL || env.DEPLOY_PRIME_URL;
  if (netlifyUrl && /^https?:\/\//i.test(netlifyUrl)) return netlifyUrl.replace(/\/+$/, "");
  return null;
}

function getConfiguredStore() {
  try {
    return getStore({ name: "tnk-data" });
  } catch {
    const env = getEnv();
    const siteID = env.NETLIFY_SITE_ID || env.SITE_ID || env.SITE_ID_PROD || "";
    const token = env.NETLIFY_BLOBS_TOKEN || env.NETLIFY_AUTH_TOKEN || env.NETLIFY_API_TOKEN || "";

    if (!siteID || !token) {
      throw new Error(
        [
          "MissingBlobsEnvironmentError: Netlify Blobs is not configured for this site.",
          "Manual configuration required:",
          "Set environment variables in Netlify:",
          "  NETLIFY_SITE_ID = <your site id>",
          "  NETLIFY_BLOBS_TOKEN = <a Netlify personal access token>",
          "",
          "Then redeploy.",
        ].join("\n")
      );
    }

    return getStore({ name: "tnk-data", siteID, token });
  }
}

async function resolveUser(request, context) {
  const ctxUser = context?.clientContext?.user || null;
  if (ctxUser) return ctxUser;

  const auth = request.headers.get("authorization");
  if (!auth) return null;

  try {
    const origin = new URL(request.url).origin;
    const res = await fetch(`${origin}/.netlify/identity/user`, {
      headers: { Authorization: auth },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async (request, context) => {
  try {
    if (request.method === "OPTIONS") {
      return new Response("", { status: 204, headers: { ...corsHeaders() } });
    }

    if (request.method !== "POST") {
      return json(405, { ok: false, error: "Method Not Allowed" });
    }

    const user = await resolveUser(request, context);
    if (!user?.email) return json(401, { ok: false, error: "Unauthorized" });

    const env = getEnv();
    const STRIPE_SECRET_KEY = getStripeSecretKey(env);
    if (!STRIPE_SECRET_KEY) return json(500, { ok: false, error: stripeSecretKeyError() });

    const siteUrl = getSiteUrl(request);
    if (!siteUrl) return json(500, { ok: false, error: "Missing SITE_URL (or could not infer origin)" });

    let body = {};
    try {
      body = await request.json();
    } catch {
      return json(400, { ok: false, error: "Invalid JSON body" });
    }

    const invoiceId = body.invoiceId || body.invoice_id;
    if (!invoiceId) return json(400, { ok: false, error: "Missing invoiceId" });

    const store = getConfiguredStore();
    const invoices = (await store.get("tnk_invoices.json", { type: "json" })) || [];
    const inv = invoices.find((x) => x?.id === invoiceId);

    if (!inv) return json(404, { ok: false, error: "Invoice not found" });

    const invoiceCustomer = String(inv.customer_email || "").toLowerCase();
    const authedEmail = String(user.email || "").toLowerCase();
    if (!invoiceCustomer || invoiceCustomer !== authedEmail) {
      return json(403, { ok: false, error: "Forbidden: invoice does not belong to this user" });
    }

    const status = String(inv.status || "").toLowerCase();
    if (status === "paid") return json(400, { ok: false, error: "Invoice already paid" });

    const total = Number(inv.total || 0);
    if (!Number.isFinite(total) || total <= 0) {
      return json(400, { ok: false, error: "Invoice total is invalid" });
    }

    const amountCents = Math.round(total * 100);
    const stripe = new Stripe(STRIPE_SECRET_KEY);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: authedEmail,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: `Invoice ${inv.number || ""}`.trim() || "TNK Invoice",
              description: inv.notes || "Neighborhood Kids Lawncare Plus",
            },
          },
        },
      ],
      metadata: {
        invoice_id: inv.id,
        invoice_number: inv.number || "",
        customer_email: authedEmail,
      },
      success_url: `${siteUrl}/customer.html?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/customer.html?stripe=cancel`,
    });

    return json(200, { ok: true, url: session.url, id: session.id });
  } catch (e) {
    console.error("[stripe_create_checkout] error:", e);
    const stripeStatus = Number(e?.statusCode);
    if (Number.isInteger(stripeStatus) && stripeStatus >= 400 && stripeStatus < 600) {
      const payload = { ok: false, error: e?.message || "Stripe error" };
      if (e?.type) payload.type = e.type;
      if (e?.code) payload.code = e.code;
      return json(stripeStatus, payload);
    }

    return json(500, { ok: false, error: "Server error", message: e?.message || String(e) });
  }
};
