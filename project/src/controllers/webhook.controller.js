/**
 * Webhook Controller
 *
 * Handles Meta WhatsApp webhook verification and incoming messages.
 * CRITICAL: Must respond within 2 seconds to avoid Meta timeout.
 */

const { VERIFY_TOKEN } = require("../config/env");
const { parseMessage } = require("../utils/messageParser");
const messageProcessor = require("../services/messageProcessor.service");
const logger = require("../services/logger.service");

/**
 * Verify webhook endpoint (GET /webhook)
 *
 * Meta calls this to verify webhook subscription
 */
exports.verifyWebhook = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    logger.info(" Webhook verified successfully");
    return res.status(200).send(challenge);
  }

  logger.error("Webhook verification failed");
  return res.sendStatus(403);
};

/**
 * Receive incoming messages (POST /webhook)
 *
 * CRITICAL DESIGN:
 * 1. Respond with HTTP 200 IMMEDIATELY (< 500ms)
 * 2. Queue message for async processing
 * 3. Never block this function
 *
 * This ensures Meta doesn't timeout and retry delivery
 */
exports.receiveMessage = async (req, res) => {
  const requestTime = Date.now();

  console.log("\n🔥 Webhook received from Meta");

  // STEP 1: Return 200 immediately to Meta
  res.sendStatus(200);

  const responseTime = Date.now() - requestTime;
  console.log(`⚡ Webhook responded in ${responseTime}ms`);

  // STEP 2: Parse message asynchronously
  try {
    const message = parseMessage(req.body);

    if (!message) {
      console.log("⏭️ No valid message to process");
      return;
    }

    console.log(`📨 Parsed message from ${message.from}: "${message.text}"`);

    // STEP 3: Queue async processing (fire and forget)
    // Do NOT await - processing happens in background
    messageProcessor.processMessage(message).catch((err) => {
      console.error(" Background processing error:", err.message);
    });

    console.log(" Message queued for processing");
  } catch (err) {
    console.error(" Webhook error:", err.message);
    // Don't throw - we already responded to Meta
  }
};
