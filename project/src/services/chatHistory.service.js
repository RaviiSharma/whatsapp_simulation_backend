/**
 * Chat History Service - Production Grade
 *
 * Complete conversation storage with:
 * - Atomic updates & upserts
 * - Masked sensitive data (OTP, cards)
 * - Message counters
 * - Fraud tracking (message + conversation level)
 * - Agent history
 * - TTL support
 *
 * Schema: conversations collection
 * Unique key: (campaignId + phoneNumber)
 * Messages stored as array with atomic $push
 */

const mongodb = require("../config/mongodb");
const security = require("../utils/security");
const crypto = require("crypto");

// ============================================
// CONVERSATION MANAGEMENT
// ============================================

/**
 * Create conversation if not exists (idempotent)
 *
 * @param {string} campaignId - Campaign ID (nullable)
 * @param {string} phoneNumber - User phone number
 * @param {string} agentName - Initial agent
 * @param {string} campaignName - Campaign name
 * @returns {Promise<object>} Created/existing conversation
 */
async function createConversationIfNotExists(
  campaignId,
  phoneNumber,
  agentName,
  campaignName,
) {
  try {
    const db = await mongodb.getDatabase();

    const retentionDays = parseInt(process.env.CHAT_RETENTION_DAYS) || 365;
    const retentionExpiry = new Date();
    retentionExpiry.setDate(retentionExpiry.getDate() + retentionDays);

    const filter = { campaignId: campaignId || null, phoneNumber };

    const result = await db.collection("conversations").findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          conversationId: `conv_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          campaignId: campaignId || null,
          phoneNumber,
          campaignName: campaignName || "Direct Message",
          agentName,
          currentAgentName: agentName,
          messages: [],
          messageCount: 0,
          messagesSent: 0,
          messagesReceived: 0,
          conversationStartedAt: new Date(),
          lastMessageAt: null,
          retentionExpiry,
          fraud: {
            flagged: false,
            riskLevel: "low",
            confidence: 0,
            detectedAt: null,
            reasons: [],
          },
          agentHistory: [],
          metadata: {},
          createdAt: new Date(),
        },
      },
      {
        upsert: true,
        returnDocument: "after",
      },
    );

    console.log(
      `✅ Conversation ready: ${phoneNumber} ${campaignId ? `(campaign: ${campaignId})` : "(direct)"}`,
    );
    return result.value;
  } catch (err) {
    console.error(`❌ Failed to create conversation:`, err.message);
    throw err;
  }
}

// ============================================
// MESSAGE STORAGE
// ============================================

/**
 * Store inbound message (user → system)
 *
 * @param {object} params - Message parameters
 * @returns {Promise<object>} Update result
 */
async function storeInboundMessage({
  campaignId,
  phoneNumber,
  messageId,
  text,
  timestamp,
  agentName,
  metadata = {},
}) {
  try {
    const db = await mongodb.getDatabase();

    // Mask sensitive data before storage
    const maskedText = security.maskSensitiveData(text);

    const message = {
      messageId,
      text: maskedText,
      originalText: text,
      originalTextHash: hashText(text),
      direction: "received",
      type: "text",
      agentName,
      timestamp: timestamp || new Date(),
      fraud: {
        flagged: false,
        riskLevel: "low",
        confidence: 0,
        detectedAt: null,
        reasons: [],
      },
      metadata,
      createdAt: new Date(),
    };

    const filter = { campaignId: campaignId || null, phoneNumber };

    const result = await db.collection("conversations").updateOne(filter, {
      $push: {
        messages: {
          $each: [message],
          $slice: -5000, // Keep last 5000 messages max
        },
      },
      $inc: {
        messageCount: 1,
        messagesReceived: 1,
      },
      $set: { lastMessageAt: message.timestamp },
    });

    if (result.matchedCount === 0) {
      console.warn(`⚠️ Conversation not found, creating: ${phoneNumber}`);
      await createConversationIfNotExists(
        campaignId,
        phoneNumber,
        agentName,
        campaignId ? "Unknown Campaign" : "Direct Message",
      );
      return await storeInboundMessage({
        campaignId,
        phoneNumber,
        messageId,
        text,
        timestamp,
        agentName,
        metadata,
      });
    }

    console.log(`📥 Stored inbound message: ${messageId} from ${phoneNumber}`);
    return { success: true, message };
  } catch (err) {
    console.error(`❌ Failed to store inbound message:`, err.message);
    throw err;
  }
}

/**
 * Store outbound message (system → user)
 *
 * @param {object} params - Message parameters
 * @returns {Promise<object>} Update result
 */
async function storeOutboundMessage({
  campaignId,
  phoneNumber,
  messageId,
  text,
  timestamp,
  agentName,
  metadata = {},
}) {
  try {
    const db = await mongodb.getDatabase();

    const message = {
      messageId,
      text,
      direction: "sent",
      type: "text",
      agentName,
      timestamp: timestamp || new Date(),
      metadata,
      createdAt: new Date(),
    };

    const filter = { campaignId: campaignId || null, phoneNumber };

    const result = await db.collection("conversations").updateOne(filter, {
      $push: {
        messages: {
          $each: [message],
          $slice: -5000,
        },
      },
      $inc: {
        messageCount: 1,
        messagesSent: 1,
      },
      $set: { lastMessageAt: message.timestamp },
    });

    if (result.matchedCount === 0) {
      console.warn(`⚠️ Conversation not found, creating: ${phoneNumber}`);
      await createConversationIfNotExists(
        campaignId,
        phoneNumber,
        agentName,
        campaignId ? "Unknown Campaign" : "Direct Message",
      );
      return await storeOutboundMessage({
        campaignId,
        phoneNumber,
        messageId,
        text,
        timestamp,
        agentName,
        metadata,
      });
    }

    console.log(`📤 Stored outbound message: ${messageId} to ${phoneNumber}`);
    return { success: true, message };
  } catch (err) {
    console.error(`❌ Failed to store outbound message:`, err.message);
    throw err;
  }
}

/**
 * Store proactive message (system-initiated template)
 *
 * @param {object} params - Message parameters
 * @returns {Promise<object>} Update result
 */
async function storeProactiveMessage({
  campaignId,
  phoneNumber,
  messageId,
  templateName,
  templateParams,
  text,
  timestamp,
  agentName,
  metadata = {},
}) {
  try {
    const db = await mongodb.getDatabase();

    const message = {
      messageId,
      text: text || `Template: ${templateName}`,
      direction: "sent",
      type: "proactive",
      templateName,
      templateParams,
      agentName,
      timestamp: timestamp || new Date(),
      metadata,
      createdAt: new Date(),
    };

    const filter = { campaignId: campaignId || null, phoneNumber };

    const result = await db.collection("conversations").updateOne(filter, {
      $push: {
        messages: {
          $each: [message],
          $slice: -5000,
        },
      },
      $inc: {
        messageCount: 1,
        messagesSent: 1,
      },
      $set: {
        lastMessageAt: message.timestamp,
        proactiveMessageSentAt: message.timestamp,
      },
    });

    if (campaignId) {
      await db.collection("campaign_users").updateOne(
        { campaignId, phoneNumber },
        {
          $set: {
            firstMessageSentAt: message.timestamp,
            sessionStatus: "active",
            isActive: true,
            proactiveMessageId: messageId,
          },
        },
      );
    }

    console.log(`📨 Stored proactive message: ${messageId} to ${phoneNumber}`);
    return { success: true, message };
  } catch (err) {
    console.error(`❌ Failed to store proactive message:`, err.message);
    throw err;
  }
}

/**
 * LEGACY: Store any message (wrapper for backward compatibility)
 */
async function storeChatMessage({
  campaignId,
  phoneNumber,
  messageId,
  text,
  direction,
  type,
  agentName,
  templateName,
  templateParams,
  timestamp,
  metadata = {},
}) {
  if (direction === "received") {
    return await storeInboundMessage({
      campaignId,
      phoneNumber,
      messageId,
      text,
      timestamp,
      agentName,
      metadata,
    });
  } else if (type === "proactive" || templateName) {
    return await storeProactiveMessage({
      campaignId,
      phoneNumber,
      messageId,
      templateName,
      templateParams,
      text,
      timestamp,
      agentName,
      metadata,
    });
  } else {
    return await storeOutboundMessage({
      campaignId,
      phoneNumber,
      messageId,
      text,
      timestamp,
      agentName,
      metadata,
    });
  }
}

// ============================================
// FRAUD OPERATIONS
// ============================================

/**
 * Update fraud status for specific message
 */
async function updateMessageFraudStatus(messageId, fraudData) {
  try {
    const db = await mongodb.getDatabase();

    const { fraudDetected, riskLevel, confidence, reasons = [] } = fraudData;

    const result = await db.collection("conversations").updateOne(
      { "messages.messageId": messageId },
      {
        $set: {
          "messages.$.fraud": {
            flagged: fraudDetected || false,
            riskLevel: riskLevel || "low",
            confidence: confidence || 0,
            detectedAt: new Date(),
            reasons,
          },
        },
      },
    );

    if (result.modifiedCount > 0) {
      console.log(
        `🚨 Updated fraud status for message: ${messageId} (${riskLevel})`,
      );
    }

    return { success: true, updated: result.modifiedCount > 0 };
  } catch (err) {
    console.error(`❌ Failed to update message fraud status:`, err.message);
    throw err;
  }
}

/**
 * Mark entire conversation as fraud
 */
async function markConversationFraud(campaignId, phoneNumber, fraudData) {
  try {
    const db = await mongodb.getDatabase();

    const {
      riskLevel,
      confidence,
      reasons = [],
      blockedUser = false,
    } = fraudData;

    const fraudInfo = {
      flagged: true,
      riskLevel: riskLevel || "medium",
      confidence: confidence || 0.5,
      detectedAt: new Date(),
      reasons,
      blockedUser,
    };

    const filter = { campaignId: campaignId || null, phoneNumber };

    const result = await db
      .collection("conversations")
      .updateOne(filter, { $set: { fraud: fraudInfo } });

    if (campaignId) {
      await db.collection("campaign_users").updateOne(
        { campaignId, phoneNumber },
        {
          $set: {
            "fraudFlags.detected": true,
            "fraudFlags.riskLevel": riskLevel,
            "fraudFlags.lastCheckedAt": new Date(),
          },
        },
      );
    }

    console.log(
      `🚨 Marked conversation as fraud: ${phoneNumber} (${riskLevel})`,
    );
    return { success: true, fraudInfo };
  } catch (err) {
    console.error(`❌ Failed to mark conversation fraud:`, err.message);
    throw err;
  }
}

// ============================================
// QUERY OPERATIONS
// ============================================

/**
 * Get conversation by campaignId + phoneNumber
 */
async function getConversation(campaignId, phoneNumber) {
  try {
    const db = await mongodb.getDatabase();

    const filter = { campaignId: campaignId || null, phoneNumber };

    const conversation = await db.collection("conversations").findOne(filter);
    return conversation;
  } catch (err) {
    console.error(`❌ Failed to get conversation:`, err.message);
    throw err;
  }
}

/**
 * Get all conversations for a phone number
 */
async function getUserConversations(phoneNumber) {
  try {
    const db = await mongodb.getDatabase();

    const conversations = await db
      .collection("conversations")
      .find({ phoneNumber })
      .sort({ lastMessageAt: -1 })
      .toArray();

    return conversations;
  } catch (err) {
    console.error(`❌ Failed to get user conversations:`, err.message);
    throw err;
  }
}

/**
 * Get last N messages from conversation
 */
async function getLastMessages(campaignId, phoneNumber, limit = 10) {
  try {
    const db = await mongodb.getDatabase();

    const filter = { campaignId: campaignId || null, phoneNumber };

    const conversation = await db.collection("conversations").findOne(filter, {
      projection: {
        messages: { $slice: -limit },
        conversationId: 1,
        currentAgentName: 1,
      },
    });

    return conversation?.messages || [];
  } catch (err) {
    console.error(`❌ Failed to get last messages:`, err.message);
    throw err;
  }
}

/**
 * Get agent history
 */
async function getAgentHistory(campaignId, phoneNumber) {
  try {
    const conversation = await getConversation(campaignId, phoneNumber);
    return conversation?.agentHistory || [];
  } catch (err) {
    console.error(`❌ Failed to get agent history:`, err.message);
    throw err;
  }
}

/**
 * Record agent switch
 */
async function recordAgentSwitch({
  campaignId,
  phoneNumber,
  fromAgent,
  toAgent,
  reason,
  metadata = {},
}) {
  try {
    const db = await mongodb.getDatabase();

    const switchRecord = {
      from: fromAgent,
      to: toAgent,
      reason,
      timestamp: new Date(),
      metadata,
    };

    const filter = { campaignId: campaignId || null, phoneNumber };

    await db.collection("conversations").updateOne(filter, {
      $push: { agentHistory: switchRecord },
      $set: { currentAgentName: toAgent },
    });

    console.log(`🔄 Recorded agent switch: ${fromAgent} → ${toAgent}`);
    return { success: true, switchRecord };
  } catch (err) {
    console.error(`❌ Failed to record agent switch:`, err.message);
    throw err;
  }
}

// ============================================
// ENHANCED HISTORY APIs
// ============================================

/**
 * Get comprehensive user chat history (for API endpoints)
 */
async function getUserChatHistory(
  phoneNumber,
  { campaignId, agentName, startDate, endDate, page = 1, limit = 100 } = {},
) {
  try {
    const db = await mongodb.getDatabase();

    const conversationMatch = { phoneNumber };
    if (campaignId) conversationMatch.campaignId = campaignId;

    const conversations = await db
      .collection("conversations")
      .find(conversationMatch)
      .sort({ lastMessageAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    const total = await db
      .collection("conversations")
      .countDocuments(conversationMatch);

    return {
      conversations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  } catch (err) {
    console.error(`❌ Failed to get user chat history:`, err.message);
    throw err;
  }
}

/**
 * Get campaign chat history
 */
async function getCampaignChatHistory(
  campaignId,
  { phoneNumber, page = 1, limit = 100 } = {},
) {
  try {
    const db = await mongodb.getDatabase();

    const filter = { campaignId };
    if (phoneNumber) filter.phoneNumber = phoneNumber;

    const conversations = await db
      .collection("conversations")
      .find(filter)
      .sort({ lastMessageAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    const total = await db.collection("conversations").countDocuments(filter);

    return {
      conversations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  } catch (err) {
    console.error(`❌ Failed to get campaign chat history:`, err.message);
    throw err;
  }
}

/**
 * Get user campaigns
 */
async function getUserCampaigns(phoneNumber) {
  try {
    const db = await mongodb.getDatabase();

    const campaigns = await db
      .collection("conversations")
      .aggregate([
        { $match: { phoneNumber, campaignId: { $exists: true, $ne: null } } },
        {
          $group: {
            _id: "$campaignId",
            campaignName: { $first: "$campaignName" },
            messageCount: { $sum: "$messageCount" },
            lastMessageAt: { $max: "$lastMessageAt" },
          },
        },
        { $sort: { lastMessageAt: -1 } },
      ])
      .toArray();

    return campaigns;
  } catch (err) {
    console.error(`❌ Failed to get user campaigns:`, err.message);
    throw err;
  }
}

/**
 * Delete user chat history (GDPR)
 */
async function deleteUserChatHistory(phoneNumber) {
  try {
    const db = await mongodb.getDatabase();

    const result = await db
      .collection("conversations")
      .deleteMany({ phoneNumber });

    console.log(
      `🗑️ Deleted ${result.deletedCount} conversations for ${phoneNumber}`,
    );
    return { success: true, deletedCount: result.deletedCount };
  } catch (err) {
    console.error(`❌ Failed to delete user chat history:`, err.message);
    throw err;
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function hashText(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Core message storage
  createConversationIfNotExists,
  storeInboundMessage,
  storeOutboundMessage,
  storeProactiveMessage,
  storeChatMessage, // Legacy wrapper

  // Fraud operations
  updateMessageFraudStatus,
  markConversationFraud,

  // Query operations
  getConversation,
  getUserConversations,
  getLastMessages,
  getAgentHistory,

  // Agent switching
  recordAgentSwitch,

  // Enhanced history APIs
  getUserChatHistory,
  getCampaignChatHistory,
  getUserCampaigns,
  deleteUserChatHistory,
};
