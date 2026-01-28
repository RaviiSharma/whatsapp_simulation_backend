/**
 * Fraud Detection Service
 *
 * Detects sensitive data in messages (OTP, credit cards, links)
 * Classifies risk levels and triggers protective actions
 * Stores fraud reports in MongoDB and marks users as compromised in Redis
 */

const redis = require("../config/redis");
const { isProduction } = require("../config/env");

/**
 * Sensitive Data Patterns
 *
 * CRITICAL: These patterns must be precise to avoid false positives
 */
const PATTERNS = {
  // OTP: 4-8 consecutive digits (stricter to avoid false positives like "hi")
  OTP: /\b\d{4,8}\b/g,

  // Credit Card: 16 digits (with optional spaces/dashes)
  CARD: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,

  // Links: http/https URLs only
  LINK: /https?:\/\/[^\s]+/gi,
};

/**
 * Risk Level Thresholds
 */
const RISK_LEVELS = {
  CRITICAL: "CRITICAL", // Card + OTP
  HIGH: "HIGH", // Card OR OTP + Link
  MEDIUM: "MEDIUM", // OTP OR Card (single)
  LOW: "LOW", // Link only
};

/**
 * Analyze message for sensitive data
 *
 * @param {string} text - Message text to analyze
 * @returns {object} Detection results
 */
function detectSensitiveData(text) {
  if (!text || typeof text !== "string") {
    return {
      hasOTP: false,
      hasCard: false,
      hasLink: false,
      hasSensitiveData: false,
      otpMatches: [],
      cardMatches: [],
      linkMatches: [],
    };
  }

  const otpMatches = text.match(PATTERNS.OTP) || [];
  const cardMatches = text.match(PATTERNS.CARD) || [];
  const linkMatches = text.match(PATTERNS.LINK) || [];

  const hasOTP = otpMatches.length > 0;
  const hasCard = cardMatches.length > 0;
  const hasLink = linkMatches.length > 0;

  return {
    hasOTP,
    hasCard,
    hasLink,
    hasSensitiveData: hasOTP || hasCard || hasLink,
    otpMatches,
    cardMatches,
    linkMatches,
  };
}

/**
 * Calculate risk level based on detected data
 *
 * @param {object} detection - Detection results
 * @returns {string} Risk level
 */
function calculateRiskLevel(detection) {
  const { hasOTP, hasCard, hasLink } = detection;

  // CRITICAL: Both card AND OTP (full compromise)
  if (hasCard && hasOTP) {
    return RISK_LEVELS.CRITICAL;
  }

  // HIGH: Card/OTP with phishing link
  if ((hasCard || hasOTP) && hasLink) {
    return RISK_LEVELS.HIGH;
  }

  // MEDIUM: Card OR OTP alone
  if (hasCard || hasOTP) {
    return RISK_LEVELS.MEDIUM;
  }

  // LOW: Only suspicious link
  if (hasLink) {
    return RISK_LEVELS.LOW;
  }

  return null; // No risk
}

/**
 * Mask sensitive data for storage (last 2 digits only)
 *
 * @param {string} value - Sensitive value
 * @returns {string} Masked value
 */
function maskSensitiveData(value) {
  if (!value || value.length < 2) return "**";

  const last2 = value.slice(-2);
  return "*".repeat(value.length - 2) + last2;
}

/**
 * Check if message contains sensitive data and classify risk
 *
 * @param {string} text - Message text
 * @returns {object|null} Fraud classification or null if safe
 */
