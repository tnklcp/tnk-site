// tnk-site/netlify/functions/stripe-create-checkout.js
import Stripe from "stripe";
import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

  const user = context?.clientContext?.user || null;
  if (!user?.email) return json({ ok: false, error: "Unauthorized" }, 401);

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) return json({ ok: false, error: "Missing STRIPE_SECRET_KEY" }, 500);

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

  const body = await safeJson(req);
  const invoiceId = body?.invoiceId;
  if (!invoiceId) return json({ ok: false, error: "Missing invoiceId" }, 400);

  // Load invoices from Netlify Blobs (same store your portals use)
  const store = getStore("tnk-data");
  const invoices = (await store.get("tnk_invoices.json", { type: "json" })) || [];

  const inv = invoices.find((x) => x.id === invoiceId);
  if (!inv) return json({ ok: false, error: "Invoice not found" }, 404);

  const customerEmail = String(inv.customer_email || "").toLowerCase();
  const authedEmail = String(user.email || "").toLowerCase();

  // Customer can only pay their own invoice
  if (customerEmail !== authedEmail) return json({ ok: false, error: "Forbidden" }, 403);

  if (inv.status === "paid") return json({ ok: false, error: "Invoice already paid" }, 400);

  const siteUrl =
    process.env.URL || // Netlify provides URL at build/runtime
    `${req.headers.get("x-forwarded-proto") || "https"}://${req.headers.get("host")}`;

  // Convert invoice items to Stripe line_items
  const items = Array.isArray(inv.items) ? inv.items : [];
  const line_items = items.length
    ? items.map((it) => ({
        quantity: Math.max(1, Number(it.qty || 1)),
        price_data: {
          currency: "usd",
          unit_amount: Math.max(0, Math.round(Number(it.unit || 0) * 100)),
          product_data: {
            name: String(it.desc || "Service"),
          },
        },
      }))
    : [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.max(0, Math.round(Number(inv.total || 0) * 100)),
            product_data: { name: `Invoice ${inv.number || ""}`.trim() || "Invoice" },
          },
        },
      ];

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: authedEmail,
    line_items,
    success_url: `${siteUrl}/customer.html?paid=1&invoice=${encodeURIComponent(inv.id)}`,
    cancel_url: `${siteUrl}/customer.html?canceled=1&invoice=${encodeURIComponent(inv.id)}`,
    metadata: {
      invoice_id: String(inv.id),
      invoice_number: String(inv.number || ""),
      customer_email: authedEmail,
    },
  });

  return json({ ok: true, url: session.url }, 200);
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}
async function safeJson(req) {
  try {
    const t = await req.text();
    return t ? JSON.parse(t) : {};
  } catch {
    return {};
  }
}
