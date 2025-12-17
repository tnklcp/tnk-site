// tnk-site/netlify/functions/stripe-checkout.js
import Stripe from "stripe";

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body),
  };
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Method Not Allowed" });

  try {
    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) return json(500, { ok: false, error: "Missing STRIPE_SECRET_KEY" });

    const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" });

    const body = JSON.parse(event.body || "{}");
    const {
      kind,               // "invoice" | "subscription"
      customer_email,     // recommended
      success_url,        // absolute URL
      cancel_url,         // absolute URL
      metadata = {},

      // invoice payment fields:
      amount_cents,
      description,

      // subscription fields:
      price_id,           // Stripe Price ID (recurring)
      quantity = 1
    } = body;

    if (!success_url || !cancel_url) return json(400, { ok: false, error: "Missing success_url or cancel_url" });
    if (!kind || (kind !== "invoice" && kind !== "subscription")) return json(400, { ok: false, error: "Invalid kind" });

    // ----- Variable / project billing (one-time) -----
    if (kind === "invoice") {
      if (!Number.isInteger(amount_cents) || amount_cents < 50) return json(400, { ok: false, error: "Invalid amount_cents" });

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: customer_email || undefined,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: amount_cents,
              product_data: { name: description || "TNK Lawncare Payment" },
            },
          },
        ],
        success_url,
        cancel_url,
        metadata,
      });

      return json(200, { ok: true, url: session.url, id: session.id });
    }

    // ----- Fixed recurring billing (subscription) -----
    if (kind === "subscription") {
      const pid = price_id || process.env.STRIPE_SUBSCRIPTION_PRICE_ID;
      if (!pid) return json(500, { ok: false, error: "Missing STRIPE_SUBSCRIPTION_PRICE_ID (or price_id)" });

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer_email: customer_email || undefined,
        line_items: [{ price: pid, quantity: Number(quantity || 1) }],
        success_url,
        cancel_url,
        metadata,
      });

      return json(200, { ok: true, url: session.url, id: session.id });
    }

    return json(400, { ok: false, error: "Unhandled kind" });
  } catch (e) {
    return json(500, { ok: false, error: e?.message || "Server error" });
  }
}
