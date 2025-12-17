import Stripe from "stripe";
import { getStore } from "@netlify/blobs";

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Method Not Allowed" });

  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return json(500, { ok: false, error: "Missing STRIPE_SECRET_KEY" });
  if (!webhookSecret) return json(500, { ok: false, error: "Missing STRIPE_WEBHOOK_SECRET" });

  const stripe = new Stripe(secret, { apiVersion: "2024-06-20" });

  const sig = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
  if (!sig) return json(400, { ok: false, error: "Missing Stripe-Signature header" });

  let evt;
  try {
    evt = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (e) {
    return json(400, { ok: false, error: `Webhook signature verification failed: ${e.message}` });
  }

  try {
    if (evt.type === "checkout.session.completed") {
      const session = evt.data.object;
      const invoiceId = session?.metadata?.invoice_id;

      if (invoiceId) {
        const store = getStore({ name: "tnk-data" });
        const key = "tnk_invoices.json";
        const invoices = (await store.get(key, { type: "json" })) || [];
        const inv = invoices.find((x) => x.id === invoiceId);

        if (inv) {
          inv.status = "paid";
          inv.paid_at = new Date().toISOString();
          inv.stripe_session_id = session.id;
          inv.stripe_payment_intent = session.payment_intent || "";

          await store.setJSON(key, invoices, {
            metadata: { updatedAt: new Date().toISOString() }
          });
        }
      }
    }

    return json(200, { ok: true });
  } catch (e) {
    return json(500, { ok: false, error: e?.message || "Webhook handler error" });
  }
}

function json(status, obj) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}
