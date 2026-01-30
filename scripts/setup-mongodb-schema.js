/**
 * MongoDB Schema Setup Script
 *
 * Creates all collections, indexes, and schema validations for:
 * - campaigns
 * - campaign_users
 * - conversations (NEW - replaces chat_history)
 * - audit_log
 *
 * Run with: node scripts/setup-mongodb-schema.js
 */

const { MongoClient } = require("mongodb");
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
const dbName = process.env.MONGODB_DB || "whatsapp_ai";

async function setupSchema() {
  let client;

  try {
    console.log("🔌 Connecting to MongoDB...");
    console.log(`   URI: ${uri}`);
    console.log(`   Database: ${dbName}`);

    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
    });

    await client.connect();
    const db = client.db(dbName);

    console.log("✅ Connected to MongoDB\n");

    // ========================================
    // 1. CAMPAIGNS COLLECTION
    // ========================================
    console.log("📦 Setting up campaigns collection...");

    try {
      await db.createCollection("campaigns", {
        validator: {
          $jsonSchema: {
            bsonType: "object",
            required: ["campaignId", "campaignName", "status", "createdAt"],
            properties: {
              campaignId: {
                bsonType: "string",
                pattern: "^[a-zA-Z0-9_-]+$",
                description: "Must be alphanumeric with dashes/underscores",
              },
              campaignName: {
                bsonType: "string",
                minLength: 1,
              },
              status: {
                enum: ["draft", "active", "paused", "completed", "cancelled"],
                description: "Must be valid status",
              },
              createdAt: {
                bsonType: "date",
              },
            },
          },
        },
      });
      console.log("   ✅ campaigns collection created");
    } catch (err) {
      if (err.code === 48) {
        console.log("   ℹ️  campaigns collection already exists");
      } else {
        throw err;
      }
    }

    // Campaigns indexes
    await db
      .collection("campaigns")
      .createIndex({ campaignId: 1 }, { unique: true, name: "idx_campaignId" });
    await db
      .collection("campaigns")
      .createIndex(
        { status: 1, createdAt: -1 },
        { name: "idx_status_createdAt" },
      );
    await db
      .collection("campaigns")
      .createIndex(
        { createdBy: 1, createdAt: -1 },
        { name: "idx_createdBy_createdAt" },
      );
    console.log("   ✅ campaigns indexes created\n");

    // ========================================
    // 2. CAMPAIGN_USERS COLLECTION
    // ========================================
    console.log("📦 Setting up campaign_users collection...");

    try {
      await db.createCollection("campaign_users", {
        validator: {
          $jsonSchema: {
            bsonType: "object",
            required: ["campaignId", "phoneNumber", "agentName", "assignedAt"],
            properties: {
              campaignId: {
                bsonType: "string",
              },
              phoneNumber: {
                bsonType: "string",
                pattern: "^[0-9]{10,15}$",
              },
              agentName: {
                enum: [
                  "hackerAgent",
                  "policyAgent",
                  "riskAgent",
                  "benignAgent",
                ],
              },
              sessionStatus: {
                enum: ["pending", "initiated", "active", "completed", "failed"],
              },
              assignedAt: {
                bsonType: "date",
              },
            },
          },
        },
      });
      console.log("   ✅ campaign_users collection created");
    } catch (err) {
      if (err.code === 48) {
        console.log("   ℹ️  campaign_users collection already exists");
      } else {
        throw err;
      }
    }

    // Campaign users indexes
    await db
      .collection("campaign_users")
      .createIndex(
        { campaignId: 1, phoneNumber: 1 },
        { unique: true, name: "idx_campaign_phone_unique" },
      );
    await db
      .collection("campaign_users")
      .createIndex(
        { campaignId: 1, sessionStatus: 1 },
        { name: "idx_campaign_status" },
      );
    await db
      .collection("campaign_users")
      .createIndex(
        { phoneNumber: 1, assignedAt: -1 },
        { name: "idx_phone_assignedAt" },
      );
    await db
      .collection("campaign_users")
      .createIndex({ agentName: 1, isActive: 1 }, { name: "idx_agent_active" });
    await db
      .collection("campaign_users")
      .createIndex(
        { sessionStatus: 1, lastMessageAt: -1 },
        { name: "idx_status_lastMessage" },
      );
    console.log("   ✅ campaign_users indexes created\n");

    // ========================================
    // 3. CONVERSATIONS COLLECTION (NEW - Replaces chat_history)
    // ========================================
    console.log("📦 Setting up conversations collection...");

    try {
      await db.createCollection("conversations", {
        validator: {
          $jsonSchema: {
            bsonType: "object",
            required: ["phoneNumber", "conversationStartedAt"],
            properties: {
              phoneNumber: {
                bsonType: "string",
                pattern: "^[0-9]{10,15}$",
              },
              campaignId: {
                bsonType: ["string", "null"],
              },
              agentName: {
                enum: [
                  "hackerAgent",
                  "policyAgent",
                  "riskAgent",
                  "benignAgent",
                ],
              },
              conversationStartedAt: {
                bsonType: "date",
              },
              messages: {
                bsonType: "array",
                items: {
                  bsonType: "object",
                  required: ["messageId", "text", "direction", "timestamp"],
                  properties: {
                    messageId: {
                      bsonType: "string",
                    },
                    direction: {
                      enum: ["inbound", "outbound"],
                    },
                  },
                },
              },
              fraud: {
                bsonType: "object",
                required: ["flagged"],
                properties: {
                  flagged: {
                    bsonType: "bool",
                  },
                },
              },
            },
          },
        },
      });
      console.log("   ✅ conversations collection created");
    } catch (err) {
      if (err.code === 48) {
        console.log("   ℹ️  conversations collection already exists");
      } else {
        throw err;
      }
    }

    // Conversations indexes (critical for performance)
    await db
      .collection("conversations")
      .createIndex(
        { phoneNumber: 1, campaignId: 1 },
        { unique: true, name: "idx_phone_campaign_unique" },
      );
    await db
      .collection("conversations")
      .createIndex(
        { phoneNumber: 1, lastMessageAt: -1 },
        { name: "idx_phone_lastMessage" },
      );
    await db
      .collection("conversations")
      .createIndex(
        { campaignId: 1, lastMessageAt: -1 },
        { name: "idx_campaign_lastMessage" },
      );
    await db
      .collection("conversations")
      .createIndex(
        { agentName: 1, lastMessageAt: -1 },
        { name: "idx_agent_lastMessage" },
      );
    await db
      .collection("conversations")
      .createIndex(
        { "fraud.flagged": 1, lastMessageAt: -1 },
        { name: "idx_fraud_lastMessage" },
      );
    await db
      .collection("conversations")
      .createIndex(
        { "messages.messageId": 1 },
        { name: "idx_messages_messageId" },
      );

    // TTL index for automatic deletion (GDPR compliance)
    const retentionDays = parseInt(process.env.CHAT_RETENTION_DAYS) || 365;
    await db
      .collection("conversations")
      .createIndex(
        { retentionExpiry: 1 },
        { expireAfterSeconds: 0, name: "idx_ttl_retention" },
      );
    console.log(
      `   ✅ conversations indexes created (TTL: ${retentionDays} days)\n`,
    );

    // ========================================
    // 4. AUDIT_LOG COLLECTION
    // ========================================
    console.log("📦 Setting up audit_log collection...");

    try {
      await db.createCollection("audit_log");
      console.log("   ✅ audit_log collection created");
    } catch (err) {
      if (err.code === 48) {
        console.log("   ℹ️  audit_log collection already exists");
      } else {
        throw err;
      }
    }

    // Audit log indexes
    await db
      .collection("audit_log")
      .createIndex({ timestamp: -1 }, { name: "idx_timestamp" });
    await db
      .collection("audit_log")
      .createIndex(
        { targetPhoneNumber: 1, timestamp: -1 },
        { name: "idx_phone_timestamp" },
      );
    await db
      .collection("audit_log")
      .createIndex(
        { action: 1, timestamp: -1 },
        { name: "idx_action_timestamp" },
      );

    // TTL index for audit logs (keep for 2 years)
    await db
      .collection("audit_log")
      .createIndex(
        { timestamp: 1 },
        { expireAfterSeconds: 63072000, name: "idx_ttl_2years" },
      );
    console.log("   ✅ audit_log indexes created (TTL: 2 years)\n");

    // ========================================
    // VERIFY SETUP
    // ========================================
    console.log("🔍 Verifying setup...");

    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map((c) => c.name);

    const requiredCollections = [
      "campaigns",
      "campaign_users",
      "chat_history",
      "audit_log",
    ];
    const missingCollections = requiredCollections.filter(
      (c) => !collectionNames.includes(c),
    );

    if (missingCollections.length > 0) {
      console.log(
        `   ⚠️  Missing collections: ${missingCollections.join(", ")}`,
      );
    } else {
      console.log("   ✅ All required collections exist");
    }

    // Show index counts
    for (const collectionName of requiredCollections) {
      if (collectionNames.includes(collectionName)) {
        const indexes = await db.collection(collectionName).indexes();
        console.log(`   📊 ${collectionName}: ${indexes.length} indexes`);
      }
    }

    console.log("\n✅ MongoDB schema setup completed successfully!");
    console.log("\n📝 Next steps:");
    console.log("   1. Review the indexes created");
    console.log("   2. Test with sample data");
    console.log("   3. Start the application: npm start");
  } catch (err) {
    console.error("\n❌ Schema setup failed:", err.message);
    console.error(err);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log("\n🔌 MongoDB connection closed");
    }
  }
}

// Run setup
if (require.main === module) {
  setupSchema();
}

module.exports = { setupSchema };
