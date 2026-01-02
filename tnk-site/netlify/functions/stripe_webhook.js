// tnk-site/netlify/functions/stripe_webhook.js
import Stripe from "stripe";
import { getStore } from "@netlify/blobs";

function rawBody(event) {
  const b = event.body || "";
  if (event.isBase64Encoded) return Buffer.from(b, "base64");
  return Buffer.from(b, "utf8");
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

          // Store as JSON (consistent)
          await store.setJSON(key, invoices, {
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
