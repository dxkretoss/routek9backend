import { constructWebhookEvent, processStripeWebhookEvent } from "../services/webhook.service.js";

/**
 * Handles incoming Stripe Webhooks
 * POST /api/v1/payments/webhook
 */
export async function handleStripeWebhook(req, res, next) {
  const signature = req.headers["stripe-signature"];

  if (!signature) {
    return res.status(400).json({
      success: false,
      message: "Missing Stripe signature header.",
    });
  }

  let event;

  try {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : typeof req.body === "string"
      ? req.body
      : JSON.stringify(req.body);

    event = constructWebhookEvent(rawBody, signature);
  } catch (err) {
    console.error("⚠️ Stripe Webhook Signature Verification Failed:", err.message);
    return res.status(400).json({
      success: false,
      message: `Webhook Signature Verification Error: ${err.message}`,
    });
  }

  try {
    const result = await processStripeWebhookEvent(event);
    return res.status(200).json(result);
  } catch (err) {
    console.error("❌ Error processing webhook event:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error during webhook processing.",
    });
  }
}
