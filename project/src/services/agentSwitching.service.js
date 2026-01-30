/**
 * Agent Switching Service - Production Grade
 *
 * Handles agent transitions with:
 * - History tracking
 * - Previous agent persistence
 * - Switch reason recording
 * - AI generation blocking for HIGH risk
 * - Session updates
 */

const chatHistory = require("./chatHistory.service");
const sessionStore = require("./sessionStore.service");
const mongodb = require("../config/mongodb");

// ============================================
// AGENT SWITCHING LOGIC
// ============================================

/**
 * Switch agent for a conversation
 *
 * @param {object} params - Switch parameters
 * @returns {Promise<object>} Switch result
 */
async function switchAgent({
  campaignId,
  phoneNumber,
  currentAgent,
  newAgent,
  reason,
  metadata = {},
}) {
  try {
    console.log(
      `🔄 Switching agent: ${currentAgent} → ${newAgent} (${reason})`,
    );

    // Validate agents
    if (currentAgent === newAgent) {
      console.log(`ℹ️ Agent already set to ${newAgent}, skipping switch`);
      return { switched: false, reason: "ALREADY_SET" };
    }

    // Record switch in chat history
    await chatHistory.recordAgentSwitch({
      campaignId,
      phoneNumber,
      fromAgent: currentAgent,
      toAgent: newAgent,
      reason,
      metadata: {
        ...metadata,
        timestamp: new Date(),
      },
    });

    // Update session store
    const sessionKey = `session:${phoneNumber}`;
    await sessionStore.setAgentName(sessionKey, newAgent);

    // Update campaign_users
    const db = await mongodb.getDatabase();
    await db.collection("campaign_users").updateOne(
      { campaignId, phoneNumber },
      {
        $set: {
          agentName: newAgent,
          previousAgent: currentAgent,
          lastAgentSwitch: {
            from: currentAgent,
            to: newAgent,
            reason,
            timestamp: new Date(),
          },
        },
      },
    );

    console.log(`✅ Agent switched successfully: ${phoneNumber} → ${newAgent}`);

    return {
      switched: true,
      from: currentAgent,
      to: newAgent,
      reason,
      timestamp: new Date(),
    };
  } catch (err) {
    console.error(`❌ Agent switching failed:`, err.message);
    throw err;
  }
}

/**
 * Check if AI generation should be blocked
 *
 * @param {string} campaignId - Campaign ID
 * @param {string} phoneNumber - Phone number
 * @returns {Promise<boolean>} True if AI should be blocked
 */
async function shouldBlockAIGeneration(campaignId, phoneNumber) {
  try {
    // Get conversation fraud status
    const conversation = await chatHistory.getConversation(
      campaignId,
      phoneNumber,
    );

    if (!conversation) {
      return false;
    }

    // Block AI if HIGH risk or user is blocked
    if (
      conversation.fraud.riskLevel === "high" ||
      conversation.fraud.blockedUser
    ) {
      console.log(`🚫 AI generation blocked for ${phoneNumber} (HIGH RISK)`);
      return true;
    }

    return false;
  } catch (err) {
    console.error(`❌ Failed to check AI block status:`, err.message);
    return false; // Fail open (allow AI by default)
  }
}

/**
 * Get agent history for a user
 *
 * @param {string} campaignId - Campaign ID
 * @param {string} phoneNumber - Phone number
 * @returns {Promise<Array>} Agent history
 */
async function getAgentHistory(campaignId, phoneNumber) {
  try {
    const conversation = await chatHistory.getConversation(
      campaignId,
      phoneNumber,
    );

    if (!conversation) {
      return [];
    }

    return conversation.agentHistory || [];
  } catch (err) {
    console.error(`❌ Failed to get agent history:`, err.message);
    throw err;
  }
}

/**
 * Determine if agent should be switched based on fraud level
 *
 * @param {string} riskLevel - Risk level (low, medium, high)
 * @param {string} currentAgent - Current agent name
 * @returns {object} Switch recommendation
 */
function getSwitchRecommendation(riskLevel, currentAgent) {
  switch (riskLevel) {
    case "high":
      // Always switch to riskAgent for HIGH risk
      return {
        shouldSwitch: currentAgent !== "riskAgent",
        newAgent: "riskAgent",
        reason: "HIGH_RISK_FRAUD_DETECTED",
        blockAI: true,
      };

    case "medium":
      // Switch to riskAgent for MEDIUM risk
      return {
        shouldSwitch: currentAgent !== "riskAgent",
        newAgent: "riskAgent",
        reason: "MEDIUM_RISK_FRAUD_DETECTED",
        blockAI: false,
      };

    case "low":
    default:
      // No switch needed for LOW risk
      return {
        shouldSwitch: false,
        newAgent: currentAgent,
        reason: "LOW_RISK",
        blockAI: false,
      };
  }
}

/**
 * Auto-switch agent based on fraud detection
 *
 * @param {object} params - Auto-switch parameters
 * @returns {Promise<object>} Switch result
 */
async function autoSwitchOnFraud({
  campaignId,
  phoneNumber,
  currentAgent,
  fraudAnalysis,
  messageId,
}) {
  try {
    const recommendation = getSwitchRecommendation(
      fraudAnalysis.riskLevel,
      currentAgent,
    );

    if (!recommendation.shouldSwitch) {
      return {
        switched: false,
        reason: "NO_SWITCH_NEEDED",
        blockAI: recommendation.blockAI,
      };
    }

    // Perform switch
    const switchResult = await switchAgent({
      campaignId,
      phoneNumber,
      currentAgent,
      newAgent: recommendation.newAgent,
      reason: recommendation.reason,
      metadata: {
        fraudDetected: true,
        riskLevel: fraudAnalysis.riskLevel,
        confidence: fraudAnalysis.confidence,
        reasons: fraudAnalysis.reasons,
        messageId,
      },
    });

    return {
      ...switchResult,
      blockAI: recommendation.blockAI,
    };
  } catch (err) {
    console.error(`❌ Auto-switch failed:`, err.message);
    throw err;
  }
}

/**
 * Bulk agent switching (for campaign updates)
 *
 * @param {Array} switches - Array of switch operations
 * @returns {Promise<object>} Bulk switch result
 */
async function bulkSwitchAgents(switches) {
  const results = {
    total: switches.length,
    succeeded: 0,
    failed: 0,
    errors: [],
  };

  for (const sw of switches) {
    try {
      await switchAgent(sw);
      results.succeeded++;
    } catch (err) {
      results.failed++;
      results.errors.push({
        phoneNumber: sw.phoneNumber,
        error: err.message,
      });
    }
  }

  return results;
}

// ============================================
// AGENT VALIDATION
// ============================================

const VALID_AGENTS = ["hackerAgent", "policyAgent", "riskAgent", "benignAgent"];

/**
 * Validate agent name
 */
function isValidAgent(agentName) {
  return VALID_AGENTS.includes(agentName);
}

/**
 * Get default agent for a user (based on rules)
 */
function getDefaultAgent() {
  return "benignAgent"; // Safe default
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  switchAgent,
  shouldBlockAIGeneration,
  getAgentHistory,
  getSwitchRecommendation,
  autoSwitchOnFraud,
  bulkSwitchAgents,
  isValidAgent,
  getDefaultAgent,
  VALID_AGENTS,
};
