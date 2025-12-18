// tnk-site/netlify/functions/stripe-webhook.js
import Stripe from "stripe";
import { getStore } from "@netlify/blobs";

export default async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return new Response("Missing Stripe env vars", { status: 500 });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing stripe-signature", { status: 400 });

  const rawBody = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return new Response(`Webhook signature verification failed: ${err.message}`, { status: 400 });
  }

  // We mark invoice paid when checkout completes successfully
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const invoiceId = session?.metadata?.invoice_id;

    if (invoiceId) {
      const store = getStore("tnk-data");
      const invoices = (await store.get("tnk_invoices.json", { type: "json" })) || [];
      const idx = invoices.findIndex((x) => x.id === invoiceId);

      if (idx >= 0) {
        invoices[idx] = {
          ...invoices[idx],
          status: "paid",
          paid_at: new Date().toISOString(),
          stripe: {
            session_id: session.id,
            payment_intent: session.payment_intent || null,
          },
        };
        await store.setJSON("tnk_invoices.json", invoices, {
          metadata: { updatedAt: new Date().toISOString() }
        });
      }
    }
  }

  return new Response("ok", { status: 200 });
};
