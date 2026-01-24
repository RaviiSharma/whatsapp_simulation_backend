/**
 * Proactive Messaging Service
 *
 * Handles AI-initiated conversations with WhatsApp users.
 * Uses WhatsApp Message Templates for the first proactive message.
 *
 * IMPORTANT: WhatsApp Business API requires:
 * - Approved message templates for proactive messages
 * - Cannot send free-form text to users who haven't messaged you
 * - Templates must be pre-approved in Meta Business Manager
 */

const agentRouter = require("./agentRouter.service");
const sessionStore = require("./sessionStore.service");
const whatsappService = require("./whatsapp.service");
const aiService = require("./ai.service");
const { isProduction } = require("../config/env");

/**
 * Start a proactive conversation with a phone number
 *
 * Flow:
 * 1. Assign agent to user
 * 2. Send WhatsApp template message (Meta requirement)
 * 3. Store session mapping
 * 4. AI agent can then respond normally within 24h window
 *
 * @param {string} phoneNumber - Full WhatsApp number (e.g., "919102901737")
 * @param {string} preferredAgent - (Optional) Force specific agent, otherwise auto-assign
 * @param {object} templateParams - Template variables
 * @returns {Promise<object>} Result with agentName and messageStatus
 */
async function startConversation(
  phoneNumber,
  preferredAgent = null,
  templateParams = {},
) {
  console.log(`\n🚀 Starting proactive conversation with ${phoneNumber}`);

  try {
    // STEP 1: Check if user already has a session
    const existingSession = await sessionStore.getSession(phoneNumber);

    if (existingSession) {
      console.log(
        `ℹ️ User ${phoneNumber} already has session with ${existingSession.agentName}`,
      );
      return {
        success: false,
        error: "USER_ALREADY_EXISTS",
        message: `User already assigned to ${existingSession.agentName}`,
        agentName: existingSession.agentName,
      };
    }

    // STEP 2: Assign agent (or use preferred)
    let agentName = preferredAgent;

    // PRODUCTION SAFETY: Block hackerAgent in production
    if (isProduction() && agentName === "hackerAgent") {
      console.log("⚠️ PRODUCTION MODE: hackerAgent blocked, using benignAgent");
      agentName = "benignAgent";
    }

    if (!agentName) {
      // Auto-assign based on load balancing
      const agentLoads = await sessionStore.getAllAgentLoads();
      const agents = ["hackerAgent", "benignAgent", "policyAgent", "riskAgent"];

      // Find agent with minimum load
      agentName = agents.reduce((minAgent, agent) => {
        const currentLoad = agentLoads[agent] || 0;
        const minLoad = agentLoads[minAgent] || 0;
        return currentLoad < minLoad ? agent : minAgent;
      }, agents[0]);
    }

    console.log(`🎯 Assigning ${phoneNumber} to ${agentName}`);

    // STEP 3: Create session BEFORE sending message
    // This ensures agent stickiness is established
    await sessionStore.createSession(phoneNumber, {
      agentName,
      assignedAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
      messageCount: 0,
      proactiveStart: true, // Flag that AI started this conversation
    });

    console.log(`✅ Session created for ${phoneNumber} → ${agentName}`);

    // CRITICAL: Verify session was actually saved
    const verifySession = await sessionStore.getSession(phoneNumber);
    if (!verifySession || verifySession.agentName !== agentName) {
      console.error(
        `❌ CRITICAL: Session verification failed! Expected ${agentName}, got ${verifySession?.agentName || "null"}`,
      );
      throw new Error("Session creation verification failed");
    }
    console.log(
      `✅ Session verified: ${phoneNumber} → ${verifySession.agentName}`,
    );

    // STEP 4: Send WhatsApp template message (Meta requirement for proactive)
    const templateResult = await sendTemplateMessage(
      phoneNumber,
      agentName,
      templateParams,
    );

    if (!templateResult.success) {
      console.error(
        `❌ Failed to send template message: ${templateResult.error}`,
      );
      // Clean up session if message failed
      await sessionStore.deleteSession(phoneNumber);

      return {
        success: false,
        error: "TEMPLATE_SEND_FAILED",
        message: templateResult.error,
        agentName,
      };
    }

    console.log(`✅ Proactive conversation started with ${phoneNumber}`);

    // STEP 5: Return success with agent context
    return {
      success: true,
      agentName,
      phoneNumber,
      messageId: templateResult.messageId,
      message: "Proactive conversation initiated successfully",
      nextSteps:
        "User can now reply, and AI will respond within 24h window using free-form messages",
    };
  } catch (err) {
    console.error(
      `❌ Failed to start conversation with ${phoneNumber}:`,
      err.message,
    );

    return {
      success: false,
      error: "SYSTEM_ERROR",
      message: err.message,
    };
  }
}

