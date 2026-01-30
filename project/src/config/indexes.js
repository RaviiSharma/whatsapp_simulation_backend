/**
 * MongoDB Indexes Configuration - Production Grade
 *
 * Performance-critical indexes for:
 * - Fast lookups
 * - Unique constraints
 * - TTL expiration
 * - Query optimization
 */

const mongodb = require("./mongodb");

// ============================================
// INDEX DEFINITIONS
// ============================================

const INDEXES = {
  campaigns: [
    {
      key: { campaignId: 1 },
      options: { unique: true, name: "idx_campaignId" },
    },
    {
      key: { status: 1, createdAt: -1 },
      options: { name: "idx_status_createdAt" },
    },
    {
      key: { createdAt: -1 },
      options: { name: "idx_createdAt_desc" },
    },
  ],

  campaign_users: [
    {
      key: { campaignId: 1, phoneNumber: 1 },
      options: { unique: true, name: "idx_campaignId_phoneNumber" },
    },
    {
      key: { phoneNumber: 1 },
      options: { name: "idx_phoneNumber" },
    },
    {
      key: { campaignId: 1, agentName: 1 },
      options: { name: "idx_campaignId_agentName" },
    },
    {
      key: { campaignId: 1, sessionStatus: 1 },
      options: { name: "idx_campaignId_sessionStatus" },
    },
    {
      key: { "fraudFlags.detected": 1, "fraudFlags.riskLevel": 1 },
      options: { name: "idx_fraud_flags" },
    },
    {
      key: { assignedAt: 1 },
      options: { name: "idx_assignedAt" },
    },
  ],

  conversations: [
    {
      key: { campaignId: 1, phoneNumber: 1 },
      options: { unique: true, name: "idx_campaignId_phoneNumber_unique" },
    },
    {
      key: { conversationId: 1 },
      options: { unique: true, name: "idx_conversationId_unique" },
    },
    {
      key: { phoneNumber: 1, lastMessageAt: -1 },
      options: { name: "idx_phoneNumber_lastMessageAt" },
    },
    {
      key: { campaignId: 1, lastMessageAt: -1 },
      options: { name: "idx_campaignId_lastMessageAt" },
    },
    {
      key: { "fraud.flagged": 1, "fraud.riskLevel": 1 },
      options: { name: "idx_fraud_status" },
    },
    {
      key: { currentAgentName: 1 },
      options: { name: "idx_currentAgentName" },
    },
    {
      key: { "messages.messageId": 1 },
      options: { name: "idx_messages_messageId" },
    },
    {
      key: { retentionExpiry: 1 },
      options: {
        name: "idx_retentionExpiry_ttl",
        expireAfterSeconds: 0, // TTL index (auto-delete on expiry)
      },
    },
    {
      key: { createdAt: -1 },
      options: { name: "idx_createdAt_desc" },
    },
  ],

  messages: [
    {
      key: { messageId: 1 },
      options: { unique: true, name: "idx_messageId_unique" },
    },
    {
      key: { campaignId: 1, phoneNumber: 1, timestamp: -1 },
      options: { name: "idx_campaignId_phoneNumber_timestamp" },
    },
    {
      key: { phoneNumber: 1, timestamp: -1 },
      options: { name: "idx_phoneNumber_timestamp" },
    },
    {
      key: { direction: 1, timestamp: -1 },
      options: { name: "idx_direction_timestamp" },
    },
    {
      key: { createdAt: -1 },
      options: { name: "idx_createdAt_desc" },
    },
  ],

  fraud_reports: [
    {
      key: { reportId: 1 },
      options: { unique: true, name: "idx_reportId_unique" },
    },
    {
      key: { phoneNumber: 1, detectedAt: -1 },
      options: { name: "idx_phoneNumber_detectedAt" },
    },
    {
      key: { campaignId: 1, riskLevel: 1 },
      options: { name: "idx_campaignId_riskLevel" },
    },
    {
      key: { riskLevel: 1, detectedAt: -1 },
      options: { name: "idx_riskLevel_detectedAt" },
    },
    {
      key: { detectedAt: -1 },
      options: { name: "idx_detectedAt_desc" },
    },
  ],
};

// ============================================
// INDEX CREATION
// ============================================

/**
 * Create all indexes
 */
async function createAllIndexes() {
  try {
    console.log("📊 Creating MongoDB indexes...");

    const db = await mongodb.getDatabase();
    const results = {};

    for (const [collectionName, indexes] of Object.entries(INDEXES)) {
      console.log(`  Creating indexes for ${collectionName}...`);

      const collection = db.collection(collectionName);
      const created = [];

      for (const index of indexes) {
        try {
          await collection.createIndex(index.key, index.options);
          created.push(index.options.name);
          console.log(`    ✅ ${index.options.name}`);
        } catch (err) {
          if (err.code === 85 || err.code === 86) {
            // Index already exists or conflict
            console.log(`    ℹ️ ${index.options.name} (already exists)`);
          } else {
            console.error(`    ❌ ${index.options.name}:`, err.message);
            throw err;
          }
        }
      }

      results[collectionName] = created;
    }

    console.log("✅ All indexes created successfully");
    return results;
  } catch (err) {
    console.error("❌ Index creation failed:", err.message);
    throw err;
  }
}

/**
 * List all indexes for a collection
 */
async function listIndexes(collectionName) {
  try {
    const db = await mongodb.getDatabase();
    const indexes = await db.collection(collectionName).indexes();

    console.log(`\nIndexes for ${collectionName}:`);
    indexes.forEach((idx) => {
      console.log(`  - ${idx.name}:`, JSON.stringify(idx.key));
    });

    return indexes;
  } catch (err) {
    console.error(`❌ Failed to list indexes:`, err.message);
    throw err;
  }
}

/**
 * Drop all indexes for a collection (except _id)
 */
async function dropAllIndexes(collectionName) {
  try {
    const db = await mongodb.getDatabase();
    await db.collection(collectionName).dropIndexes();

    console.log(`✅ Dropped all indexes for ${collectionName}`);
  } catch (err) {
    console.error(`❌ Failed to drop indexes:`, err.message);
    throw err;
  }
}

/**
 * Get index statistics
 */
async function getIndexStats(collectionName) {
  try {
    const db = await mongodb.getDatabase();
    const stats = await db
      .collection(collectionName)
      .aggregate([{ $indexStats: {} }])
      .toArray();

    console.log(`\nIndex statistics for ${collectionName}:`);
    stats.forEach((stat) => {
      console.log(`  - ${stat.name}:`);
      console.log(`    Accesses: ${stat.accesses.ops}`);
      console.log(`    Since: ${stat.accesses.since}`);
    });

    return stats;
  } catch (err) {
    console.error(`❌ Failed to get index stats:`, err.message);
    throw err;
  }
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  INDEXES,
  createAllIndexes,
  listIndexes,
  dropAllIndexes,
  getIndexStats,
};
