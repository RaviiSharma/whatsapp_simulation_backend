/**
 * Message Processor Service
 *
 * Handles asynchronous processing of incoming WhatsApp messages.
 * Orchestrates: deduplication → agent routing → fraud detection → AI generation → sending
 */

const agentRouter = require("./agentRouter.service");
const sessionStore = require("./sessionStore.service");
const aiService = require("./ai.service");
const whatsappService = require("./whatsapp.service");
const deduplication = require("../utils/deduplication");

/**
 * Main message processing pipeline
 *
 * This is the core business logic that runs asynchronously after webhook responds
 *
 * @param {object} message - Parsed message object
 * @param {string} message.from - User's WhatsApp number
 * @param {string} message.text - Message text
 * @param {string} message.messageId - WhatsApp message ID
 * @returns {Promise<void>}
 */
async function processMessage(message) {
  const startTime = Date.now();
  const { from, text, messageId } = message;

  console.log(`\n🔄 Processing message from ${from}: "${text}"`);

  try {
    // STEP 1: Deduplication check
    const isDupe = await deduplication.isDuplicate(messageId);
    if (isDupe) {
      console.log(`⏭️ Skipping duplicate message: ${messageId}`);
      return;
    }

    // Mark as processing
    await deduplication.markAsProcessed(messageId);

    // STEP 2: Check if session exists (CRITICAL - prevents reassignment)
    console.log(`🔍 Checking for existing session: ${from}`);
    let session = await sessionStore.getSession(from);
    console.log(
      `🔍 Session result:`,
      session ? `Found (agent: ${session.agentName})` : "Not found",
    );

    let agentName;
    let isNewUser = false;
    let context;

    if (session) {
      // ✅ Session exists - use existing agent (NEVER reassign)
      agentName = session.agentName;
      isNewUser = session.isNewUser === true;
      context = agentRouter.getAgentContext(agentName);
      console.log(`✅ Using existing agent: ${agentName} (PRESERVED)`);
    } else {
      // ❌ No session - create new one with load balancing
      console.log(
        `⚠️ No session found - creating new session with load balancing`,
      );
      agentName = await agentRouter.assignAgent(from);
      isNewUser = true;
      context = agentRouter.getAgentContext(agentName);

      await sessionStore.createSession(from, {
        agentName,
        assignedAt: new Date().toISOString(),
        lastMessageAt: new Date().toISOString(),
        messageCount: 0,
        isNewUser: true,
        proactiveStart: false,
      });

      console.log(`🆕 New session created → ${agentName}`);
    }

    // Increment message count
    await sessionStore.incrementMessageCount(from);

    console.log(`🎯 Routed to: ${agentName} (new: ${isNewUser})`);

    // STEP 3: Handle new user - send intro message FIRST
    // Note: isNewUser means "first message ever OR first message after proactive"
    // For proactive users, intro was already sent via template, so check session flag
    if (isNewUser) {
      const session = await agentRouter.getSession(from);
      const isProactiveUser = session?.proactiveStart === true;

      if (isProactiveUser) {
        console.log(
          `📋 User ${from} started via proactive - skipping intro message`,
        );
        // Update session to mark as no longer new
        await agentRouter.updateSessionNewUserFlag(from, false);
      } else {
        // Truly new user from webhook - send intro
        await handleNewUser(from, agentName, context);
      }
    }

    // STEP 4: Fraud detection (classification ONLY - not message generation)
    const fraudResult = await detectFraud(from, text, agentName);

    if (fraudResult.decision.action === "BLOCK") {
      console.log(`🚫 Message blocked due to fraud detection`);
      await sendMessage(from, fraudResult.decision.message);
      logMetrics("blocked", startTime);
      return;
    }

    // STEP 5: Generate reply from assigned AGENT (not fraud detection)
    console.log(`🧠 Generating reply using ${agentName}`);
    const aiReply = await generateReply(from, text, agentName);

    console.log(
      `✅ Generated ${agentName} reply: "${aiReply.substring(0, 50)}..."`,
    );

    // STEP 6: Send reply to WhatsApp
    await sendMessage(from, aiReply);

    logMetrics("success", startTime);
    console.log(
      `✅ Message processed successfully in ${Date.now() - startTime}ms`,
    );
  } catch (err) {
    console.error(`❌ Message processing failed for ${from}:`, err.message);
    logMetrics("error", startTime);

    // Send fallback message on critical failure
    await sendFallbackMessage(from);
  }
}

/**
 * Handle new user - send intro message
 *
 * @param {string} userId - WhatsApp number
 * @param {string} agentName - Assigned agent
 * @param {object} context - Agent context
 * @returns {Promise<void>}
 */
