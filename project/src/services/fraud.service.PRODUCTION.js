/**
 * Fraud Detection Service - Production Grade
 *
 * Features:
 * - Confidence scoring (0-1 scale)
 * - Risk levels: LOW, MEDIUM, HIGH
 * - Context-aware detection (requires patterns + context)
 * - Threshold-based actions
 * - Multiple detection patterns
 *
 * Thresholds:
 * - LOW: 0 - 0.39 (continue normally)
 * - MEDIUM: 0.4 - 0.69 (switch to riskAgent)
 * - HIGH: 0.7+ (block + notify admin)
 */

const chatHistory = require("./chatHistory.service");
const agentSwitching = require("./agentSwitching.service");

// ============================================
// DETECTION PATTERNS
// ============================================

const FRAUD_PATTERNS = {
  otp: {
    patterns: [
      /(?:otp|code|pin)[\s:]*(\d{4,8})/i,
      /verification code[\s:]*(\d{4,8})/i,
      /(\d{6})\s*(?:is your|verification)/i,
    ],
    baseScore: 0.5,
    requiresContext: true,
    contextKeywords: ["verify", "confirm", "authenticate", "security", "login"],
    name: "OTP_SHARING",
  },

  cardNumber: {
    patterns: [
      /\b(?:\d{4}[\s-]?){3}\d{4}\b/, // 16-digit card
      /\b(?:\d{4}[\s-]?){2}\d{4}\b/, // 12-digit card
    ],
    baseScore: 0.8,
    requiresContext: false, // Card numbers are always high risk
    name: "CARD_NUMBER",
  },

  cvv: {
    patterns: [
      /\bcvv[\s:]*(\d{3,4})/i,
      /\bcvc[\s:]*(\d{3,4})/i,
      /security code[\s:]*(\d{3,4})/i,
    ],
    baseScore: 0.9,
    requiresContext: false,
    name: "CVV_SHARING",
  },

  expiryDate: {
    patterns: [
      /expiry[\s:]*(\d{2}\/\d{2,4})/i,
      /valid till[\s:]*(\d{2}\/\d{2,4})/i,
      /\b(0[1-9]|1[0-2])\/\d{2,4}\b/,
    ],
    baseScore: 0.6,
    requiresContext: true,
    contextKeywords: ["card", "credit", "debit", "payment"],
    name: "EXPIRY_DATE",
  },

  phishingLink: {
    patterns: [
      /https?:\/\/(?:bit\.ly|tinyurl|short\.link|t\.co)/i,
      /https?:\/\/[^\s]+\.(?:xyz|tk|ml|ga|cf)/i,
      /click here|verify now|urgent action/i,
    ],
    baseScore: 0.7,
    requiresContext: false,
    name: "PHISHING_LINK",
  },

  accountDetails: {
    patterns: [
      /account\s*(?:number|no)[\s:]*(\d{8,18})/i,
      /bank\s*account[\s:]*(\d{8,18})/i,
      /routing\s*number[\s:]*(\d{9})/i,
      /ifsc[\s:]*([A-Z]{4}0[A-Z0-9]{6})/i,
    ],
    baseScore: 0.75,
    requiresContext: true,
    contextKeywords: ["transfer", "payment", "bank", "account"],
    name: "ACCOUNT_DETAILS",
  },

  password: {
    patterns: [/password[\s:]*([^\s]+)/i, /my password is[\s:]*([^\s]+)/i],
    baseScore: 0.85,
    requiresContext: false,
    name: "PASSWORD_SHARING",
  },

  urgentScam: {
    patterns: [
      /urgent|immediately|within \d+ hours/i,
      /account (?:suspended|blocked|locked)/i,
      /verify your (?:account|identity)/i,
    ],
    baseScore: 0.4,
    requiresContext: true,
    contextKeywords: ["click", "link", "verify", "suspend"],
    name: "URGENT_SCAM",
  },
};

// ============================================
// CONFIDENCE SCORING
// ============================================

