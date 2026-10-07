import { Router } from "express";
import { createCheckoutSession, getPlans, verifySessionStatus } from "../controllers/payment.controller.js";
import { handleStripeWebhook } from "../controllers/webhook.controller.js";

const router = Router();

router.get("/plans", getPlans);
router.get("/verify-session", verifySessionStatus);
router.post("/create-checkout-session", createCheckoutSession);
router.post("/webhook", handleStripeWebhook);

export default router;

