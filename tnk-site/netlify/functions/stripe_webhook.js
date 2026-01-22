import Stripe from "stripe";
import { getStore } from "@netlify/blobs";

function getEnv() {
  return globalThis.Netlify?.env || {};
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

export default async (request) => {
  try {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const env = getEnv();
    const STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY;
    const STRIPE_WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET;
    if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
      return new Response("Missing Stripe env vars", { status: 500 });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY);
    const sig = request.headers.get("stripe-signature");
    if (!sig) return new Response("Missing stripe-signature", { status: 400 });

    let evt;
    try {
      const raw = await request.arrayBuffer();
      evt = stripe.webhooks.constructEvent(Buffer.from(raw), sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error("[stripe_webhook] signature verify failed:", err?.message || err);
      return new Response("Webhook signature verification failed", { status: 400 });
    }

    if (evt.type === "checkout.session.completed") {
      const session = evt.data.object;

      const invoiceId = session?.metadata?.invoice_id;
      if (invoiceId) {
        const store = getConfiguredStore();
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

          await store.setJSON(key, invoices, {
            metadata: { updatedAt: new Date().toISOString() },
          });
        }
      }
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("[stripe_webhook] error:", e);
    return new Response("server error", { status: 500 });
  }
};
