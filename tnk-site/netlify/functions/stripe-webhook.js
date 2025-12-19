// tnk-site/netlify/functions/stripe_webhook.js
import Stripe from "stripe";
import { getStore } from "@netlify/blobs";

function rawBody(event) {
  const b = event.body || "";
  if (event.isBase64Encoded) return Buffer.from(b, "base64");
  return Buffer.from(b, "utf8");
}

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
    if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
      return { statusCode: 500, body: "Missing Stripe env vars" };
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY);
    const sig = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
    if (!sig) return { statusCode: 400, body: "Missing stripe-signature" };

    let evt;
    try {
      evt = stripe.webhooks.constructEvent(rawBody(event), sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error("[stripe_webhook] signature verify failed:", err?.message || err);
      return { statusCode: 400, body: "Webhook signature verification failed" };
    }

    if (evt.type === "checkout.session.completed") {
      const session = evt.data.object;

      const invoiceId = session?.metadata?.invoice_id;
      if (invoiceId) {
        const store = getStore("tnk-data");
        const key = "tnk_invoices.json";
        const invoices = (await store.get(key, { type: "json" })) || [];

        const idx = invoices.findIndex((x) => x?.id === invoiceId);
        if (idx >= 0) {
          invoices[idx] = {
            ...invoices[idx],
            status: "paid",
            paid_at: new Date().toISOString(),
            stripe_session_id: session.id,
            stripe_payment_intent: session.payment_intent || "",
          };
          await store.set(key, JSON.stringify(invoices), {
            metadata: { updatedAt: new Date().toISOString() },
          });
        }
      }
    }

    return { statusCode: 200, body: "ok" };
  } catch (e) {
    console.error("[stripe_webhook] error:", e);
    return { statusCode: 500, body: "server error" };
  }
}
