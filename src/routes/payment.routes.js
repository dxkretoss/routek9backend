import { Router } from "express";
import { createCheckoutSession, getPlans } from "../controllers/payment.controller.js";

const router = Router();

router.get("/plans", getPlans);
router.post("/create-checkout-session", createCheckoutSession);

export default router;
