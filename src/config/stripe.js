import Stripe from "stripe";
import env from "./env.js";

export const stripe = new Stripe(env.stripeSecretKey, {
  apiVersion: "2024-06-20",
});

export default stripe;
