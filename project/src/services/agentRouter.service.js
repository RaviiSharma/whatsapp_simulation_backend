/**
 * Agent Router Service
 *
 * Handles agent assignment and routing logic with load balancing.
 * Ensures each user is permanently assigned to exactly ONE agent.
 *
 * PRODUCTION SAFETY:
 * - hackerAgent is automatically disabled in production mode
 * - All users get benignAgent in production
 */

const sessionStore = require("./sessionStore.service");
const { NODE_ENV, isProduction } = require("../config/env");

/**
 * Available AI agents
 * Add/remove agents as needed
 *
 * IMPORTANT: hackerAgent is filtered out in production mode
 */
const ALL_AGENTS = ["hackerAgent", "benignAgent", "policyAgent", "riskAgent"];

/**
 * Get available agents based on environment
 * In production: hackerAgent is excluded
 */
function getAvailableAgents() {
  if (isProduction()) {
    console.log("⚠️ PRODUCTION MODE: hackerAgent disabled");
    return ALL_AGENTS.filter((agent) => agent !== "hackerAgent");
  }
  return ALL_AGENTS;
}

const AVAILABLE_AGENTS = getAvailableAgents();

/**
 * Get or assign agent for a user
 *
 * This is the main entry point for agent routing.
 * - If user exists: return their existing agent (stickiness)
 * - If new user: assign agent using load balancing
 *
 * @param {string} userId - WhatsApp phone number
 * @returns {Promise<object>} { agentName, isNewUser }
 */
async function getOrAssignAgent(userId) {
  try {
    // Check if user already has an agent assigned
    const existingSession = await sessionStore.getSession(userId);

    if (existingSession) {
      console.log(
        `🎯 User ${userId} already assigned to ${existingSession.agentName}`,
      );
      return {
        agentName: existingSession.agentName,
        isNewUser: false,
      };
    }

    // New user - assign agent using load balancing
    const assignedAgent = await assignAgent(userId);

    console.log(`🆕 New user ${userId} assigned to ${assignedAgent}`);
    return {
      agentName: assignedAgent,
      isNewUser: true,
    };
  } catch (err) {
    console.error(`❌ Agent routing failed for ${userId}:`, err.message);

    // Fallback: assign random agent
    const fallbackAgent =
      AVAILABLE_AGENTS[Math.floor(Math.random() * AVAILABLE_AGENTS.length)];
    console.warn(`⚠️ Using fallback agent: ${fallbackAgent}`);

    return {
      agentName: fallbackAgent,
      isNewUser: true,
    };
  }
}

/**
 * Assign new agent to user using load balancing
 *
 * Strategy: Assign to agent with MINIMUM current load
 *
 * @param {string} userId - WhatsApp phone number
 * @returns {Promise<string>} Assigned agent name
 */
async function assignAgent(userId) {
  try {
    const availableAgents = getAvailableAgents();

    // PRODUCTION SAFETY: Force benignAgent in production
    if (isProduction()) {
      console.log(`🛡️ PRODUCTION MODE: Forcing benignAgent`);
      return "benignAgent";
    }

    // Get current load for all agents
    const agentLoads = await sessionStore.getAllAgentLoads();

    // Find agent with minimum load from available agents
    let selectedAgent = availableAgents[0];
    let minLoad = agentLoads[selectedAgent] || 0;

    for (const agent of availableAgents) {
      const load = agentLoads[agent] || 0;
      if (load < minLoad) {
        minLoad = load;
        selectedAgent = agent;
      }
    }

    console.log(
      `⚖️ Load balancing: Selected ${selectedAgent} (load: ${minLoad}) [${NODE_ENV}]`,
    );
    console.log(`📊 Current loads:`, agentLoads);

    return selectedAgent;
  } catch (err) {
    console.error(`❌ Agent assignment failed for ${userId}:`, err.message);

    // Fallback to benignAgent (safest option)
    const fallbackAgent = "benignAgent";
    console.warn(`⚠️ Using fallback agent: ${fallbackAgent}`);

    return fallbackAgent;
  }
}

/**
 * Validate if agent is allowed in current environment
 *
 * @param {string} agentName - Agent to validate
 * @returns {boolean} True if agent is allowed
 */
function isAgentAllowed(agentName) {
  const availableAgents = getAvailableAgents();
  return availableAgents.includes(agentName);
}

/**
 * Route message to correct agent
 *
 * Returns agent-specific context and routing information
 *
 * @param {string} userId - WhatsApp phone number
 * @param {string} message - User message text
 * @returns {Promise<object>} Routing information
 */
async function routeMessage(userId, message) {
  try {
    const { agentName, isNewUser } = await getOrAssignAgent(userId);

    // Increment message count
    await sessionStore.incrementMessageCount(userId);

    return {
      agentName,
      isNewUser,
      userId,
      message,
      context: getAgentContext(agentName),
    };
  } catch (err) {
    console.error(`❌ Message routing failed for ${userId}:`, err.message);
    throw err;
  }
}

/**
 * Get agent-specific context and configuration
 *
 * This can be used to customize AI behavior per agent
 *
 * @param {string} agentName - Agent name
 * @returns {object} Agent context
 */
