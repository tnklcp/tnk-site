// tnk-site/netlify/functions/stripe-checkout.js
import Stripe from "stripe";

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
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
      kind, // "invoice" | "subscription"
      customer_email,
      success_url,
      cancel_url,
      metadata = {},

      // invoice:
      amount_cents,
      description,

      // subscription (per-client pricing):
      sub_amount_cents,
      sub_interval, // "week" | "month" | "year"
      sub_interval_count = 1,
      sub_name,
    } = body;

    if (!success_url || !cancel_url) return json(400, { ok: false, error: "Missing success_url or cancel_url" });
    if (kind !== "invoice" && kind !== "subscription") return json(400, { ok: false, error: "Invalid kind" });

    // One-time invoice payment
    if (kind === "invoice") {
      if (!Number.isInteger(amount_cents) || amount_cents < 50) {
        return json(400, { ok: false, error: "Invalid amount_cents (must be integer cents, >= 50)" });
      }

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

    // Recurring subscription with custom per-customer amount
    if (kind === "subscription") {
      const amt = Number(sub_amount_cents);
      const interval = String(sub_interval || "").toLowerCase();

      if (!Number.isInteger(amt) || amt < 50) {
        return json(400, { ok: false, error: "Invalid sub_amount_cents (integer cents, >= 50)" });
      }
      if (!["week", "month", "year"].includes(interval)) {
        return json(400, { ok: false, error: "Invalid sub_interval (week|month|year)" });
      }
      const count = Number(sub_interval_count || 1);
      if (!Number.isInteger(count) || count < 1 || count > 12) {
        return json(400, { ok: false, error: "Invalid sub_interval_count (1-12)" });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer_email: customer_email || undefined,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: amt,
              recurring: { interval, interval_count: count },
              product_data: { name: sub_name || "TNK Lawncare Recurring Service" },
            },
          },
        ],
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
