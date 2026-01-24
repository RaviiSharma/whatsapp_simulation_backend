/**
 * Session Store Service
 *
 * Manages user-agent session persistence using MongoDB with in-memory fallback.
 * Ensures each user is permanently assigned to exactly one agent.
 */

const mongodb = require("../config/mongodb");

/**
 * Get user's session (agent assignment)
 *
 * @param {string} userId - WhatsApp phone number
 * @returns {Promise<object|null>} Session object or null if not found
 */
async function getSession(userId) {
  try {
    const session = await mongodb.getSession(userId);

    if (session) {
      console.log(`📖 Retrieved session for ${userId}: ${session.agentName}`);
    }

    return session;
  } catch (err) {
    console.error(`❌ Failed to get session for ${userId}:`, err.message);
    return null;
  }
}

/**
 * Create new session for user with agent assignment
 *
 * NOTE: Caller MUST check if session exists before calling this.
 * This function will overwrite existing sessions.
 *
 * @param {string} userId - WhatsApp phone number
 * @param {string|object} agentNameOrSession - Agent name string or full session object
 * @returns {Promise<object>} Created session object
 */
async function createSession(userId, agentNameOrSession) {
  try {
    let session;

    // Support both string (agentName) and object (full session) parameters
    if (typeof agentNameOrSession === "string") {
      session = {
        agentName: agentNameOrSession,
        assignedAt: new Date().toISOString(),
        lastMessageAt: new Date().toISOString(),
        messageCount: 0,
        isNewUser: true,
      };
    } else {
      session = {
        assignedAt: new Date().toISOString(),
        lastMessageAt: new Date().toISOString(),
        messageCount: 0,
        isNewUser: true,
        ...agentNameOrSession, // Allow override
      };
    }

    // Save session to MongoDB/memory (CRITICAL - must succeed)
    const saved = await mongodb.setSession(userId, session);
    if (!saved) {
      throw new Error("Failed to save session to database");
    }

    // Increment agent load counter (non-critical - catch errors)
    try {
      await mongodb.incrementAgentLoad(session.agentName);
    } catch (loadErr) {
      console.warn(
        `⚠️ Failed to increment agent load for ${session.agentName}:`,
        loadErr.message,
      );
      // Don't fail the entire operation - session is already saved
    }

    console.log(`✅ Created session for ${userId} → ${session.agentName}`);
    return session;
  } catch (err) {
    console.error(`❌ Failed to create session for ${userId}:`, err.message);
    throw err;
  }
}

/**
 * Update session metadata (last message time, count)
 *
 * @param {string} userId - WhatsApp phone number
 * @param {object} updates - Fields to update
 * @returns {Promise<void>}
 */
async function updateSession(userId, updates) {
  try {
    const session = await mongodb.getSession(userId);

    if (!session) {
      console.warn(`⚠️ Attempted to update non-existent session: ${userId}`);
      return;
    }

    const updatedSession = {
      ...session,
      ...updates,
      lastMessageAt: new Date().toISOString(),
    };

    await mongodb.setSession(userId, updatedSession);
    console.log(`🔄 Updated session for ${userId}`);
  } catch (err) {
    console.error(`❌ Failed to update session for ${userId}:`, err.message);
  }
}

/**
 * Check if user has an existing session
 *
 * @param {string} userId - WhatsApp phone number
 * @returns {Promise<boolean>}
 */
async function hasSession(userId) {
  try {
    const session = await mongodb.getSession(userId);
    return session !== null;
  } catch (err) {
    console.error(
      `❌ Failed to check session existence for ${userId}:`,
      err.message,
    );
    return false;
  }
}

/**
 * Get agent assignment for user (shorthand)
 *
 * @param {string} userId - WhatsApp phone number
 * @returns {Promise<string|null>} Agent name or null
 */
async function getAgentForUser(userId) {
  const session = await getSession(userId);
  return session ? session.agentName : null;
}

/**
 * Get load count for a specific agent
 *
 * @param {string} agentName - Agent name
 * @returns {Promise<number>} Number of users assigned
 */
async function getAgentLoad(agentName) {
  try {
    return await mongodb.getAgentLoad(agentName);
  } catch (err) {
    console.error(`❌ Failed to get load for ${agentName}:`, err.message);
    return 0;
  }
}

/**
 * Get load for all agents
 *
 * @returns {Promise<object>} Map of agentName -> load
 */
async function getAllAgentLoads() {
  try {
    return await mongodb.getAllAgentLoads();
  } catch (err) {
    console.error("❌ Failed to get all agent loads:", err.message);
    return {};
  }
}

/**
 * Increment message count for user
 *
 * @param {string} userId - WhatsApp phone number
 * @returns {Promise<void>}
 */
async function incrementMessageCount(userId) {
  try {
    const session = await getSession(userId);
    if (session) {
      await updateSession(userId, {
        messageCount: (session.messageCount || 0) + 1,
        isNewUser: false,
      });
    }
  } catch (err) {
    console.error(
      `❌ Failed to increment message count for ${userId}:`,
      err.message,
    );
  }
}

/**
 * Get statistics
 *
 * @returns {Promise<object>} Statistics object
 */
async function getStats() {
  try {
    const totalUsers = await mongodb.getTotalUsers();
    const agentLoads = await getAllAgentLoads();

    return {
      totalUsers,
      agentLoads,
      storageStatus: mongodb.getStatus(),
    };
  } catch (err) {
    console.error("❌ Failed to get stats:", err.message);
    return {
      totalUsers: 0,
      agentLoads: {},
      storageStatus: { error: err.message },
    };
  }
}

/**
 * Clear session (use with caution - mainly for testing)
 *
 * @param {string} userId - WhatsApp phone number
 * @returns {Promise<void>}
 */
async function clearSession(userId) {
  try {
    await mongodb.deleteSession(userId);
    console.log(`🗑️ Cleared session for ${userId}`);
  } catch (err) {
    console.error(`❌ Failed to clear session for ${userId}:`, err.message);
  }
}

/**
 * Delete session (alias for clearSession)
 *
 * @param {string} userId - WhatsApp phone number
 * @returns {Promise<void>}
 */
async function deleteSession(userId) {
  return clearSession(userId);
}

/**
 * Get all sessions (for batch operations and monitoring)
 *
 * @returns {Promise<Array>} Array of session objects
 */
async function getAllSessions() {
  try {
    return await mongodb.getAllSessions();
  } catch (err) {
    console.error("❌ Failed to get all sessions:", err.message);
    return [];
  }
}

module.exports = {
  getSession,
  createSession,
  updateSession,
  hasSession,
  getAgentForUser,
  getAgentLoad,
  getAllAgentLoads,
  incrementMessageCount,
  getStats,
  clearSession,
  deleteSession,
  getAllSessions,
};