function getAgentContext(agentName) {
  const contexts = {
    hackerAgent: {
      role: "hacker",
      personality: "suspicious, technical, probing",
      goal: "extract information, social engineering",
      introMessage:
        "🔓 Hey there! I noticed your account activity. Quick security check needed.",
    },
    benignAgent: {
      role: "friendly_user",
      personality: "helpful, casual, trustworthy",
      goal: "normal conversation, build rapport",
      introMessage:
        "👋 Hi! Thanks for connecting with us. How can I help you today?",
    },
    policyAgent: {
      role: "policy_enforcer",
      personality: "formal, rule-based, strict",
      goal: "verify compliance, enforce policies",
      introMessage:
        "📋 Hello. This is a routine policy verification check. Please respond to continue.",
    },
    riskAgent: {
      role: "security_educator",
      personality: "transparent, protective, calm, educational",
      goal: "educate user about security, explain what happened, provide safety guidance",
      systemPrompt:
        "You are a security awareness educator. The user was just in a simulated phishing scenario and may have shared sensitive information. Be TRANSPARENT - explain this was a security training test. Be CALM - no urgency or fear. EDUCATE about security best practices. NEVER manipulate, deceive, or use social engineering. NEVER impersonate organizations. NEVER ask for sensitive info. Speak honestly and clearly. Example: 'I want to help you understand what just happened. This was a security awareness simulation. Sharing OTPs or passwords can put your account at risk. Real companies never ask for these via chat. Let me explain how to stay safe...'",
      introMessage:
        "👋 Hi, I'm a security educator here to help you understand online safety. Let's talk about keeping your information secure.",
    },
  };

  return contexts[agentName] || contexts.benignAgent;
}

/**
 * Get routing statistics
 *
 * @returns {Promise<object>} Routing statistics
 */
async function getRoutingStats() {
  try {
    const stats = await sessionStore.getStats();

    return {
      ...stats,
      availableAgents: AVAILABLE_AGENTS,
      agentDistribution: calculateDistribution(
        stats.agentLoads,
        stats.totalUsers,
      ),
    };
  } catch (err) {
    console.error("❌ Failed to get routing stats:", err.message);
    return {
      error: err.message,
    };
  }
}

/**
 * Calculate percentage distribution of users across agents
 *
 * @param {object} agentLoads - Map of agent -> load
 * @param {number} totalUsers - Total number of users
 * @returns {object} Map of agent -> percentage
 */
function calculateDistribution(agentLoads, totalUsers) {
  const distribution = {};

  if (totalUsers === 0) return distribution;

  for (const [agent, load] of Object.entries(agentLoads)) {
    distribution[agent] = ((load / totalUsers) * 100).toFixed(2) + "%";
  }

  return distribution;
}

/**
 * Manually reassign user to different agent
 * (Use with caution - breaks stickiness guarantee)
 *
 * @param {string} userId - WhatsApp phone number
 * @param {string} newAgentName - New agent to assign
 * @returns {Promise<boolean>} Success status
 */
async function reassignAgent(userId, newAgentName) {
  // PRODUCTION SAFETY: Block hackerAgent reassignment in production
  if (isProduction() && newAgentName === "hackerAgent") {
    console.log(
      `⚠️ PRODUCTION MODE: Cannot reassign to hackerAgent. Using benignAgent instead.`,
    );
    newAgentName = "benignAgent";
  }

  // Validate agent exists and is allowed
  if (!isAgentAllowed(newAgentName)) {
    throw new Error(`Invalid or disallowed agent: ${newAgentName}`);
  }

  const session = await sessionStore.getSession(userId);
  if (!session) {
    throw new Error(`User ${userId} has no session`);
  }

  const oldAgent = session.agentName;

  // Update session with new agent
  await sessionStore.updateSession(userId, {
    agentName: newAgentName,
    reassignedAt: new Date().toISOString(),
    previousAgent: oldAgent,
  });

  console.log(`🔄 Reassigned ${userId}: ${oldAgent} → ${newAgentName}`);
  return true;
}

/**
 * Validate agent name
 *
 * @param {string} agentName - Agent name to validate
 * @returns {boolean} Is valid
 */
function isValidAgent(agentName) {
  return isAgentAllowed(agentName);
}

/**
 * Get session directly (for checking proactive flag)
 *
 * @param {string} userId - WhatsApp phone number
 * @returns {Promise<object|null>} Session object
 */
async function getSession(userId) {
  return await sessionStore.getSession(userId);
}

/**
 * Update isNewUser flag in session
 *
 * @param {string} userId - WhatsApp phone number
 * @param {boolean} isNewUser - New value for isNewUser flag
 * @returns {Promise<void>}
 */
async function updateSessionNewUserFlag(userId, isNewUser) {
  try {
    await sessionStore.updateSession(userId, { isNewUser });
    console.log(`🔄 Updated isNewUser flag for ${userId}: ${isNewUser}`);
  } catch (err) {
    console.error(`❌ Failed to update isNewUser flag: ${err.message}`);
  }
}

module.exports = {
  getOrAssignAgent,
  assignAgent,
  routeMessage,
  getAgentContext,
  getRoutingStats,
  reassignAgent,
  isValidAgent,
  getSession,
  updateSessionNewUserFlag,
  AVAILABLE_AGENTS,
};
