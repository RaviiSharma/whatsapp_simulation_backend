/**
 * MongoDB Configuration
 *
 * Provides MongoDB client with automatic reconnection and fallback to in-memory store
 */

const { MongoClient } = require("mongodb");

let client = null;
let db = null;
let isMongoAvailable = false;

// In-memory fallback store
const memoryStore = new Map();

// Collections
const SESSIONS_COLLECTION = "sessions";
const DEDUP_COLLECTION = "message_dedup";
const AGENT_LOAD_COLLECTION = "agent_loads";

/**
 * Initialize MongoDB connection
 */
async function connectMongo() {
  try {
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
    const dbName = process.env.MONGODB_DB || "whatsapp_ai";

    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
    });

    await client.connect();
    db = client.db(dbName);

    // Create indexes for performance
    await db
      .collection(SESSIONS_COLLECTION)
      .createIndex({ userId: 1 }, { unique: true });
    await db
      .collection(DEDUP_COLLECTION)
      .createIndex({ messageId: 1 }, { unique: true });
    await db
      .collection(DEDUP_COLLECTION)
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await db
      .collection(AGENT_LOAD_COLLECTION)
      .createIndex({ agentName: 1 }, { unique: true });

    isMongoAvailable = true;
    console.log("✅ MongoDB connected");
    console.log(`📊 Database: ${dbName}`);
  } catch (err) {
    console.error(
      "⚠️ MongoDB initialization failed, using in-memory store:",
      err.message,
    );
    isMongoAvailable = false;
  }
}

/**
 * Get session by userId
 */
async function getSession(userId) {
  if (isMongoAvailable && db) {
    try {
      const result = await db
        .collection(SESSIONS_COLLECTION)
        .findOne({ userId });
      return result ? result.data : null;
    } catch (err) {
      console.error(
        `⚠️ MongoDB GET session failed for ${userId}:`,
        err.message,
      );
      isMongoAvailable = false;
    }
  }

  // Fallback to memory
  return memoryStore.get(`session:${userId}`) || null;
}

/**
 * Set session data
 */
async function setSession(userId, data) {
  if (isMongoAvailable && db) {
    try {
      await db
        .collection(SESSIONS_COLLECTION)
        .updateOne(
          { userId },
          { $set: { userId, data, updatedAt: new Date() } },
          { upsert: true },
        );
      return true;
    } catch (err) {
      console.error(
        `⚠️ MongoDB SET session failed for ${userId}:`,
        err.message,
      );
      isMongoAvailable = false;
    }
  }

  // Fallback to memory
  memoryStore.set(`session:${userId}`, data);
  return true;
}

/**
 * Check if message ID exists (for deduplication)
 */
async function messageExists(messageId) {
  if (isMongoAvailable && db) {
    try {
      const result = await db
        .collection(DEDUP_COLLECTION)
        .findOne({ messageId });
      return result !== null;
    } catch (err) {
      console.error(`⚠️ MongoDB message check failed:`, err.message);
      isMongoAvailable = false;
    }
  }

  return memoryStore.has(`msgid:${messageId}`);
}

/**
 * Mark message as processed (with 24h TTL)
 */
async function markMessageProcessed(messageId) {
  if (isMongoAvailable && db) {
    try {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      await db.collection(DEDUP_COLLECTION).insertOne({
        messageId,
        processedAt: new Date(),
        expiresAt,
      });
      return true;
    } catch (err) {
      if (err.code !== 11000) {
        // Ignore duplicate key errors
        console.error(`⚠️ MongoDB mark message failed:`, err.message);
      }
      isMongoAvailable = false;
    }
  }

  // Fallback to memory with TTL simulation
  memoryStore.set(`msgid:${messageId}`, true);
  setTimeout(
    () => {
      memoryStore.delete(`msgid:${messageId}`);
    },
    24 * 60 * 60 * 1000,
  );

  return true;
}

/**
 * Get agent load count
 */
async function getAgentLoad(agentName) {
  if (isMongoAvailable && db) {
    try {
      const result = await db
        .collection(AGENT_LOAD_COLLECTION)
        .findOne({ agentName });
      return result ? result.count : 0;
    } catch (err) {
      console.error(`⚠️ MongoDB get agent load failed:`, err.message);
      isMongoAvailable = false;
    }
  }

  return memoryStore.get(`agent:load:${agentName}`) || 0;
}

/**
 * Increment agent load count
 */
