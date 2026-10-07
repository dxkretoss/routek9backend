import { createCheckoutSessionService, getProPlanPrices, verifySessionStatusService } from "../services/payment.service.js";

export const getPlans = async (req, res, next) => {
  try {
    const plans = await getProPlanPrices();
    res.status(200).json({ success: true, data: plans });
  } catch (err) {
    next(err);
  }
};

export const createCheckoutSession = async (req, res, next) => {
  try {
    const { planId, courseId, userId, email, fullName, returnUrl, productName, amountInCents } = req.body;
    const result = await createCheckoutSessionService({
      planId,
      courseId,
      userId,
      email,
      fullName,
      returnUrl,
      productName,
      amountInCents,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const verifySessionStatus = async (req, res, next) => {
  try {
    const sessionId = req.query.sessionId || req.query.session_id || req.params.sessionId;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: "Missing sessionId parameter." });
    }
    const result = await verifySessionStatusService(sessionId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

