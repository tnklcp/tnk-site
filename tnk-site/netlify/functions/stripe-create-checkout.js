import Stripe from "stripe";
import { getStore } from "@netlify/blobs";

export async function handler(event, context) {
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Method Not Allowed" });

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return json(500, { ok: false, error: "Missing STRIPE_SECRET_KEY" });

  const siteUrl = (process.env.SITE_URL || "").replace(/\/$/, "");
  if (!siteUrl) return json(500, { ok: false, error: "Missing SITE_URL env var (e.g. https://yourdomain.com)" });

  const user = context?.clientContext?.user || event?.clientContext?.user || null;
  if (!user?.email) return json(401, { ok: false, error: "Unauthorized" });

  const body = safeJSON(event.body);
  const invoiceId = body?.invoiceId;
  if (!invoiceId) return json(400, { ok: false, error: "Missing invoiceId" });

  const store = getStore({ name: "tnk-data" });
  const key = "tnk_invoices.json";
  const invoices = (await store.get(key, { type: "json" })) || [];
  const inv = invoices.find((x) => x.id === invoiceId);
  if (!inv) return json(404, { ok: false, error: "Invoice not found" });

  const payerEmail = String(user.email).toLowerCase();
  const invEmail = String(inv.customer_email || "").toLowerCase();
  if (!invEmail || invEmail !== payerEmail) return json(403, { ok: false, error: "Invoice does not belong to this user" });

  const total = Number(inv.total || 0);
  if (!Number.isFinite(total) || total <= 0) return json(400, { ok: false, error: "Invoice total must be > 0" });

  const stripe = new Stripe(secret, { apiVersion: "2024-06-20" });

  const invoiceLabel = inv.number ? `Invoice ${inv.number}` : "Invoice";

  // If items exist, use them; otherwise a single line item for total.
  const items = Array.isArray(inv.items) && inv.items.length
    ? inv.items
        .filter(it => (it?.desc || "").trim())
        .map((it) => {
          const qty = Math.max(1, Number(it.qty || 1));
          const unit = Math.max(0, Number(it.unit || 0));
          return {
            price_data: {
              currency: "usd",
              product_data: { name: it.desc },
              unit_amount: Math.round(unit * 100),
            },
            quantity: qty,
          };
        })
    : [{
        price_data: {
          currency: "usd",
          product_data: { name: invoiceLabel },
          unit_amount: Math.round(total * 100),
        },
        quantity: 1,
      }];

  // If tax_pct is set, keep it simple for now (invoice already includes total)
  // Stripe tax rules can be added later.

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: payerEmail,
    line_items: items,
    success_url: `${siteUrl}/customer.html?paid=1&invoice=${encodeURIComponent(inv.id)}`,
    cancel_url: `${siteUrl}/customer.html?canceled=1&invoice=${encodeURIComponent(inv.id)}`,
    metadata: {
      invoice_id: String(inv.id),
      invoice_number: String(inv.number || ""),
      customer_email: payerEmail,
    },
  });

  // Save session id onto invoice for traceability (no status flip here)
  inv.stripe_session_id = session.id;
  inv.stripe_session_url = session.url;

  await store.setJSON(key, invoices, { metadata: { updatedAt: new Date().toISOString() } });

  return json(200, { ok: true, url: session.url });
}

function safeJSON(txt) {
  try { return txt ? JSON.parse(txt) : {}; } catch { return {}; }
}

function json(status, obj) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}