function classifyMessage(text) {
  const detection = detectSensitiveData(text);

  // CRITICAL: Return null if NO sensitive data found
  // This prevents false positives on normal messages like "hi", "hello", etc.
  if (!detection.hasSensitiveData) {
    return null;
  }

  const riskLevel = calculateRiskLevel(detection);

  // No sensitive data detected (double check)
  if (!riskLevel) {
    return null;
  }

  // Build evidence object with MASKED data
  const evidence = {
    otp: detection.hasOTP ? maskSensitiveData(detection.otpMatches[0]) : null,
    card: detection.hasCard
      ? maskSensitiveData(detection.cardMatches[0].replace(/[\s-]/g, ""))
      : null,
    clickedLink: detection.hasLink,
    linkCount: detection.linkMatches.length,
  };

  return {
    riskLevel,
    evidence,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Mark user as compromised in Redis
 *
 * @param {string} phoneNumber - User's phone number
 * @param {string} riskLevel - Risk level
 * @returns {Promise<void>}
 */
async function markUserCompromised(phoneNumber, riskLevel) {
  try {
    const key = `compromised:${phoneNumber}`;
    const data = {
      flaggedAt: new Date().toISOString(),
      riskLevel,
      status: "active",
    };

    // Store in Redis with 30-day TTL (configurable)
    const ttl = 30 * 24 * 60 * 60; // 30 days
    await redis.set(key, data, ttl);

    console.log(`🚨 User ${phoneNumber} marked as compromised (${riskLevel})`);
  } catch (err) {
    console.error(
      `❌ Failed to mark user as compromised ${phoneNumber}:`,
      err.message,
    );
  }
}

/**
 * Check if user is compromised
 *
 * @param {string} phoneNumber - User's phone number
 * @returns {Promise<object|null>} Compromise data or null
 */
async function isUserCompromised(phoneNumber) {
  try {
    const key = `compromised:${phoneNumber}`;
    const data = await redis.get(key);

    return data || null;
  } catch (err) {
    console.error(
      `❌ Failed to check compromised status for ${phoneNumber}:`,
      err.message,
    );
    return null;
  }
}

/**
 * Clear compromised flag (admin action)
 *
 * @param {string} phoneNumber - User's phone number
 * @returns {Promise<void>}
 */
async function clearCompromisedFlag(phoneNumber) {
  try {
    const key = `compromised:${phoneNumber}`;
    await redis.del(key);

    console.log(`✅ Cleared compromised flag for ${phoneNumber}`);
  } catch (err) {
    console.error(
      `❌ Failed to clear compromised flag for ${phoneNumber}:`,
      err.message,
    );
  }
}

/**
 * Get action to take based on risk level
 *
 * @param {string} riskLevel - Risk level
 * @param {string} currentAgent - Current agent name
 * @returns {object} Action to take
 */
function getProtectiveAction(riskLevel, currentAgent) {
  switch (riskLevel) {
    case RISK_LEVELS.CRITICAL:
      // CRITICAL: Block hackerAgent, route to riskAgent
      return {
        action: "SWITCH_AGENT",
        targetAgent: "riskAgent",
        blockCurrentAgent: currentAgent === "hackerAgent",
        sendAlert: true,
        message:
          "⚠️ For your security, I'm connecting you with our security team.",
      };

    case RISK_LEVELS.HIGH:
      // HIGH: Switch to riskAgent if on hackerAgent
      return {
        action:
          currentAgent === "hackerAgent" ? "SWITCH_AGENT" : "CONTINUE_MONITOR",
        targetAgent: "riskAgent",
        blockCurrentAgent: currentAgent === "hackerAgent",
        sendAlert: true,
        message:
          currentAgent === "hackerAgent"
            ? "⚠️ Let me transfer you to someone who can help better."
            : null,
      };

    case RISK_LEVELS.MEDIUM:
      // MEDIUM: Switch agent if on hackerAgent, otherwise monitor
      return {
        action: currentAgent === "hackerAgent" ? "SWITCH_AGENT" : "MONITOR",
        targetAgent: currentAgent === "hackerAgent" ? "riskAgent" : null,
        blockCurrentAgent: currentAgent === "hackerAgent",
        sendAlert: true,
        message:
          currentAgent === "hackerAgent"
            ? "👋 I'm here to help keep your account secure. For your safety, never share OTPs or passwords with anyone."
            : "⚠️ Please don't share sensitive information like OTPs or card numbers via chat.",
      };

    case RISK_LEVELS.LOW:
      // LOW: Log only
      return {
        action: "LOG",
        targetAgent: null,
        blockCurrentAgent: false,
        sendAlert: false,
        message: null,
      };

    default:
      return {
        action: "CONTINUE",
        targetAgent: null,
        blockCurrentAgent: false,
        sendAlert: false,
        message: null,
      };
  }
}

/**
 * Production safety: Disable hackerAgent if active
 *
 * In production, hackerAgent should never be active
 *
 * @param {string} phoneNumber - User's phone number
 * @param {string} currentAgent - Current agent name
 * @returns {Promise<object>} Action result
 */
async function enforceProductionSafety(phoneNumber, currentAgent) {
  if (!isProduction()) {
    return { enforced: false };
  }

  if (currentAgent === "hackerAgent") {
    console.log(
      `🛡️ PRODUCTION SAFETY: Disabling hackerAgent for ${phoneNumber}`,
    );

    return {
      enforced: true,
      action: "SWITCH_AGENT",
      targetAgent: "benignAgent",
      reason: "production_safety",
    };
  }

  return { enforced: false };
}

module.exports = {
  detectSensitiveData,
  calculateRiskLevel,
  classifyMessage,
  maskSensitiveData,
  markUserCompromised,
  isUserCompromised,
  clearCompromisedFlag,
  getProtectiveAction,
  enforceProductionSafety,
  RISK_LEVELS,
};
