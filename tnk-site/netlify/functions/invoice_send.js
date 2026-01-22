import Stripe from "stripe";
import { getStore } from "@netlify/blobs";

export default async (request, context) => {
  const json = (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  if (request.method !== "POST") {
    return json(405, { ok: false, error: "Method Not Allowed" });
  }

  const env = globalThis.Netlify?.env || {};
  const STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) return json(500, { ok: false, error: "Missing STRIPE_SECRET_KEY" });

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const invoiceId = body.invoiceId || body.invoice_id;
  if (!invoiceId) return json(400, { ok: false, error: "Missing invoiceId" });

  const resolveUser = async () => {
    const ctxUser = context?.clientContext?.user || null;
    if (ctxUser) return ctxUser;

    const auth = request.headers.get("authorization");
    if (!auth) return null;

    try {
      const origin = new URL(request.url).origin;
      const res = await fetch(`${origin}/.netlify/identity/user`, {
        headers: { Authorization: auth },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  };

  const getRole = (user) => {
    if (!user) return null;
    const appRoles = Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles : [];
    const appRole = typeof user?.app_metadata?.role === "string" ? [user.app_metadata.role] : [];
    const metaRoles = Array.isArray(user?.user_metadata?.roles) ? user.user_metadata.roles : [];
    const metaRole = typeof user?.user_metadata?.role === "string" ? [user.user_metadata.role] : [];
    const roles = [...appRoles, ...appRole, ...metaRoles, ...metaRole]
      .map((r) => String(r || "").toLowerCase())
      .filter(Boolean);
    if (roles.includes("admin")) return "admin";
    if (roles.includes("employee")) return "employee";
    return "customer";
  };

  const user = await resolveUser();
  const role = getRole(user);
  if (!user || role !== "admin") return json(403, { ok: false, error: "Forbidden" });

  const getSiteUrl = () => {
    const envUrl = env.SITE_URL;
    if (envUrl && /^https?:\/\//i.test(envUrl)) return envUrl.replace(/\/+$/, "");
    try {
      const origin = new URL(request.url).origin;
      if (origin && /^https?:\/\//i.test(origin)) return origin.replace(/\/+$/, "");
    } catch {}
    const netlifyUrl = env.URL || env.DEPLOY_PRIME_URL;
    if (netlifyUrl && /^https?:\/\//i.test(netlifyUrl)) return netlifyUrl.replace(/\/+$/, "");
    return null;
  };

  const getConfiguredStore = () => {
    try {
      return getStore({ name: "tnk-data" });
    } catch {
      const siteID = env.NETLIFY_SITE_ID || env.SITE_ID || env.SITE_ID_PROD || "";
      const token = env.NETLIFY_BLOBS_TOKEN || env.NETLIFY_AUTH_TOKEN || env.NETLIFY_API_TOKEN || "";
      if (!siteID || !token) {
        throw new Error("MissingBlobsEnvironmentError: Netlify Blobs is not configured for this site.");
      }
      return getStore({ name: "tnk-data", siteID, token });
    }
  };

  const store = getConfiguredStore();
  const invoices = (await store.get("tnk_invoices.json", { type: "json" })) || [];
  const idx = invoices.findIndex((x) => x?.id === invoiceId);
  if (idx < 0) return json(404, { ok: false, error: "Invoice not found" });

  const inv = invoices[idx];
  if (!inv.customer_email) return json(400, { ok: false, error: "Invoice missing customer_email" });
  const total = Number(inv.total || 0);
  if (!Number.isFinite(total) || total <= 0) {
    return json(400, { ok: false, error: "Invoice total is invalid" });
  }

  const siteUrl = getSiteUrl();
  if (!siteUrl) return json(500, { ok: false, error: "Missing SITE_URL (or could not infer origin)" });

  const stripe = new Stripe(STRIPE_SECRET_KEY);
  const amountCents = Math.round(total * 100);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: inv.customer_email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: {
            name: `Invoice ${inv.number || ""}`.trim() || "TNK Invoice",
            description: inv.job_title || inv.notes || "Neighborhood Kids Lawncare Plus",
          },
        },
      },
    ],
    metadata: {
      invoice_id: inv.id,
      invoice_number: inv.number || "",
      customer_email: inv.customer_email || "",
    },
    success_url: `${siteUrl}/customer.html?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/customer.html?stripe=cancel`,
  });

  const RESEND_API_KEY = env.RESEND_API_KEY;
  const RESEND_FROM = env.RESEND_FROM;
  if (!RESEND_API_KEY || !RESEND_FROM) {
    return json(500, { ok: false, error: "Missing RESEND_API_KEY or RESEND_FROM" });
  }

  const serviceDate = inv.service_date || "";
  const customerLine = [inv.customer_name || "", inv.customer_address || ""].filter(Boolean).join(" — ");
  const paymentUrl = session.url || "";

  const subject = `Invoice ${inv.number || ""} from TNK Lawncare Plus`;
  const text = [
    `Hello ${inv.customer_name || ""}`.trim(),
    customerLine ? `Customer: ${customerLine}` : "",
    serviceDate ? `Service date: ${serviceDate}` : "",
    `Invoice ${inv.number || ""} total: $${total.toFixed(2)}`,
    `It was a pleasure servicing your property. Attached is invoice ${inv.number || ""} for $${total.toFixed(2)} and a payment link to get that taken care of.`,
    "We appreciate your business and look forward to servicing your property again.",
    paymentUrl ? `Payment link: ${paymentUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <p>Hello ${inv.customer_name || ""}</p>
    ${customerLine ? `<p><strong>Customer:</strong> ${customerLine}</p>` : ""}
    ${serviceDate ? `<p><strong>Service date:</strong> ${serviceDate}</p>` : ""}
    <p><strong>Invoice ${inv.number || ""} total:</strong> $${total.toFixed(2)}</p>
    <p>It was a pleasure servicing your property. Attached is invoice ${inv.number || ""} for $${total.toFixed(2)} and a payment link to get that taken care of.</p>
    <p>We appreciate your business and look forward to servicing your property again.</p>
    ${paymentUrl ? `<p><a href="${paymentUrl}">Pay this invoice</a></p>` : ""}
  `;

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [inv.customer_email],
      subject,
      text,
      html,
    }),
  });

  if (!emailRes.ok) {
    const detail = await emailRes.text();
    return json(500, { ok: false, error: "Email send failed", detail });
  }

  invoices[idx] = {
    ...inv,
    stripe_checkout_id: session.id,
    stripe_checkout_url: paymentUrl,
    emailed_at: new Date().toISOString(),
    emailed_to: inv.customer_email,
  };

  await store.setJSON("tnk_invoices.json", invoices, {
    metadata: { updatedAt: new Date().toISOString() },
  });

  return json(200, { ok: true, payment_url: paymentUrl });
};
