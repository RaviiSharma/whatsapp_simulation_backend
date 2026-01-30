/**
 * MongoDB Index Definitions - Production-Grade
 *
 * SOLUTION TO PROBLEM 4
 *
 * Ensures:
 * - Data consistency with unique constraints
 * - Query performance for 100k+ users
 * - Proper index selection
 * - Compound indexes for common queries
 */

const { MongoClient } = require("mongodb");
require("dotenv").config({
  path: require("path").join(__dirname, "..", "..", ".env"),
});

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
const dbName = process.env.MONGODB_DB || "whatsapp_ai";

async function setupProductionIndexes() {
  let client;

  try {
    console.log("🔌 Connecting to MongoDB...");
    client = new MongoClient(uri);
    await client.connect();
    const db = client.db(dbName);
    console.log("✅ Connected\n");

    // ============================================
    // 1. CAMPAIGNS COLLECTION
    // ============================================
    console.log("📊 Setting up campaigns indexes...");

    await db.collection("campaigns").createIndexes([
      // Unique campaign ID
      {
        key: { campaignId: 1 },
        name: "idx_campaignId_unique",
        unique: true,
      },

      // Query by status and creation date
      {
        key: { status: 1, createdAt: -1 },
        name: "idx_status_createdAt",
      },

      // Query by creator
      {
        key: { createdBy: 1, createdAt: -1 },
        name: "idx_createdBy_createdAt",
      },

      // Query active campaigns
      {
        key: { status: 1, startedAt: -1 },
        name: "idx_status_startedAt",
      },
    ]);

    console.log("   ✅ 4 indexes created\n");

    // ============================================
    // 2. CAMPAIGN_USERS COLLECTION
    // ============================================
    console.log("📊 Setting up campaign_users indexes...");

    await db.collection("campaign_users").createIndexes([
      // ★ CRITICAL: Unique constraint (campaignId + phoneNumber)
      // Prevents duplicate assignments
      {
        key: { campaignId: 1, phoneNumber: 1 },
        name: "idx_campaign_phone_unique",
        unique: true,
      },

      // Query users by campaign and status
      {
        key: { campaignId: 1, sessionStatus: 1 },
        name: "idx_campaign_status",
      },

      // Query users by campaign and agent
      {
        key: { campaignId: 1, agentName: 1 },
        name: "idx_campaign_agent",
      },

      // Query user's campaign history
      {
        key: { phoneNumber: 1, assignedAt: -1 },
        name: "idx_phone_assignedAt",
      },

      // Query active users by agent
      {
        key: { agentName: 1, isActive: 1 },
        name: "idx_agent_active",
      },

      // Query by status and last activity
      {
        key: { sessionStatus: 1, lastMessageAt: -1 },
        name: "idx_status_lastMessage",
      },

      // Query completed users
      {
        key: { campaignId: 1, isCompleted: 1 },
        name: "idx_campaign_completed",
      },
    ]);

    console.log("   ✅ 7 indexes created\n");

    // ============================================
    // 3. CONVERSATIONS COLLECTION
    // ============================================
    console.log("📊 Setting up conversations indexes...");

    await db.collection("conversations").createIndexes([
      // ★ CRITICAL: Unique constraint (phoneNumber + campaignId)
      // ONE conversation per user per campaign
      {
        key: { phoneNumber: 1, campaignId: 1 },
        name: "idx_phone_campaign_unique",
        unique: true,
      },

      // Query user's conversations sorted by activity
      {
        key: { phoneNumber: 1, lastMessageAt: -1 },
        name: "idx_phone_lastMessage",
      },

      // Query campaign conversations sorted by activity
      {
        key: { campaignId: 1, lastMessageAt: -1 },
        name: "idx_campaign_lastMessage",
      },

      // Query conversations by agent
      {
        key: { agentName: 1, lastMessageAt: -1 },
        name: "idx_agent_lastMessage",
      },

      // Query current agent assignment
      {
        key: { currentAgentName: 1, lastMessageAt: -1 },
        name: "idx_currentAgent_lastMessage",
      },

      // Query fraud-flagged conversations
      {
        key: { "fraud.flagged": 1, lastMessageAt: -1 },
        name: "idx_fraud_lastMessage",
      },

      // Query by fraud risk level
      {
        key: { "fraud.flagged": 1, "fraud.riskLevel": 1 },
        name: "idx_fraud_riskLevel",
      },

      // Find conversation by specific message ID
      {
        key: { "messages.messageId": 1 },
        name: "idx_messages_messageId",
      },

      // Query conversations started in date range
      {
        key: { conversationStartedAt: 1 },
        name: "idx_conversationStarted",
      },

      // Compound index for campaign + fraud queries
      {
        key: { campaignId: 1, "fraud.flagged": 1 },
        name: "idx_campaign_fraud",
      },

      // ★ CRITICAL: TTL index for GDPR compliance
      // Automatically deletes expired conversations
      {
        key: { retentionExpiry: 1 },
        name: "idx_ttl_retention",
        expireAfterSeconds: 0,
      },
    ]);

    console.log("   ✅ 11 indexes created\n");

    // ============================================
    // 4. AUDIT_LOG COLLECTION
    // ============================================
    console.log("📊 Setting up audit_log indexes...");

    await db.collection("audit_log").createIndexes([
      // Query logs by timestamp
      {
        key: { timestamp: -1 },
        name: "idx_timestamp",
      },

      // Query logs by user/phone
      {
        key: { phoneNumber: 1, timestamp: -1 },
        name: "idx_phone_timestamp",
      },

      // Query logs by action type
      {
        key: { action: 1, timestamp: -1 },
        name: "idx_action_timestamp",
      },

      // Query logs by admin user
      {
        key: { userId: 1, timestamp: -1 },
        name: "idx_userId_timestamp",
      },

      // TTL index: Keep audit logs for 2 years
      {
        key: { timestamp: 1 },
        name: "idx_ttl_audit",
        expireAfterSeconds: 63072000, // 2 years in seconds
      },
    ]);

    console.log("   ✅ 5 indexes created\n");

    // ============================================
    // 5. FRAUD_REPORTS COLLECTION (if exists)
    // ============================================
    console.log("📊 Setting up fraud_reports indexes...");

    await db.collection("fraud_reports").createIndexes([
      // Query reports by phone number
      {
        key: { phoneNumber: 1, reportedAt: -1 },
        name: "idx_phone_reportedAt",
      },

      // Query reports by risk level
      {
        key: { riskLevel: 1, reportedAt: -1 },
        name: "idx_riskLevel_reportedAt",
      },

      // Query reports by campaign
      {
        key: { campaignId: 1, reportedAt: -1 },
        name: "idx_campaign_reportedAt",
      },

      // Query unresolved reports
      {
        key: { resolved: 1, reportedAt: -1 },
        name: "idx_resolved_reportedAt",
      },
    ]);

    console.log("   ✅ 4 indexes created\n");

    // ============================================
    // VERIFY INDEX CREATION
    // ============================================
    console.log("🔍 Verifying indexes...\n");

    const collections = [
      "campaigns",
      "campaign_users",
      "conversations",
      "audit_log",
      "fraud_reports",
    ];

    for (const collName of collections) {
      const indexes = await db.collection(collName).indexes();
      console.log(`   ${collName}: ${indexes.length} indexes`);
    }

    console.log("\n✅ All indexes created successfully!\n");

    // ============================================
    // INDEX USAGE RECOMMENDATIONS
    // ============================================
    console.log("📝 Index Usage Recommendations:\n");
    console.log("1. Campaign Users API:");
    console.log("   - Uses: idx_campaign_phone_unique (lookup join)");
    console.log("   - Uses: idx_campaign_status (filtering by sessionStatus)");
    console.log("   - Uses: idx_campaign_agent (filtering by agentName)\n");

    console.log("2. User History API:");
    console.log("   - Uses: idx_phone_campaign_unique (conversation lookup)");
    console.log("   - Uses: idx_phone_lastMessage (sorting conversations)");
    console.log(
      "   - Uses: idx_messages_messageId (finding specific messages)\n",
    );

    console.log("3. Fraud Detection:");
    console.log("   - Uses: idx_fraud_lastMessage (finding fraud cases)");
    console.log("   - Uses: idx_campaign_fraud (fraud by campaign)");
    console.log("   - Uses: idx_fraud_riskLevel (filtering by risk)\n");

    console.log("4. Queue Processing:");
    console.log("   - Uses: idx_campaign_phone_unique (idempotency checks)");
    console.log("   - Uses: idx_campaign_status (finding pending users)");
    console.log("   - Unique constraints prevent duplicate assignments\n");

    console.log("5. GDPR Compliance:");
    console.log(
      "   - Uses: idx_ttl_retention (automatic conversation deletion)",
    );
    console.log("   - Uses: idx_ttl_audit (automatic audit log cleanup)\n");

    await client.close();
    console.log("🔌 Connection closed");
  } catch (err) {
    console.error("❌ Error setting up indexes:", err);
    throw err;
  }
}

// Run if executed directly
if (require.main === module) {
  setupProductionIndexes()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { setupProductionIndexes };
