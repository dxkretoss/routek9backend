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
export async function createCheckoutSessionService({
  planId,
  courseId,
  userId,
  email,
  fullName,
  returnUrl,
  productName,
  amountInCents,
}) {
  if (!returnUrl) throw new Error("returnUrl is required");

  // 1. Get or create single permanent Stripe Customer ID
  const customerId = await getOrCreateStripeCustomer({
    userId,
    email,
    fullName,
  });

  const cleanPlanId = String(planId || "").trim().toLowerCase();
  const isYearly =
    cleanPlanId.includes("yearly") ||
    cleanPlanId.includes("year") ||
    cleanPlanId === env.stripePriceYearly.toLowerCase() ||
    cleanPlanId === "price_1ubvxccjtunwpqvuoqc7wh4" ||
    cleanPlanId === "price_1ubcfxcjtunwpqvagjkm7a5";

  const isMonthly =
    cleanPlanId.includes("monthly") ||
    cleanPlanId.includes("month") ||
    cleanPlanId === env.stripePriceMonthly.toLowerCase() ||
    cleanPlanId === "price_1ubvwucjtunwpqvuoqcqdarm" ||
    cleanPlanId === "price_1ubcfecjtunwpqvqmm7hqcl";

  const isCourseOrCert = Boolean(
    courseId ||
    cleanPlanId.includes("hipaa") ||
    cleanPlanId.includes("cert") ||
    cleanPlanId.includes("course") ||
    (productName && !cleanPlanId.includes("pro") && !isYearly && !isMonthly)
  );

  const isSubscription = !isCourseOrCert && (cleanPlanId.includes("pro") || isYearly || isMonthly || (!productName && !amountInCents));

  const resolvedCourseId = courseId || (!isSubscription ? cleanPlanId : null);
  const resolvedProductName = productName || (isSubscription ? "Route K9 PRO Membership" : "Route K9 Certification Course");

  const sessionParams = {
    ui_mode: "embedded",
    return_url: returnUrl,
    customer: customerId || undefined,
    customer_email: customerId ? undefined : (email || undefined),
    metadata: {
      userId: userId || "",
      planId: isSubscription ? (isYearly ? "yearly" : "monthly") : (cleanPlanId || "certification"),
      courseId: resolvedCourseId || "",
      productName: resolvedProductName,
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
            name: resolvedProductName,
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

/**
 * Verifies the actual Stripe payment status of a checkout session
 */
export async function verifySessionStatusService(sessionId) {
  if (!sessionId || typeof sessionId !== "string") {
    return {
      success: false,
      paid: false,
      message: "A valid sessionId is required.",
    };
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const isPaid = session.payment_status === "paid";
    const isComplete = session.status === "complete";
    const isSuccessful = isPaid || isComplete;

    return {
      success: isSuccessful,
      paid: isPaid,
      status: session.status,
      paymentStatus: session.payment_status,
      customerEmail: session.customer_details?.email || session.customer_email || "",
      amountTotal: session.amount_total ? (session.amount_total / 100).toFixed(2) : "0.00",
      planId: session.metadata?.planId || "monthly",
      userId: session.metadata?.userId || null,
    };
  } catch (err) {
    return {
      success: false,
      paid: false,
      status: "error",
      message: err.message || "Failed to retrieve Stripe session",
    };
  }
}


