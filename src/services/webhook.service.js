import stripe from "../config/stripe.js";
import env from "../config/env.js";
import { supabase } from "../config/supabase.js";

/**
 * Validates cryptographic Stripe webhook signature using raw body buffer.
 */
export function constructWebhookEvent(rawBody, signatureHeader) {
  if (!env.stripeWebhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured in environment variables.");
  }
  return stripe.webhooks.constructEvent(rawBody, signatureHeader, env.stripeWebhookSecret);
}

/**
 * Handles verified Stripe events and synchronizes records directly to Supabase DB.
 */
export async function processStripeWebhookEvent(event) {
  const eventType = event.type;
  const dataObject = event.data.object;

  console.log(`🔔 [Stripe Webhook] Processing event: ${eventType} (${event.id})`);

  switch (eventType) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(dataObject);
      break;

    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(dataObject);
      break;

    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(dataObject);
      break;

    case "invoice.payment_succeeded":
      await handleInvoicePaymentSucceeded(dataObject);
      break;

    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(dataObject);
      break;

    case "payment_intent.payment_failed":
      await handlePaymentIntentFailed(dataObject);
      break;

    default:
      console.log(`ℹ️ [Stripe Webhook] Unhandled event type: ${eventType}`);
      break;
  }

  return { received: true, eventType };
}

/**
 * Event: checkout.session.completed
 * Triggered immediately when a checkout session successfully finishes.
 */