/**
 * Calculate fraud confidence score
 *
 * @param {string} text - Message text
 * @param {Array} chatHistory - Previous messages for context
 * @returns {object} Fraud analysis
 */
function calculateFraudConfidence(text, chatHistory = []) {
  const detections = [];
  let maxConfidence = 0;
  const reasons = [];

  // Check each pattern
  for (const [type, config] of Object.entries(FRAUD_PATTERNS)) {
    for (const pattern of config.patterns) {
      if (pattern.test(text)) {
        let confidence = config.baseScore;

        // Context validation
        if (config.requiresContext) {
          const hasContext = hasRequiredContext(
            text,
            chatHistory,
            config.contextKeywords,
          );

          if (!hasContext) {
            confidence *= 0.5; // Reduce score if context missing
          }
        }

        // Store detection
        detections.push({
          type: config.name,
          confidence,
          pattern: pattern.toString(),
          requiresContext: config.requiresContext,
        });

        reasons.push(config.name);
        maxConfidence = Math.max(maxConfidence, confidence);
      }
    }
  }

  // Boost confidence if multiple patterns detected
  if (detections.length > 1) {
    maxConfidence = Math.min(1.0, maxConfidence * 1.2);
  }

  // Determine risk level
  const riskLevel = getRiskLevel(maxConfidence);

  return {
    fraudDetected: maxConfidence >= 0.4, // MEDIUM threshold
    confidence: Math.round(maxConfidence * 100) / 100,
    riskLevel,
    reasons: [...new Set(reasons)], // Deduplicate
    detections,
    action: getRecommendedAction(riskLevel),
  };
}

/**
 * Check if required context exists
 */
function hasRequiredContext(text, chatHistory, keywords) {
  // Check current message
  const textLower = text.toLowerCase();
  if (keywords.some((kw) => textLower.includes(kw))) {
    return true;
  }

  // Check last 3 messages for context
  const recentMessages = chatHistory.slice(-3);
  for (const msg of recentMessages) {
    const msgLower = (msg.text || "").toLowerCase();
    if (keywords.some((kw) => msgLower.includes(kw))) {
      return true;
    }
  }

  return false;
}

/**
 * Determine risk level from confidence
 */
function getRiskLevel(confidence) {
  if (confidence >= 0.7) return "high";
  if (confidence >= 0.4) return "medium";
  return "low";
}

/**
 * Get recommended action based on risk level
 */
function getRecommendedAction(riskLevel) {
  switch (riskLevel) {
    case "high":
      return "BLOCK_AND_NOTIFY";
    case "medium":
      return "SWITCH_TO_RISK_AGENT";
    case "low":
    default:
      return "CONTINUE";
  }
}

// ============================================
// FRAUD DETECTION ORCHESTRATION
// ============================================

/**
 * Main fraud detection function
 *
 * @param {object} params - Detection parameters
 * @returns {Promise<object>} Fraud analysis result
 */
async function detectFraud({
  campaignId,
  phoneNumber,
  messageId,
  text,
  currentAgent,
}) {
  try {
    console.log(`🔍 Running fraud detection: ${phoneNumber}`);

    // Get conversation history for context
    const lastMessages = await chatHistory.getLastMessages(
      campaignId,
      phoneNumber,
      10,
    );

    // Calculate fraud confidence
    const analysis = calculateFraudConfidence(text, lastMessages);

    // Store fraud status in message
    if (analysis.fraudDetected) {
      await chatHistory.updateMessageFraudStatus({
        campaignId,
        phoneNumber,
        messageId,
        fraudDetected: true,
        riskLevel: analysis.riskLevel,
        confidence: analysis.confidence,
        reasons: analysis.reasons,
      });

      console.log(
        `🚨 Fraud detected: ${analysis.riskLevel.toUpperCase()} (confidence: ${analysis.confidence})`,
      );
    }

    // Execute recommended action
    const actionResult = await executeAction({
      campaignId,
      phoneNumber,
      messageId,
      analysis,
      currentAgent,
    });

    return {
      ...analysis,
      actionTaken: actionResult.action,
      success: true,
    };
  } catch (err) {
    console.error(`❌ Fraud detection failed:`, err.message);
    return {
      fraudDetected: false,
      confidence: 0,
      riskLevel: "low",
      reasons: [],
      action: "CONTINUE",
      error: err.message,
    };
  }
}

