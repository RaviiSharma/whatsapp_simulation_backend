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
const fraudDetection = require("./fraudDetection.service");
const fraudReport = require("./fraudReport.service");
const sessionWindow = require("./sessionWindow.service");

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

    // STEP 1.5: Update 24-hour session window
    await sessionWindow.updateSessionWindow(from);

    // STEP 2: Check if session exists FIRST (CRITICAL)
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

    // STEP 2.5: Check if user is compromised (NOW agentName is initialized)
    const compromisedStatus = await fraudDetection.isUserCompromised(from);
    if (compromisedStatus) {
      console.log(
        `🚨 User ${from} is flagged as compromised (${compromisedStatus.riskLevel})`,
      );

      // IMMEDIATE ACTION: Block hackerAgent, force riskAgent
      if (agentName === "hackerAgent") {
        console.log(`🛑 STOPPING hackerAgent for compromised user ${from}`);

        // Switch to riskAgent immediately
        agentName = "riskAgent";
        await sessionStore.createSession(from, {
          agentName: "riskAgent",
          assignedAt: new Date().toISOString(),
          lastMessageAt: new Date().toISOString(),
          messageCount: session?.messageCount || 0,
          isNewUser: false,
        });

        // Send security alert and STOP processing
        await sendMessage(
          from,
          "⚠️ Security alert: suspicious activity detected. A security specialist will assist you.",
        );

        console.log(
          `🔄 Switched compromised user to riskAgent - BLOCKING further processing`,
        );
        logMetrics("compromised_blocked", startTime);
        return; // Stop processing immediately
      }

      console.log(
        `ℹ️ Compromised user on ${agentName} - continuing with monitoring`,
      );
    }

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

    // STEP 4: Fraud detection and classification
    const fraudClassification = fraudDetection.classifyMessage(text);

    if (fraudClassification) {
      console.log(
        `🚨 FRAUD DETECTED: ${fraudClassification.riskLevel} - ${from}`,
      );

      // Get protective action based on risk level
      const action = fraudDetection.getProtectiveAction(
        fraudClassification.riskLevel,
        agentName,
      );

      // Store conversation snippet for report
      const conversationSnippet = [text];

      // Create fraud report in MongoDB
      try {
        await fraudReport.createFraudReport({
          phoneNumber: from,
          agent: agentName,
          riskLevel: fraudClassification.riskLevel,
          evidence: fraudClassification.evidence,
          conversationSnippet,
          metadata: {
            detectedAt: new Date(fraudClassification.timestamp),
            messageId,
          },
        });
        console.log(`📝 Fraud report created for ${from}`);
      } catch (err) {
        console.error(`❌ Failed to create fraud report:`, err.message);
      }

      // Mark user as compromised in Redis
      await fraudDetection.markUserCompromised(
        from,
        fraudClassification.riskLevel,
      );

      // Execute protective action
      if (action.action === "SWITCH_AGENT" && action.targetAgent) {
        console.log(
          `🔄 Switching user ${from} from ${agentName} to ${action.targetAgent}`,
        );

        const previousAgent = agentName;
        agentName = action.targetAgent;

        // Update session
        await sessionStore.createSession(from, {
          agentName: action.targetAgent,
          assignedAt: new Date().toISOString(),
          lastMessageAt: new Date().toISOString(),
          messageCount: session?.messageCount || 0,
          isNewUser: false,
          previousAgent,
          switchReason: "fraud_detection",
        });

        // Send warning message
        if (action.message) {
          await sendMessage(from, action.message);
        }

        // CRITICAL FIX: If switching FROM hackerAgent, STOP processing immediately
        // Do NOT generate hackerAgent reply after fraud detection
        if (previousAgent === "hackerAgent") {
          console.log(
            `🛑 BLOCKING hackerAgent reply after fraud detection - switched to ${action.targetAgent}`,
          );
          logMetrics("fraud_blocked_hacker_switched", startTime);
          return; // Exit early - no AI reply
        }
      } else if (action.action === "MONITOR" && action.message) {
        // Send warning but continue (for LOW risk on safe agents)
        await sendMessage(from, action.message);
      }

      // For CRITICAL/HIGH/MEDIUM risk on any sensitive data, block AI generation
      if (
        fraudClassification.riskLevel === "CRITICAL" ||
        fraudClassification.riskLevel === "HIGH" ||
        fraudClassification.riskLevel === "MEDIUM"
      ) {
        console.log(
          `🛑 Blocking AI generation for ${fraudClassification.riskLevel} risk - sensitive data detected`,
        );
        logMetrics("fraud_blocked", startTime);
        return; // Exit early - no AI reply
      }
    }

    // STEP 4.5: Production safety check
    const safetyEnforcement = await fraudDetection.enforceProductionSafety(
      from,
      agentName,
    );
    if (safetyEnforcement.enforced) {
      console.log(
        `🛡️ PRODUCTION SAFETY: Enforcing agent switch to ${safetyEnforcement.targetAgent}`,
      );
      agentName = safetyEnforcement.targetAgent;
      await sessionStore.createSession(from, {
        agentName: safetyEnforcement.targetAgent,
        assignedAt: new Date().toISOString(),
        lastMessageAt: new Date().toISOString(),
        messageCount: 0,
        isNewUser: false,
      });
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
  generateReply,
  sendMessage,
  getHealth,
};
