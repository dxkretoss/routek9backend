import { createCheckoutSessionService, getProPlanPrices } from "../services/payment.service.js";

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
    const { planId, userId, email, fullName, returnUrl } = req.body;
    const result = await createCheckoutSessionService({
      planId,
      userId,
      email,
      fullName,
      returnUrl,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
