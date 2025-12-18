// tnk-site/netlify/functions/stripe_webhook.js
import Stripe from "stripe";
import { getStore } from "@netlify/blobs";

function rawJson(statusCode, bodyObj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj),
  };
}

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") return rawJson(405, { ok: false, error: "Method Not Allowed" });

    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripeSecret) return rawJson(500, { ok: false, error: "Missing STRIPE_SECRET_KEY" });
    if (!webhookSecret) return rawJson(500, { ok: false, error: "Missing STRIPE_WEBHOOK_SECRET" });

    const stripe = new Stripe(stripeSecret);

    const sig =
      event.headers?.["stripe-signature"] ||
      event.headers?.["Stripe-Signature"] ||
      event.headers?.["STRIPE-SIGNATURE"];

    if (!sig) return rawJson(400, { ok: false, error: "Missing Stripe signature header" });

    const rawBody = event.body || "";
    let evt;
    try {
      evt = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
      return rawJson(400, { ok: false, error: `Signature verification failed: ${err?.message || err}` });
    }

    if (evt.type === "checkout.session.completed") {
      const session = evt.data.object;
      const invoiceId = session?.metadata?.invoice_id;

      if (invoiceId) {
        const store = getStore("tnk-data");
        const invoices = (await store.get("tnk_invoices.json", { type: "json" })) || [];
        const idx = invoices.findIndex((x) => x.id === invoiceId);

        if (idx >= 0) {
          invoices[idx].status = "paid";
          invoices[idx].paid_at = new Date().toISOString();
          invoices[idx].stripe_session_id = session.id;
          await store.setJSON("tnk_invoices.json", invoices);
        }
      }
    }

    return rawJson(200, { ok: true });
  } catch (e) {
    return rawJson(500, { ok: false, error: e?.message || String(e), stack: e?.stack || null });
  }
}