async function handleNewUser(userId, agentName, context) {
  try {
    console.log(`🆕 New user detected: ${userId} → ${agentName}`);

    // Get intro message from agent context
    const introMessage =
      context.introMessage || "👋 Hello! Thanks for contacting us.";

    console.log(`📤 Sending intro message: "${introMessage}"`);

    // Send intro message
    await sendMessage(userId, introMessage);

    // Small delay to ensure intro arrives first (WhatsApp delivery order)
    await sleep(500);

    console.log(`✅ Intro message sent to new user ${userId}`);
  } catch (err) {
    console.error(`⚠️ Failed to send intro message to ${userId}:`, err.message);
    // Non-critical - continue processing
  }
}

/**
 * Fraud detection with error handling
 *
 * @param {string} userId - WhatsApp number
 * @param {string} text - Message text
 * @param {string} agentName - Agent name
 * @returns {Promise<object>} Fraud detection result
 */
async function detectFraud(userId, text, agentName) {
  try {
    console.log(`🔍 Running fraud detection for ${userId}`);

    const result = await aiService.checkFraud(userId, text, agentName);

    console.log(
      `🔍 Fraud result: ${result.decision.action} (risk: ${result.risk.risk_level})`,
    );

    return result;
  } catch (err) {
    console.error(`⚠️ Fraud detection failed for ${userId}:`, err.message);

    // Fallback: ALLOW with unknown risk
    return {
      decision: { action: "ALLOW" },
      risk: { risk_level: "unknown" },
    };
  }
}

/**
 * Generate AI reply with error handling
 *
 * @param {string} userId - WhatsApp number
 * @param {string} text - Message text
 * @param {string} agentName - Agent name
 * @returns {Promise<string>} AI-generated reply
 */
async function generateReply(userId, text, agentName) {
  try {
    console.log(`🤖 Generating AI reply for ${userId} using ${agentName}`);

    const reply = await aiService.generateAgentMessage(userId, text, agentName);

    console.log(`🤖 AI reply generated: "${reply.substring(0, 50)}..."`);

    return reply;
  } catch (err) {
    console.error(`⚠️ AI generation failed for ${userId}:`, err.message);

    // Fallback: Generic response
    return "Thanks for your message. We'll get back to you shortly.";
  }
}

/**
 * Send message to WhatsApp with retry logic
 *
 * @param {string} to - WhatsApp number
 * @param {string} message - Message text
 * @returns {Promise<boolean>} Success status
 */
async function sendMessage(to, message) {
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await whatsappService.sendMessage(to, message);
      console.log(`📤 Message sent to ${to} (attempt ${attempt})`);
      return true;
    } catch (err) {
      lastError = err;
      console.error(
        `⚠️ Send failed (attempt ${attempt}/${maxRetries}):`,
        err.message,
      );

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 500; // Exponential backoff
        console.log(`⏳ Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  console.error(`❌ All send attempts failed for ${to}:`, lastError.message);
  return false;
}

/**
 * Send fallback message on critical failure
 *
 * @param {string} to - WhatsApp number
 * @returns {Promise<void>}
 */
async function sendFallbackMessage(to) {
  try {
    const fallbackMsg =
      "We're experiencing technical difficulties. Please try again later.";
    await whatsappService.sendMessage(to, fallbackMsg);
    console.log(`📤 Fallback message sent to ${to}`);
  } catch (err) {
    console.error(`❌ Failed to send fallback message:`, err.message);
  }
}

/**
 * Process multiple messages in batch (if needed)
 *
 * @param {Array<object>} messages - Array of message objects
 * @returns {Promise<Array>} Results
 */
async function processBatch(messages) {
  console.log(`📦 Processing batch of ${messages.length} messages`);

  const results = await Promise.allSettled(
    messages.map((msg) => processMessage(msg)),
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  console.log(`📦 Batch complete: ${succeeded} succeeded, ${failed} failed`);

  return results;
}

/**
 * Log processing metrics
 *
 * @param {string} status - success, error, blocked
 * @param {number} startTime - Processing start time
 */
function logMetrics(status, startTime) {
  const duration = Date.now() - startTime;
  console.log(`📊 Metrics: status=${status}, duration=${duration}ms`);

  // TODO: Send to monitoring service (e.g., Prometheus, DataDog)
}

/**
 * Sleep utility
 *
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Health check
 *
 * @returns {object} Health status
 */
function getHealth() {
  return {
    status: "ok",
    processor: "ready",
  };
}

module.exports = {
  processMessage,
  processBatch,
  handleNewUser,
  detectFraud,
  generateReply,
  sendMessage,
  getHealth,
};
