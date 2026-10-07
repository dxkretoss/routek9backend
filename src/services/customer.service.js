import stripe from "../config/stripe.js";
import { supabase } from "../config/supabase.js";

/**
 * Checks Supabase profiles table for existing stripe_customer_id.
 * If not found, creates a customer in Stripe and updates Supabase.
 */
export async function getOrCreateStripeCustomer({ userId, email, fullName, role = "driver" }) {
  if (!email) return null;
  const cleanEmail = email.trim().toLowerCase();

  // 1. Check in Supabase DB if customer ID already exists
  if (userId) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, stripe_customer_id")
        .eq("id", userId)
        .maybeSingle();

      if (!error && data?.stripe_customer_id) {
        try {
          const existingStripeCust = await stripe.customers.retrieve(data.stripe_customer_id);
          if (existingStripeCust && !existingStripeCust.deleted) {
            return existingStripeCust.id;
          }
        } catch (e) {
          console.warn("Notice: Stored stripe customer ID not found in current Stripe mode, searching or creating.");
        }
      }
    } catch (err) {
      console.warn("Supabase lookup warning:", err);
    }
  }

  // 2. Search Stripe by email to avoid duplicates
  try {
    const existingList = await stripe.customers.list({ email: cleanEmail, limit: 1 });
    if (existingList.data.length > 0) {
      const custId = existingList.data[0].id;
      await saveCustomerIdToSupabase(userId, custId);
      return custId;
    }
  } catch (err) {
    console.warn("Stripe list customers notice:", err);
  }

  // 3. Create a new Stripe Customer
  const newCustomer = await stripe.customers.create({
    email: cleanEmail,
    name: fullName || undefined,
    metadata: {
      userId: userId || "",
      role: role || "",
    },
  });

  await saveCustomerIdToSupabase(userId, newCustomer.id);
  return newCustomer.id;
}

async function saveCustomerIdToSupabase(userId, customerId) {
  if (!userId || !customerId) return;
  try {
    const { error } = await supabase
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", userId);

    if (error) {
      console.warn("Notice saving customer ID to Supabase:", error.message);
    }
  } catch (err) {
    console.warn("Notice saving customer ID to Supabase:", err);
  }
}