async function handleCheckoutSessionCompleted(session) {
  const userId = session.metadata?.userId || null;
  const planId = session.metadata?.planId || "monthly";
  const courseId = session.metadata?.courseId || null;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id || null;
  const customerEmail = session.customer_details?.email || session.customer_email || "";
  const amountTotal = (session.amount_total ? session.amount_total / 100 : 0).toFixed(2);
  const isSubscription = session.mode === "subscription";

  const isYearlyPlan = planId.toLowerCase().includes("yearly");
  const cleanCourseId = isSubscription
    ? (isYearlyPlan ? "pro-yearly" : "pro-monthly")
    : (courseId || "certification");

  const description =
    isSubscription
      ? `Route K9 PRO Membership (${isYearlyPlan ? "Yearly" : "Monthly"})`
      : `Course / Certification Purchase: ${session.metadata?.productName || "Course"}`;

  console.log(`✅ [Checkout Completed] User: ${userId}, Customer: ${customerId}, Email: ${customerEmail}, Amount: $${amountTotal}, Mode: ${session.mode}`);

  // Resolve targetUserId if not present in metadata
  let targetUserId = userId;
  if (!targetUserId && (customerEmail || customerId)) {
    try {
      let query = supabase.from("profiles").select("id");
      if (customerId) {
        query = query.eq("stripe_customer_id", customerId);
      } else {
        query = query.eq("email", customerEmail);
      }
      const { data: userProfile } = await query.maybeSingle();
      if (userProfile?.id) targetUserId = userProfile.id;
    } catch (err) {
      console.warn("Notice resolving profile in checkout completed:", err);
    }
  }

  // 1. Update profiles table with ACTIVE status and Stripe identifiers
  if (targetUserId || customerEmail) {
    try {
      const updatePayload = {
        updated_at: new Date().toISOString(),
      };

      if (customerId) updatePayload.stripe_customer_id = customerId;

      if (isSubscription) {
        updatePayload.is_active = true;
        updatePayload.status = "ACTIVE";
      }

      let profileQuery = supabase.from("profiles").update(updatePayload);
      if (targetUserId) {
        profileQuery = profileQuery.eq("id", targetUserId);
      } else {
        profileQuery = profileQuery.eq("email", customerEmail);
      }

      const { error: profileError } = await profileQuery;
      if (profileError) {
        console.warn("⚠️ Failed updating profile in checkout.session.completed:", profileError.message);
      } else {
        console.log(`🎉 [Profile Status: ACTIVE] Successfully activated user ${targetUserId || customerEmail}`);
      }
    } catch (err) {
      console.error("Error updating profile in checkout.session.completed:", err);
    }
  }

  // 2. Insert verified record into transactions table
  try {
    const { error: txError } = await supabase.from("transactions").insert({
      id: session.id,
      user_id: targetUserId,
      email: customerEmail,
      description,
      amount: `$${amountTotal}`,
      status: "Succeeded",
      course_id: cleanCourseId,
      created_at: new Date().toISOString(),
    });

    if (txError) {
      console.warn("⚠️ Notice inserting into transactions:", txError.message);
    } else {
      console.log("💾 Transaction securely logged in database with status: Succeeded.");
    }
  } catch (err) {
    console.error("Error logging transaction:", err);
  }

  // 3. Send "PRO Membership Activated" Inbox Notification
  if (isSubscription && targetUserId) {
    try {
      await supabase.from("notifications").insert({
        user_id: targetUserId,
        title: "PRO Membership Activated",
        message: `Thank you! Your Route K9 PRO Membership (${isYearlyPlan ? "Yearly" : "Monthly"}) is now active. Enjoy premium features!`,
        category: "Earnings",
        unread: true,
        important: true,
        created_at: new Date().toISOString(),
      });
      console.log(`📬 Inbox notification delivered to user: ${targetUserId}`);
    } catch (notifErr) {
      console.warn("Notice sending activation notification:", notifErr);
    }
  }

  // 4. If Course/Certification checkout, record in driver_certifications
  const isCoursePurchase = !isSubscription || Boolean(courseId);
  const targetCourseId = courseId || (cleanCourseId !== "pro-monthly" && cleanCourseId !== "pro-yearly" ? cleanCourseId : null);

  if (isCoursePurchase && targetCourseId && targetUserId) {
    try {
      const certNumber = `CERT-${Date.now().toString(36).toUpperCase()}`;
      const courseTitle = session.metadata?.productName || "Certified Driver Course";

      await supabase.from("driver_certifications").insert({
        driver_id: targetUserId,
        course_id: targetCourseId,
        course_name: courseTitle,
        cert_number: certNumber,
        issued_at: new Date().toISOString(),
      });
      console.log(`🎓 Driver certification issued for user ${targetUserId}: ${certNumber}`);

      await supabase.from("notifications").insert({
        user_id: targetUserId,
        title: "Certification Enrolled 🎓",
        message: `Your payment was successful! You are now enrolled in "${courseTitle}" (Certificate ID: ${certNumber}).`,
        category: "Certification",
        unread: true,
        important: true,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn("Notice checking driver_certifications:", err);
    }
  }
}

/**
 * Event: customer.subscription.updated / created
 */
async function handleSubscriptionUpdated(subscription) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  const status = subscription.status; // 'active', 'trialing', 'incomplete', 'past_due', 'canceled', etc.
  const currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null;

  console.log(`🔄 [Subscription Update] Customer: ${customerId}, Status: ${status}, Next Period: ${currentPeriodEnd}`);

  if (!customerId) return;

  // IMPORTANT: Do NOT mark user inactive on initial 'incomplete' state during subscription creation
  if (status === "incomplete") {
    console.log(`ℹ️ [Subscription Created] Subscription is pending initial payment. Skipping active flag changes.`);
    return;
  }

  const isSubscriptionActive = status === "active" || status === "trialing";

  // Find profile
  try {
    const { data: profile, error: findError } = await supabase
      .from("profiles")
      .select("id, email, status, is_active")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();

    if (profile) {
      console.log(`ℹ️ [Subscription Sync] User ${profile.id} (${profile.email}) subscription status is "${status}". Account remains preserved.`);
    } else {
      console.log(`ℹ️ No existing profile found with stripe_customer_id: ${customerId}`);
    }
  } catch (err) {
    console.warn("Notice finding profile for subscription update:", err);
  }
}

/**
 * Event: customer.subscription.deleted
 * Triggered when a user cancels their subscription or subscription ends.
 * We preserve the user's account active so they can still log in as a standard user.
 */
async function handleSubscriptionDeleted(subscription) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  console.log(`❌ [Subscription Canceled/Ended] Customer: ${customerId}`);

  if (!customerId) return;

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();

    if (profile) {
      // Deliver courteous inbox notification informing user their PRO period ended
      await supabase.from("notifications").insert({
        user_id: profile.id,
        title: "PRO Membership Ended",
        message: "Your Route K9 PRO Membership has ended. Your account remains active on the standard tier.",
        category: "Subscription",
        unread: true,
        important: false,
        created_at: new Date().toISOString(),
      });

      console.log(`ℹ️ Account preserved as standard user for ${profile.email}. Dispatched notification.`);
    }
  } catch (err) {
    console.warn("Notice handling subscription cancellation:", err);
  }
}


