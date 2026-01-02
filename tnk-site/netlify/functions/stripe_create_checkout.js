// tnk-site/netlify/functions/stripe_create_checkout.js
import Stripe from "stripe";
import { getStore } from "@netlify/blobs";

function json(statusCode, bodyObj, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
      ...extraHeaders,
    },
    body: JSON.stringify(bodyObj),
  };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function getSiteUrl(event) {
  // Prefer explicit env, otherwise fall back to request origin.
  // SITE_URL should be like https://theneighborhoodkidslawncare.com
  const envUrl = process.env.SITE_URL;
  if (envUrl && /^https?:\/\//i.test(envUrl)) return envUrl.replace(/\/+$/, "");
  const origin = event.headers?.origin || event.headers?.Origin;
  if (origin && /^https?:\/\//i.test(origin)) return origin.replace(/\/+$/, "");
  // Netlify also sets URL / DEPLOY_PRIME_URL sometimes:
  const netlifyUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (netlifyUrl && /^https?:\/\//i.test(netlifyUrl)) return netlifyUrl.replace(/\/+$/, "");
  return null;
}

/**
 * Same “auto mode then fallback env vars” approach as collections.js,
 * so checkout/webhook don't randomly fail if Blobs isn't auto-configured.
 */
function getConfiguredStore() {
  try {
    return getStore({ name: "tnk-data" });
  } catch (e) {
    const siteID =
      process.env.NETLIFY_SITE_ID ||
      process.env.SITE_ID ||
      process.env.SITE_ID_PROD ||
      "";

    const token =
      process.env.NETLIFY_BLOBS_TOKEN ||
      process.env.NETLIFY_AUTH_TOKEN ||
      process.env.NETLIFY_API_TOKEN ||
      "";

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

export async function handler(event, context) {
  try {
    // CORS preflight
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: { ...corsHeaders() },
        body: "",
      };
    }

    if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Method Not Allowed" });

    // IMPORTANT: read Identity from context (event.clientContext is often undefined)
    const user =
      context?.clientContext?.user ||
      event?.clientContext?.user ||
      null;

    if (!user?.email) return json(401, { ok: false, error: "Unauthorized" });

    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET_KEY) return json(500, { ok: false, error: "Missing STRIPE_SECRET_KEY" });

    const siteUrl = getSiteUrl(event);
    if (!siteUrl) return json(500, { ok: false, error: "Missing SITE_URL (or could not infer origin)" });

    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { ok: false, error: "Invalid JSON body" });
    }

    const invoiceId = body.invoiceId || body.invoice_id;
    if (!invoiceId) return json(400, { ok: false, error: "Missing invoiceId" });

    // Load invoices from the same Netlify Blobs store used by collections.js
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

    // Stripe expects integer cents
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
    return json(500, { ok: false, error: "Server error", message: e?.message || String(e) });
  }
}
