import dotenv from "dotenv";

dotenv.config();

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 5000,
  apiPrefix: process.env.API_PREFIX || "/api/v1",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripePriceMonthly: process.env.STRIPE_PRICE_MONTHLY || "price_1UBCfECjtUNWPqGvQmM7HqCL",
  stripePriceYearly: process.env.STRIPE_PRICE_YEARLY || "price_1UBCfxCjtUNWPqGvAgJkM7A5",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
};

export default env;