/**
 * Event: invoice.payment_succeeded
 */
async function handleInvoicePaymentSucceeded(invoice) {
  if (invoice.billing_reason === "subscription_create") {
    // Initial invoice is already handled by checkout.session.completed
    return;
  }

  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  const amountPaid = (invoice.amount_paid ? invoice.amount_paid / 100 : 0).toFixed(2);
  const email = invoice.customer_email || "";

  console.log(`💰 [Invoice Paid (Recurring Renewal)] Customer: ${customerId}, Email: ${email}, Amount: $${amountPaid}`);

  try {
    let userId = null;
    if (customerId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();
      if (profile) userId = profile.id;
    }

    if (!userId && email) {
      const { data: fallbackProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (fallbackProfile) userId = fallbackProfile.id;
    }

    await supabase.from("transactions").insert({
      id: invoice.id,
      user_id: userId,
      email,
      description: "Route K9 PRO Membership Renewal",
      amount: `$${amountPaid}`,
      status: "Succeeded",
      course_id: "pro-monthly",
      created_at: new Date().toISOString(),
    });

    console.log(`💾 Recurring renewal transaction logged in database: ${invoice.id}`);
  } catch (err) {
    console.warn("Notice inserting recurring invoice transaction:", err);
  }
}

/**
 * Event: invoice.payment_failed
 */
async function handleInvoicePaymentFailed(invoice) {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  const email = invoice.customer_email || "";
  const failureReason =
    invoice.last_finalization_error?.message ||
    invoice.payment_intent?.last_payment_error?.message ||
    null;

  const failureSuffix = failureReason ? ` (${failureReason})` : "";
  console.warn(`🚨 [Invoice Payment Failed] Customer: ${customerId}, Email: ${email}, Reason: ${failureReason || "N/A"}`);

  try {
    let userId = null;
    if (customerId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();
      if (profile) userId = profile.id;
    }

    if (!userId && email) {
      const { data: fallbackProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (fallbackProfile) userId = fallbackProfile.id;
    }

    const amountFailed = (invoice.amount_due ? invoice.amount_due / 100 : 0).toFixed(2);

    await supabase.from("transactions").insert({
      id: invoice.id,
      user_id: userId,
      email,
      description: `Failed Route K9 PRO Subscription Payment${failureSuffix}`,
      amount: `$${amountFailed}`,
      status: "Failed",
      course_id: "pro-monthly",
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("Notice logging failed payment:", err);
  }
}

/**
 * Event: payment_intent.payment_failed
 * Triggered when a one-time payment (Course / Certification) fails or is declined.
 */
async function handlePaymentIntentFailed(paymentIntent) {
  // If this PaymentIntent is attached to an Invoice (Subscription billing),
  // it is already recorded by the invoice.payment_failed event. Skip to avoid duplicates.
  if (paymentIntent.invoice) {
    console.log(`ℹ️ [Payment Intent Failed] Belongs to subscription invoice (${paymentIntent.invoice}). Skipping duplicate transaction log.`);
    return;
  }

  const customerId = typeof paymentIntent.customer === "string" ? paymentIntent.customer : paymentIntent.customer?.id;
  const email = paymentIntent.receipt_email || paymentIntent.charges?.data?.[0]?.billing_details?.email || "";
  const amount = (paymentIntent.amount ? paymentIntent.amount / 100 : 0).toFixed(2);
  const failureReason = paymentIntent.last_payment_error?.message || "Payment declined";
  const productName = paymentIntent.metadata?.productName || "Payment";
  const courseId = paymentIntent.metadata?.courseId || null;

  console.warn(`🚨 [Payment Intent Failed] Customer: ${customerId}, Amount: $${amount}, Reason: ${failureReason}`);

  try {
    let userId = paymentIntent.metadata?.userId || null;
    if (!userId && customerId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();
      if (profile) userId = profile.id;
    }

    await supabase.from("transactions").insert({
      id: paymentIntent.id,
      user_id: userId,
      email,
      description: `Failed Payment: ${productName} (${failureReason})`,
      amount: `$${amount}`,
      status: "Failed",
      course_id: courseId,
      created_at: new Date().toISOString(),
    });
    console.log("💾 Failed one-time payment intent recorded in transactions table.");
  } catch (err) {
    console.warn("Notice logging failed payment intent:", err);
  }
}


