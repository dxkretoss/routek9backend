import stripe from "../config/stripe.js";
import { getOrCreateStripeCustomer } from "./customer.service.js";

/**
 * Retrieves the active prices under the "Route K9 PRO" product catalogue in Stripe if permitted
 */
export async function getProPlanPrices() {
  try {
    const products = await stripe.products.list({ active: true, limit: 10 });
    const proProduct = products.data.find(
      (p) => p.name.toLowerCase().includes("route k9 pro") || p.name.toLowerCase().includes("pro")
    ) || products.data[0];

    if (!proProduct) {
      return { product: null, monthly: null, yearly: null };
    }

    const prices = await stripe.prices.list({ product: proProduct.id, active: true });
    const monthly = prices.data.find((p) => p.recurring?.interval === "month");
    const yearly = prices.data.find((p) => p.recurring?.interval === "year");

    return { product: proProduct, monthly, yearly };
  } catch (err) {
    return { product: null, monthly: null, yearly: null };
  }
}

/**
 * Creates an embedded Stripe checkout session using existing product prices and single customer ID
 */
export async function createCheckoutSessionService({ planId, userId, email, fullName, returnUrl }) {
  if (!returnUrl) throw new Error("returnUrl is required");

  // 1. Get or create single permanent Stripe Customer ID
  const customerId = await getOrCreateStripeCustomer({
    userId,
    email,
    fullName,
  });

  const cleanPlanId = String(planId || "").toLowerCase();
  const isYearly = cleanPlanId.includes("yearly") || cleanPlanId.includes("year");
  const isSubscription = cleanPlanId.includes("pro") || isYearly || cleanPlanId.includes("monthly");

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
    sessionParams.mode = "subscription";
    const { monthly, yearly } = await getProPlanPrices();
    const targetPrice = isYearly ? (yearly || monthly) : (monthly || yearly);

    if (targetPrice?.id) {
      sessionParams.line_items = [{ price: targetPrice.id, quantity: 1 }];
    } else {
      sessionParams.line_items = [
        {
          price_data: {
            currency: "usd",
            product_data: { name: isYearly ? "Route K9 PRO (Yearly)" : "Route K9 PRO (Monthly)" },
            unit_amount: isYearly ? 29900 : 2900,
            recurring: { interval: isYearly ? "year" : "month" },
          },
          quantity: 1,
        },
      ];
    }
  } else {
    // One-time Course / Certification Checkout ($49.00 default)
    sessionParams.mode = "payment";
    sessionParams.line_items = [
      {
        price_data: {
          currency: "usd",
          product_data: { name: "Route K9 Training Course" },
          unit_amount: 4900,
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
