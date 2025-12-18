// tnk-site/netlify/functions/stripe_checkout.js
import Stripe from "stripe";
import { getStore } from "@netlify/blobs";

function json(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
    body: JSON.stringify(bodyObj),
  };
}

export async function handler(event, context) {
  try {
    if (event.httpMethod === "OPTIONS") return json(204, {});
    if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Method Not Allowed" });

    // Require Netlify Identity user
    const user = context?.clientContext?.user || null;
    const email = String(user?.email || "").toLowerCase();
    if (!email) return json(401, { ok: false, error: "Unauthorized" });

    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    const siteUrl = process.env.SITE_URL; // e.g. https://yourdomain.com
    if (!stripeSecret) return json(500, { ok: false, error: "Missing STRIPE_SECRET_KEY" });
    if (!siteUrl) return json(500, { ok: false, error: "Missing SITE_URL" });

    let body = {};
    try { body = event.body ? JSON.parse(event.body) : {}; } catch { body = {}; }
    const invoiceId = body?.invoiceId;
    if (!invoiceId) return json(400, { ok: false, error: "Missing invoiceId" });

    // Load invoices from Blobs
    const store = getStore("tnk-data");
    const invoices = (await store.get("tnk_invoices.json", { type: "json" })) || [];
    const inv = invoices.find((x) => x.id === invoiceId);

    if (!inv) return json(404, { ok: false, error: "Invoice not found" });

    // Ensure invoice belongs to logged in user
    const invEmail = String(inv.customer_email || "").toLowerCase();
    if (invEmail !== email) return json(403, { ok: false, error: "Forbidden" });

    const status = String(inv.status || "").toLowerCase();
    if (status === "paid") return json(400, { ok: false, error: "Invoice already paid" });

    const total = Number(inv.total || 0);
    const amountCents = Math.round(total * 100);
    if (!Number.isFinite(amountCents) || amountCents < 50) {
      return json(400, { ok: false, error: "Invalid invoice total" });
    }

    const stripe = new Stripe(stripeSecret);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `TNK Lawncare — ${inv.number || "Invoice"}`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        invoice_id: String(inv.id),
        invoice_number: String(inv.number || ""),
        customer_email: email,
      },
      success_url: `${siteUrl}/customer.html#invoices?paid=1`,
      cancel_url: `${siteUrl}/customer.html#invoices?canceled=1`,
    });

    return json(200, { ok: true, url: session.url });
  } catch (e) {
    return json(500, { ok: false, error: e?.message || String(e), stack: e?.stack || null });
  }
}