/**
 * Execute recommended action based on risk level
 */
async function executeAction({
  campaignId,
  phoneNumber,
  messageId,
  analysis,
  currentAgent,
}) {
  try {
    switch (analysis.action) {
      case "BLOCK_AND_NOTIFY":
        // Mark conversation as high-risk fraud
        await chatHistory.markConversationFraud(campaignId, phoneNumber, {
          riskLevel: "high",
          confidence: analysis.confidence,
          reasons: analysis.reasons,
          blockedUser: true,
        });

        // Switch to riskAgent (no AI generation for HIGH risk)
        await agentSwitching.switchAgent({
          campaignId,
          phoneNumber,
          currentAgent,
          newAgent: "riskAgent",
          reason: "HIGH_RISK_FRAUD_DETECTED",
          metadata: {
            confidence: analysis.confidence,
            detections: analysis.reasons,
            messageId,
          },
        });

        // TODO: Send admin notification
        console.log(`🚫 BLOCKED USER: ${phoneNumber} (HIGH RISK)`);

        return {
          action: "BLOCK_AND_NOTIFY",
          blocked: true,
          agentSwitched: true,
          newAgent: "riskAgent",
        };

      case "SWITCH_TO_RISK_AGENT":
        // Mark conversation as medium-risk fraud
        await chatHistory.markConversationFraud(campaignId, phoneNumber, {
          riskLevel: "medium",
          confidence: analysis.confidence,
          reasons: analysis.reasons,
          blockedUser: false,
        });

        // Switch to riskAgent
        const switchResult = await agentSwitching.switchAgent({
          campaignId,
          phoneNumber,
          currentAgent,
          newAgent: "riskAgent",
          reason: "MEDIUM_RISK_FRAUD_DETECTED",
          metadata: {
            confidence: analysis.confidence,
            detections: analysis.reasons,
            messageId,
          },
        });

        console.log(`⚠️ Switched to riskAgent: ${phoneNumber} (MEDIUM RISK)`);

        return {
          action: "SWITCH_TO_RISK_AGENT",
          blocked: false,
          agentSwitched: switchResult.switched,
          newAgent: "riskAgent",
        };

      case "CONTINUE":
      default:
        console.log(`✅ Low risk, continuing normally: ${phoneNumber}`);
        return {
          action: "CONTINUE",
          blocked: false,
          agentSwitched: false,
        };
    }
  } catch (err) {
    console.error(`❌ Action execution failed:`, err.message);
    throw err;
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Bulk fraud scan for multiple messages
 */
async function bulkFraudScan(messages) {
  const results = [];

  for (const msg of messages) {
    const analysis = calculateFraudConfidence(msg.text, msg.history || []);
    results.push({
      messageId: msg.messageId,
      phoneNumber: msg.phoneNumber,
      ...analysis,
    });
  }

  return results;
}

/**
 * Get fraud statistics for a campaign
 */
async function getCampaignFraudStats(campaignId) {
  try {
    const mongodb = require("../config/mongodb");
    const db = await mongodb.getDatabase();

    const stats = await db
      .collection("conversations")
      .aggregate([
        { $match: { campaignId } },
        {
          $group: {
            _id: "$fraud.riskLevel",
            count: { $sum: 1 },
            avgConfidence: { $avg: "$fraud.confidence" },
          },
        },
      ])
      .toArray();

    return stats;
  } catch (err) {
    console.error(`❌ Failed to get fraud stats:`, err.message);
    throw err;
  }
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  detectFraud,
  calculateFraudConfidence,
  bulkFraudScan,
  getCampaignFraudStats,
  getRiskLevel,
  getRecommendedAction,
};