/**
 * Send WhatsApp Message Template (required for proactive messages)
 *
 * IMPORTANT: You must create and get approval for templates in Meta Business Manager:
 * https://business.facebook.com/wa/manage/message-templates/
 *
 * Template example:
 * Name: "agent_intro"
 * Category: "MARKETING"
 * Language: "en"
 * Body: "Hello! I'm {{1}} from SecureBank. Reply to this message to chat with me."
 *
 * @param {string} phoneNumber - WhatsApp number
 * @param {string} agentName - Assigned agent name
 * @param {object} templateParams - Template parameters
 * @returns {Promise<object>} Send result
 */
async function sendTemplateMessage(
  phoneNumber,
  agentName,
  templateParams = {},
) {
  try {
    // Template configuration
    // You MUST replace these with your actual approved template details
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME || "agent_intro";
    const templateLanguage =
      process.env.WHATSAPP_TEMPLATE_LANGUAGE || "English";

    // Map agent names to friendly names
    const agentFriendlyNames = {
      hackerAgent: "Alex from Security Team",
      benignAgent: "Sarah from Customer Service",
      policyAgent: "Mike from Compliance",
      riskAgent: "Emma from Risk Management",
    };

    const agentDisplayName =
      agentFriendlyNames[agentName] || "Your AI Assistant";

    console.log(`📤 Sending template "${templateName}" to ${phoneNumber}`);

    // Call WhatsApp API with template
    const result = await whatsappService.sendTemplateMessage(phoneNumber, {
      name: templateName,
      language: templateLanguage,
      components: [
        // {
        //   type: "body",
        //   parameters: [
        //     {
        //       type: "text",
        //       text: templateParams.agentName || agentDisplayName,
        //     },
        //   ],
        // },
      ],
    });

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (err) {
    console.error(`❌ Template send failed:`, err.message);

    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Batch start conversations with multiple users
 *
 * Useful for campaigns or onboarding flows
 *
 * @param {Array<string>} phoneNumbers - Array of phone numbers
 * @param {string} preferredAgent - (Optional) Force specific agent
 * @returns {Promise<Array>} Results for each phone number
 */
async function batchStartConversations(phoneNumbers, preferredAgent = null) {
  console.log(
    `\n🚀 Starting batch conversations with ${phoneNumbers.length} users`,
  );

  // PRODUCTION SAFETY: Override hackerAgent in production
  let safeAgent = preferredAgent;
  if (isProduction() && preferredAgent === "hackerAgent") {
    console.log(
      "⚠️ PRODUCTION MODE: hackerAgent blocked, using benignAgent for batch",
    );
    safeAgent = "benignAgent";
  }

  const results = [];
  const delayBetweenMessages = 1000; // 1 second delay to avoid rate limits

  for (const phoneNumber of phoneNumbers) {
    try {
      const result = await startConversation(phoneNumber, safeAgent);
      results.push({
        phoneNumber,
        ...result,
      });

      // Delay to avoid WhatsApp rate limits (80 messages/second)
      await sleep(delayBetweenMessages);
    } catch (err) {
      console.error(
        `❌ Failed to start conversation with ${phoneNumber}:`,
        err.message,
      );
      results.push({
        phoneNumber,
        success: false,
        error: err.message,
      });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  console.log(
    `✅ Batch complete: ${successCount}/${phoneNumbers.length} successful`,
  );

  return results;
}

/**
 * Check if a phone number is eligible for proactive messaging
 *
 * @param {string} phoneNumber - WhatsApp number
 * @returns {Promise<object>} Eligibility status
 */
async function checkEligibility(phoneNumber) {
  try {
    // Check if user already has session
    const session = await sessionStore.getSession(phoneNumber);

    if (session) {
      return {
        eligible: false,
        reason: "User already has active session",
        agentName: session.agentName,
      };
    }

    // Check if phone number is valid format
    if (!phoneNumber.match(/^[1-9]\d{10,14}$/)) {
      return {
        eligible: false,
        reason: "Invalid phone number format",
      };
    }

    return {
      eligible: true,
      reason: "User can receive proactive message",
    };
  } catch (err) {
    return {
      eligible: false,
      reason: `Error checking eligibility: ${err.message}`,
    };
  }
}

/**
 * Get proactive conversation statistics
 *
 * @returns {Promise<object>} Stats
 */
async function getProactiveStats() {
  try {
    const allSessions = await sessionStore.getAllSessions();

    const proactiveSessions = allSessions.filter(
      (s) => s.proactiveStart === true,
    );

    return {
      totalProactiveConversations: proactiveSessions.length,
      byAgent: proactiveSessions.reduce((acc, s) => {
        acc[s.agentName] = (acc[s.agentName] || 0) + 1;
        return acc;
      }, {}),
    };
  } catch (err) {
    console.error(`❌ Failed to get proactive stats:`, err.message);
    return {
      error: err.message,
    };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  startConversation,
  batchStartConversations,
  checkEligibility,
  getProactiveStats,
  sendTemplateMessage,
};
