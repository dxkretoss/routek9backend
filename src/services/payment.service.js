import stripe from "../config/stripe.js";
import env from "../config/env.js";
import { getOrCreateStripeCustomer } from "./customer.service.js";

/**
 * Retrieves the verified PRO subscription prices from Stripe
 */
export async function getProPlanPrices() {
  try {
    const [monthlyPrice, yearlyPrice] = await Promise.allSettled([
      stripe.prices.retrieve(env.stripePriceMonthly),
      stripe.prices.retrieve(env.stripePriceYearly),
    ]);

    return {
      monthly: monthlyPrice.status === "fulfilled" ? monthlyPrice.value : { id: env.stripePriceMonthly, unit_amount: 2900 },
      yearly: yearlyPrice.status === "fulfilled" ? yearlyPrice.value : { id: env.stripePriceYearly, unit_amount: 29900 },
    };
  } catch (err) {
    return {
      monthly: { id: env.stripePriceMonthly, unit_amount: 2900 },
      yearly: { id: env.stripePriceYearly, unit_amount: 29900 },
    };
  }
}

/**
 * Creates a secure embedded Stripe checkout session using verified backend price IDs
 */
export async function createCheckoutSessionService({ planId, userId, email, fullName, returnUrl, productName, amountInCents }) {
  if (!returnUrl) throw new Error("returnUrl is required");

  // 1. Get or create single permanent Stripe Customer ID
  const customerId = await getOrCreateStripeCustomer({
    userId,
    email,
    fullName,
  });

  const cleanPlanId = String(planId || "").toLowerCase();
  const isYearly = cleanPlanId.includes("yearly") || cleanPlanId.includes("year") || cleanPlanId === env.stripePriceYearly.toLowerCase();
  const isSubscription = cleanPlanId.includes("pro") || isYearly || cleanPlanId.includes("monthly") || cleanPlanId === env.stripePriceMonthly.toLowerCase();

  const sessionParams = {
    ui_mode: "embedded",
    return_url: returnUrl,
    customer: customerId || undefined,
    customer_email: customerId ? undefined : (email || undefined),
    metadata: {
      userId: userId || "",
      planId: cleanPlanId,
    },
  };

  if (isSubscription) {
    // 2. Subscription checkout linked directly to verified Stripe Price IDs
    sessionParams.mode = "subscription";
    const selectedPriceId = isYearly ? env.stripePriceYearly : env.stripePriceMonthly;

    sessionParams.line_items = [
      {
        price: selectedPriceId,
        quantity: 1,
      },
    ];
  } else {
    // 3. One-time Course / Certification Checkout
    sessionParams.mode = "payment";

    let unitAmount = 4900;
    if (typeof amountInCents === "number" && amountInCents >= 50) {
      unitAmount = Math.round(amountInCents);
    } else if (cleanPlanId.includes("hipaa") || cleanPlanId.includes("cert")) {
      unitAmount = 2500;
    }

    sessionParams.line_items = [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: productName || "Route K9 Training Course",
          },
          unit_amount: unitAmount,
        },
        quantity: 1,
      },
    ];
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
  return {
    clientSecret: session.client_secret,
    sessionId: session.id,
  };
}
