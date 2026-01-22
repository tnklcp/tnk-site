export function getStripeSecretKey(env = {}) {
  return (
    env.STRIPE_SECRET_KEY ||
    env.STRIPE_API_KEY ||
    env.STRIPE_LIVE_SECRET_KEY ||
    env.STRIPE_KEY ||
    ""
  );
}

export function stripeSecretKeyError() {
  return "Missing Stripe secret key. Set STRIPE_SECRET_KEY (preferred) or STRIPE_API_KEY in Netlify environment variables.";
}