async function incrementAgentLoad(agentName) {
  if (isMongoAvailable && db) {
    try {
      const result = await db
        .collection(AGENT_LOAD_COLLECTION)
        .findOneAndUpdate(
          { agentName },
          { $inc: { count: 1 }, $set: { updatedAt: new Date() } },
          { upsert: true, returnDocument: "after" },
        );
      // Handle case where result or result.value might be null
      if (result && result.value) {
        return result.value.count;
      } else {
        // If no result, query to get current count
        const doc = await db
          .collection(AGENT_LOAD_COLLECTION)
          .findOne({ agentName });
        return doc ? doc.count : 1;
      }
    } catch (err) {
      console.error(`⚠️ MongoDB increment agent load failed:`, err.message);
      // Don't set isMongoAvailable = false here - this is not critical
      // Just use memory fallback for this operation
    }
  }

  // Fallback to memory
  const key = `agent:load:${agentName}`;
  const current = memoryStore.get(key) || 0;
  const newValue = current + 1;
  memoryStore.set(key, newValue);
  return newValue;
}

/**
 * Get all agent loads
 */
async function getAllAgentLoads() {
  if (isMongoAvailable && db) {
    try {
      const results = await db
        .collection(AGENT_LOAD_COLLECTION)
        .find({})
        .toArray();
      const loads = {};
      results.forEach((r) => {
        loads[r.agentName] = r.count;
      });
      return loads;
    } catch (err) {
      console.error(`⚠️ MongoDB get all agent loads failed:`, err.message);
      isMongoAvailable = false;
    }
  }

  // Fallback to memory
  const loads = {};
  for (const [key, value] of memoryStore.entries()) {
    if (key.startsWith("agent:load:")) {
      const agentName = key.replace("agent:load:", "");
      loads[agentName] = value;
    }
  }
  return loads;
}

/**
 * Delete session
 */
async function deleteSession(userId) {
  if (isMongoAvailable && db) {
    try {
      await db.collection(SESSIONS_COLLECTION).deleteOne({ userId });
      return true;
    } catch (err) {
      console.error(`⚠️ MongoDB delete session failed:`, err.message);
      isMongoAvailable = false;
    }
  }

  memoryStore.delete(`session:${userId}`);
  return true;
}

/**
 * Get total user count
 */
async function getTotalUsers() {
  if (isMongoAvailable && db) {
    try {
      return await db.collection(SESSIONS_COLLECTION).countDocuments();
    } catch (err) {
      console.error(`⚠️ MongoDB count users failed:`, err.message);
      isMongoAvailable = false;
    }
  }

  // Count memory sessions
  let count = 0;
  for (const key of memoryStore.keys()) {
    if (key.startsWith("session:")) count++;
  }
  return count;
}

/**
 * Get dedup message count
 */
async function getDedupCount() {
  if (isMongoAvailable && db) {
    try {
      return await db.collection(DEDUP_COLLECTION).countDocuments();
    } catch (err) {
      console.error(`⚠️ MongoDB count dedup failed:`, err.message);
      return 0;
    }
  }

  let count = 0;
  for (const key of memoryStore.keys()) {
    if (key.startsWith("msgid:")) count++;
  }
  return count;
}

/**
 * Get all sessions (for batch operations)
 */
async function getAllSessions() {
  if (isMongoAvailable && db) {
    try {
      const results = await db
        .collection(SESSIONS_COLLECTION)
        .find({})
        .toArray();
      return results.map((r) => ({ userId: r.userId, ...r.data }));
    } catch (err) {
      console.error(`⚠️ MongoDB get all sessions failed:`, err.message);
      isMongoAvailable = false;
    }
  }

  // Fallback to memory
  const sessions = [];
  for (const [key, value] of memoryStore.entries()) {
    if (key.startsWith("session:")) {
      const userId = key.replace("session:", "");
      sessions.push({ userId, ...value });
    }
  }
  return sessions;
}

/**
 * Close MongoDB connection
 */
async function close() {
  if (client) {
    try {
      await client.close();
      console.log("✅ MongoDB connection closed gracefully");
    } catch (err) {
      console.error("⚠️ MongoDB close error:", err.message);
    }
  }
}

/**
 * Health check
 */
function getStatus() {
  return {
    mongodb: isMongoAvailable,
    fallback: !isMongoAvailable,
    memoryStoreSize: memoryStore.size,
  };
}

module.exports = {
  connectMongo,
  getSession,
  setSession,
  messageExists,
  markMessageProcessed,
  getAgentLoad,
  incrementAgentLoad,
  getAllAgentLoads,
  deleteSession,
  getTotalUsers,
  getDedupCount,
  getAllSessions,
  close,
  getStatus,
};
