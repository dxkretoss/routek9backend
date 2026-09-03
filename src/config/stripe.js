import Stripe from "stripe";
import env from "./env.js";

export const stripe = new Stripe(env.stripeSecretKey, {
  apiVersion: "2023-10-16",
});

export default stripe;
