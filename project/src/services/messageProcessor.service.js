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
const chatHistory = require("./chatHistory.service");

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

    // STEP 2.3: Store inbound message to MongoDB chat history
    let campaignId = session?.campaignId || null;
    // Normalize campaignId: treat 'direct' or empty string as null
    if (campaignId === "direct" || campaignId === "") {
      campaignId = null;
    }
    const campaignName = session?.campaignName || null;

    try {
      await chatHistory.storeInboundMessage({
        campaignId,
        phoneNumber: from,
        messageId,
        text,
        timestamp: new Date(),
        agentName,
        metadata: {
          campaignName,
          fraudFlag: false,
          riskLevel: "low",
          fraudReasons: [],
          fraudConfidence: 0.0,
          proactive: false,
          isNewUser,
          messageNumber: session?.messageCount || 1,
          sessionStartedAt: session?.assignedAt
            ? new Date(session.assignedAt)
            : new Date(),
        },
      });
      console.log(`💾 Inbound message stored to chat history`);
    } catch (err) {
      console.error(`⚠️ Failed to store inbound message:`, err.message);
      // Don't fail processing if chat history storage fails
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

    // STEP 4: AI-based fraud detection (intelligent context-aware)
    // Call AI fraud detection API to analyze message in context
    console.log(`🔍 Running AI fraud detection for: "${text}"`);
    const fraudDetectionStartTime = Date.now(); // Track detection latency
    let fraudClassification = null;

    try {
      const aiFraudCheck = await aiService.checkFraud(from, text, agentName);

      // Extract risk level from AI response
      const aiRiskLevel = aiFraudCheck?.risk?.risk_level?.toLowerCase();

      // IMPORTANT: Verify current message actually contains sensitive data
      // Don't rely solely on AI state - check pattern in current message too
      const patternDetection = fraudDetection.classifyMessage(text);
      const hasSensitiveData = patternDetection !== null;

      // Only process if AI detected fraud AND current message has sensitive data
      // This prevents false positives from AI session state
      if (
        (aiRiskLevel === "critical" ||
          aiRiskLevel === "high" ||
          aiRiskLevel === "medium") &&
        hasSensitiveData
      ) {
        console.log(`🚨 AI FRAUD DETECTED: ${aiRiskLevel} risk - ${from}`);
        console.log(`✅ Verified: Current message contains sensitive data`);

        fraudClassification = {
          riskLevel: aiRiskLevel.toUpperCase(),
          evidence: patternDetection.evidence || {
            description:
              aiFraudCheck?.risk?.reasons?.join(", ") ||
              "AI detected suspicious behavior",
          },
          timestamp: new Date().toISOString(),
          aiDetected: true,
          detectionSource: "ai_fraud_engine",
          detectionLatencyMs: Date.now() - fraudDetectionStartTime,
          activeAgentAtDetection: agentName, // Agent active when fraud was detected
          actionsTaken: [], // Will be populated as actions are taken
        };
      } else if (
        aiRiskLevel === "critical" ||
        aiRiskLevel === "high" ||
        aiRiskLevel === "medium"
      ) {
        // AI flagged but no sensitive data in current message
        console.log(
          `⚠️ AI flagged ${aiRiskLevel} risk but no sensitive data in current message: "${text}"`,
        );
        console.log(`✅ Ignoring AI false positive - continuing normally`);
      } else {
        console.log(
          `✅ AI fraud check passed - ${aiRiskLevel || "low"} risk (no action needed)`,
        );
      }
    } catch (err) {
      console.error(
        `⚠️ AI fraud detection failed, falling back to pattern-based:`,
        err.message,
      );
      // Fallback to pattern-based only if AI fails
      fraudClassification = fraudDetection.classifyMessage(text);
      if (fraudClassification) {
        fraudClassification.detectionSource = "pattern_matching";
        fraudClassification.detectionLatencyMs =
          Date.now() - fraudDetectionStartTime;
        fraudClassification.activeAgentAtDetection = agentName;
        fraudClassification.actionsTaken = [];
      }
    }

    if (fraudClassification) {
      console.log(
        `🚨 FRAUD CONFIRMED: ${fraudClassification.riskLevel} - ${from}`,
      );

      // Get protective action based on risk level
      const action = fraudDetection.getProtectiveAction(
        fraudClassification.riskLevel,
        agentName,
      );

      // Store conversation snippet for report (MASKED)
      const conversationSnippet = [
        text
          .replace(/\b\d{6}\b/g, "****") // Mask OTP
          .replace(/\b\d{16}\b/g, "****-****-****-****") // Mask card
          .replace(/\b\d{3}\b/g, "***"), // Mask CVV
      ];

      // Create fraud report in MongoDB
      try {
        await fraudReport.createFraudReport({
          phoneNumber: from,
          agent: fraudClassification.activeAgentAtDetection || agentName,
          riskLevel: fraudClassification.riskLevel,
          evidence: fraudClassification.evidence,
          conversationSnippet,
          metadata: {
            detectedAt: new Date(fraudClassification.timestamp),
            messageId,
            detectionLatencyMs: fraudClassification.detectionLatencyMs || null,
            detectionSource: fraudClassification.detectionSource || "unknown",
          },
        });
        console.log(`📝 Fraud report created for ${from}`);
      } catch (err) {
        console.error(`❌ Failed to create fraud report:`, err.message);
      }

      // Update fraud status in chat history (message-level)
      try {
        await chatHistory.updateMessageFraudStatus(messageId, {
          fraudDetected: true,
          riskLevel: fraudClassification.riskLevel,
          reasons: fraudClassification.evidence,
          confidence: 0.85,
        });
        console.log(`💾 Updated message fraud status in chat history`);
      } catch (err) {
        console.error(`⚠️ Failed to update message fraud status:`, err.message);
      }

      // Mark conversation as fraud (conversation-level)
      try {
        await chatHistory.markConversationFraud(campaignId, from, {
          riskLevel: fraudClassification.riskLevel,
          confidence: 0.85,
          reasons: fraudClassification.evidence,
          blockedUser:
            fraudClassification.riskLevel === "CRITICAL" ||
            fraudClassification.riskLevel === "HIGH",
        });
        console.log(`🚨 Marked conversation as fraud for ${from}`);
      } catch (err) {
        console.error(`⚠️ Failed to mark conversation fraud:`, err.message);
      }

      // Mark user as compromised in Redis
      await fraudDetection.markUserCompromised(
        from,
        fraudClassification.riskLevel,
      );

      // Track action: User marked as compromised
      const actionsTaken = [];
      actionsTaken.push({
        action: "user_marked_compromised",
        riskLevel: fraudClassification.riskLevel,
        timestamp: new Date(),
      });

      // Execute protective action
      if (action.action === "SWITCH_AGENT" && action.targetAgent) {
        console.log(
          `🔄 Switching user ${from} from ${agentName} to ${action.targetAgent}`,
        );

        const previousAgent = agentName;
        const switchedAt = new Date();
        agentName = action.targetAgent;

        // Track action: Agent switched
        actionsTaken.push({
          action: "agent_switched",
          fromAgent: previousAgent,
          toAgent: action.targetAgent,
          reason: "fraud_detection",
          timestamp: switchedAt,
        });

        // Update session
        await sessionStore.createSession(from, {
          agentName: action.targetAgent,
          assignedAt: switchedAt.toISOString(),
          lastMessageAt: switchedAt.toISOString(),
          messageCount: session?.messageCount || 0,
          isNewUser: false,
          previousAgent,
          switchReason: "fraud_detection",
        });

        // Track action: Conversation restricted
        if (
          fraudClassification.riskLevel === "CRITICAL" ||
          fraudClassification.riskLevel === "HIGH"
        ) {
          actionsTaken.push({
            action: "conversation_restricted",
            restrictionLevel: fraudClassification.riskLevel,
            timestamp: new Date(),
          });
        }

        // Update fraud report with agent switch info
        try {
          await fraudReport.updateFraudReportAgentSwitch(from, {
            previousAgent,
            newAgent: action.targetAgent,
            switchedAt,
            actions: actionsTaken,
          });
          console.log(`📝 Updated fraud report with agent switch info`);
        } catch (err) {
          console.error(`⚠️ Failed to update fraud report:`, err.message);
        }

        // Send warning message
        if (action.message) {
          await sendMessage(from, action.message);
        }

        // IMPORTANT: Agent is now switched to riskAgent
        // Continue processing so riskAgent can respond
        console.log(
          `✅ Agent switched from ${previousAgent} to ${action.targetAgent} - continuing with ${action.targetAgent} reply`,
        );
      } else if (action.action === "MONITOR" && action.message) {
        // Send warning but continue (for LOW risk on safe agents)
        await sendMessage(from, action.message);

        // Track action: User monitoring activated
        const actionsTaken = [
          {
            action: "monitoring_activated",
            monitoringLevel: fraudClassification.riskLevel,
            warningMessage: action.message,
            timestamp: new Date(),
          },
        ];

        // Update fraud report with monitoring action
        try {
          await fraudReport.updateFraudReportActions(from, actionsTaken);
        } catch (err) {
          console.error(`⚠️ Failed to update fraud report:`, err.message);
        }
      }

      // Block AI generation ONLY if still on hackerAgent after fraud detection
      // Allow riskAgent to respond even during fraud scenarios
      if (
        (fraudClassification.riskLevel === "CRITICAL" ||
          fraudClassification.riskLevel === "HIGH" ||
          fraudClassification.riskLevel === "MEDIUM") &&
        agentName === "hackerAgent"
      ) {
        console.log(
          `🛑 Blocking hackerAgent for ${fraudClassification.riskLevel} risk - should have been switched`,
        );
        logMetrics("fraud_blocked_hacker_not_switched", startTime);
        return; // Exit early - safety check
      }

      // If we reach here with riskAgent, allow them to handle the fraud scenario
      if (fraudClassification && agentName === "riskAgent") {
        console.log(
          `✅ riskAgent handling ${fraudClassification.riskLevel} risk scenario`,
        );
      }
    }

    // STEP 5: Generate reply from assigned AGENT (not fraud detection)
    console.log(`🧠 Generating reply using ${agentName}`);
    const aiReply = await generateReply(from, text, agentName);

    console.log(
      `✅ Generated ${agentName} reply: "${aiReply.substring(0, 50)}..."`,
    );

    // STEP 6: Send reply to WhatsApp
    const sentResult = await sendMessage(from, aiReply);
    const outboundMessageId = sentResult?.messageId || `msg_${Date.now()}`;

    // STEP 6.5: Store outbound message to MongoDB chat history
    try {
      await chatHistory.storeOutboundMessage({
        campaignId,
        phoneNumber: from,
        messageId: outboundMessageId,
        text: aiReply,
        timestamp: new Date(),
        agentName,
        metadata: {
          campaignName,
          fraudFlag: false,
          riskLevel: "low",
          proactive: false,
          aiMetadata: {
            model: "gpt-4",
            tokensUsed: aiReply.length, // Approximate
            latencyMs: Date.now() - startTime,
            context: `${agentName}_context`,
          },
          isNewUser: false,
          messageNumber: (session?.messageCount || 1) + 1,
          sessionStartedAt: session?.assignedAt
            ? new Date(session.assignedAt)
            : new Date(),
        },
      });
      console.log(`💾 Outbound message stored to chat history`);
    } catch (err) {
      console.error(`⚠️ Failed to store outbound message:`, err.message);
      // Don't fail processing if chat history storage fails
    }

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
