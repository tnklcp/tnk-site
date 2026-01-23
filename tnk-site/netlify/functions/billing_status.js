import { getStripeSecretKey } from "./stripe-utils.js";

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async (request) => {
  if (request.method !== "GET") {
    return json(405, { ok: false, error: "Method Not Allowed" });
  }

  const env = globalThis.Netlify?.env || process.env || {};

  const stripeKey = getStripeSecretKey(env);
  const stripeKeyOptions = [
    "STRIPE_SECRET_KEY",
    "STRIPE_API_KEY",
    "STRIPE_LIVE_SECRET_KEY",
    "STRIPE_KEY",
  ];
  const stripeConfigured = Boolean(stripeKey);

  const resendMissing = [];
  if (!env.RESEND_API_KEY) resendMissing.push("RESEND_API_KEY");
  if (!env.RESEND_FROM) resendMissing.push("RESEND_FROM");

  return json(200, {
    ok: true,
    stripe: {
      configured: stripeConfigured,
      missing: stripeConfigured ? [] : stripeKeyOptions,
      recommended: "STRIPE_SECRET_KEY",
    },
    email: {
      configured: resendMissing.length === 0,
      missing: resendMissing,
    },
  });
};
