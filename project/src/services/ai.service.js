/**
 * AI Service
 *
 * Interfaces with external AI service (localhost:4000)
 * Handles: fraud detection, message generation with agent-specific routing
 */

const axios = require("axios");

const AI_BASE_URL = "http://localhost:4000";

/**
 * Axios instance with timeout and retry configuration
 */
const api = axios.create({
  baseURL: AI_BASE_URL,
  timeout: 10000, // 10 seconds
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * Fraud detection with agent context
 *
 * @param {string} userId - WhatsApp number
 * @param {string} text - Message text
 * @param {string} agentName - Assigned agent name
 * @returns {Promise<object>} Fraud detection result
 */
exports.checkFraud = async (userId, text, agentName) => {
  try {
    const res = await api.post(
      "/api/fraud_detection",
      {
        userId,
        text,
        sessionId: userId, // Keep for backward compatibility
        agentName, // Pass agent context to AI
      },
      { timeout: 10000 },
    );

    if (!res.data) {
      throw new Error("Invalid fraud API response format");
    }

    // Handle response format from fraud detection
    const response = {
      decision: res.data.decision || { action: "ALLOW" },
      risk: res.data.risk || { risk_level: "unknown" },
      intent: res.data.intent || { intent: "unknown", confidence: 0 },
      aiMessage: res.data.aiMessage || null, // Extract AI message from fraud detection
    };

    return response;
  } catch (err) {
    handleAxiosError("Fraud API", err);

    // SAFE FALLBACK (never block user if AI fails)
    return {
      decision: { action: "ALLOW" },
      risk: { risk_level: "unknown" },
      intent: { intent: "unknown", confidence: 0 },
      aiMessage: null,
    };
  }
};

/**
 * Generate agent-specific message
 *
 * Routes to correct AI agent endpoint based on assignment
 *
 * @param {string} userId - WhatsApp number
 * @param {string} text - User's message
 * @param {string} agentName - Assigned agent name
 * @returns {Promise<string>} AI-generated reply
 */
exports.generateAgentMessage = async (userId, text, agentName) => {
  try {
    const res = await api.post(
      "/api/generate",
      {
        userId,
        text,
        sessionId: userId,
        agentName, // Route to specific agent
      },
      { timeout: 25000 },
    );

    if (!res.data) {
      throw new Error("Invalid generate API response format");
    }

    // Try multiple field names for different agents
    const message =
      res.data.message ||
      res.data.hackerMessage ||
      res.data.riskMessage ||
      res.data.policyMessage ||
      res.data.benignMessage;

    if (!message) {
      throw new Error("No message field found in AI response");
    }

    return message;
  } catch (err) {
    handleAxiosError("Generate API", err);

    // SAFE fallback message (agent-aware)
    return getFallbackMessage(agentName);
  }
};

/**
 * Legacy method for backward compatibility
 *
 * @deprecated Use generateAgentMessage instead
 */
exports.generateHackerMessage = async (userId, sessionId) => {
  return exports.generateAgentMessage(userId, "", "hackerAgent");
};

/**
 * Get intro message for new user
 *
 * @param {string} agentName - Agent name
 * @returns {Promise<string>} Intro message
 */
exports.getIntroMessage = async (agentName) => {
  try {
    const res = await api.post(
      "/api/intro",
      {
        agentName,
      },
      { timeout: 5000 },
    );

    return res.data.introMessage || getDefaultIntroMessage(agentName);
  } catch (err) {
    console.warn(
      `⚠️ Failed to get intro message for ${agentName}, using default`,
    );
    return getDefaultIntroMessage(agentName);
  }
};

/**
 * Get default intro message (fallback)
 *
 * @param {string} agentName - Agent name
 * @returns {string} Default intro message
 */
function getDefaultIntroMessage(agentName) {
  const intros = {
    hackerAgent:
      "🔓 Hey there! I noticed your account activity. Quick security check needed.",
    benignAgent:
      "👋 Hi! Thanks for connecting with us. How can I help you today?",
    policyAgent:
      "📋 Hello. This is a routine policy verification check. Please respond to continue.",
    riskAgent:
      "👋 Hi, I'm here to help you stay secure. Let's make sure everything is okay with your account.",
  };

  return intros[agentName] || "👋 Hello! Thanks for contacting us.";
}

/**
 * Get fallback message when AI generation fails
 *
 * @param {string} agentName - Agent name
 * @returns {string} Fallback message
 */
function getFallbackMessage(agentName) {
  const fallbacks = {
    hackerAgent: "Please verify your account to continue.",
    benignAgent: "Thanks for your message. We'll get back to you shortly.",
    policyAgent: "Your request is being processed. Please wait.",
    riskAgent:
      "I'm here to help keep your account secure. For your safety, never share OTPs, passwords, or card details with anyone - even if they claim to be from support.",
  };

  return fallbacks[agentName] || "Thanks for your message.";
}

/**
 * Error handler for axios errors
 *
 * @param {string} serviceName - Service name for logging
 * @param {Error} err - Axios error
 */
function handleAxiosError(serviceName, err) {
  if (err.code === "ECONNABORTED") {
    console.error(`⏱ ${serviceName} timeout`);
  } else if (err.response) {
    const status = err.response.status;

    if (status === 429) {
      console.error(` ${serviceName} rate limit exceeded (429)`);
    } else if (status >= 500) {
      console.error(` ${serviceName} server error (${status})`);
    } else if (status >= 400) {
      console.error(
        ` ${serviceName} client error (${status}):`,
        err.response.data,
      );
    }
  } else if (err.request) {
    console.error(` ${serviceName} no response (network error)`);
  } else {
    console.error(` ${serviceName} error:`, err.message);
  }
}

/**
 * Health check for AI service
 *
 * @returns {Promise<object>} Health status
 */
exports.checkHealth = async () => {
  try {
    const res = await api.get("/health", { timeout: 3000 });
    return {
      status: "ok",
      aiService: res.data,
    };
  } catch (err) {
    return {
      status: "error",
      error: err.message,
    };
  }
};
