// tnk-site/netlify/functions/stripe-portal.js
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

    const { customer_email, return_url } = body;
    if (!customer_email) return json(400, { ok: false, error: "Missing customer_email" });
    if (!return_url) return json(400, { ok: false, error: "Missing return_url" });

    // Find or create Stripe Customer
    const existing = await stripe.customers.list({ email: customer_email, limit: 1 });
    const customer = existing.data[0] || (await stripe.customers.create({ email: customer_email }));

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url,
    });

    return json(200, { ok: true, url: session.url });
  } catch (e) {
    return json(500, { ok: false, error: e?.message || "Server error" });
  }
}
