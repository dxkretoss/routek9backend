import stripe from "../config/stripe.js";
import env from "../config/env.js";

/**
 * Checks Supabase profiles table for existing stripe_customer_id.
 * If not found, creates a customer in Stripe and updates Supabase.
 */
export async function getOrCreateStripeCustomer({ userId, email, fullName, role = "driver" }) {
  if (!email) return null;
  const cleanEmail = email.trim().toLowerCase();

  // 1. Check in Supabase DB if customer ID already exists
  if (userId && env.supabaseUrl && env.supabaseAnonKey) {
    try {
      const res = await fetch(`${env.supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,stripe_customer_id`, {
        headers: {
          apikey: env.supabaseAnonKey,
          Authorization: `Bearer ${env.supabaseAnonKey}`,
        },
      });
      if (res.ok) {
        const rows = await res.json();
        if (rows?.[0]?.stripe_customer_id) {
          try {
            const existingStripeCust = await stripe.customers.retrieve(rows[0].stripe_customer_id);
            if (existingStripeCust && !existingStripeCust.deleted) {
              return existingStripeCust.id;
            }
          } catch (e) {
            console.warn("Notice: Stored stripe customer ID not found in current Stripe mode, searching or creating.");
          }
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
  if (!userId || !customerId || !env.supabaseUrl || !env.supabaseAnonKey) return;
  try {
    await fetch(`${env.supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: {
        apikey: env.supabaseAnonKey,
        Authorization: `Bearer ${env.supabaseAnonKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ stripe_customer_id: customerId }),
    });
  } catch (err) {
    console.warn("Notice saving customer ID to Supabase:", err);
  }
}
