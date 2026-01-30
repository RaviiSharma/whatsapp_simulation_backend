/**
 * Campaign Routes
 *
 * REST API endpoints for campaign management and chat history
 */

const express = require("express");
const router = express.Router();
const campaignService = require("../services/campaign.service");
const chatHistory = require("../services/chatHistory.service");
const mongodb = require("../config/mongodb");

/**
 * POST /api/campaign/create
 * Create new campaign with agent assignments
 */
router.post("/create", async (req, res) => {
  try {
    const {
      campaignId,
      campaignName,
      templateName,
      templateParams,
      agentAssignments,
      settings,
    } = req.body;

    // Validation
    if (!campaignId || !campaignName || !agentAssignments) {
      return res.status(400).json({
        success: false,
        error:
          "Missing required fields: campaignId, campaignName, agentAssignments",
      });
    }

    const result = await campaignService.createCampaign({
      campaignId,
      campaignName,
      templateName,
      templateParams,
      agentAssignments,
      settings,
      createdBy: req.body.adminId || "admin",
    });

    res.json(result);
  } catch (err) {
    console.error("❌ Campaign creation failed:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/campaign/start
 * Start campaign and initiate proactive messaging
 */
router.post("/start", async (req, res) => {
  try {
    const { campaignId, startImmediately = true, throttle } = req.body;

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: campaignId",
      });
    }

    // Start campaign asynchronously if immediate
    if (startImmediately) {
      // Return response immediately and process in background
      res.json({
        success: true,
        campaignId,
        status: "processing",
        message: "Campaign start initiated. Processing users in background.",
      });

      // Process in background
      campaignService.startCampaign(campaignId, { throttle }).catch((err) => {
        console.error(`❌ Background campaign start failed:`, err.message);
      });
    } else {
      const result = await campaignService.startCampaign(campaignId, {
        throttle,
      });
      res.json(result);
    }
  } catch (err) {
    console.error("❌ Campaign start failed:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/campaign/:campaignId
 * Get campaign details and statistics
 */
router.get("/:campaignId", async (req, res) => {
  try {
    const { campaignId } = req.params;
    const result = await campaignService.getCampaign(campaignId);
    res.json(result);
  } catch (err) {
    console.error("❌ Get campaign failed:", err.message);
    res.status(404).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/campaign/:campaignId/users
 * List all users in campaign with their status
 */
router.get("/:campaignId/users", async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { status, agentName, page, limit } = req.query;

    const result = await campaignService.getCampaignUsers(campaignId, {
      status,
      agentName,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
    });

    res.json(result);
  } catch (err) {
    console.error("❌ Get campaign users failed:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/campaign/:campaignId/chat-history
 * Get all chat messages for a campaign
 */
router.get("/:campaignId/chat-history", async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { phoneNumber, agentName, direction, page, limit } = req.query;

    const result = await chatHistory.getCampaignChatHistory(campaignId, {
      phoneNumber,
      agentName,
      direction,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 100,
    });

    res.json({
      success: true,
      campaignId,
      ...result,
    });
  } catch (err) {
    console.error("❌ Get campaign chat history failed:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * PATCH /api/campaign/:campaignId/status
 * Update campaign status
 */
router.patch("/:campaignId/status", async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: status",
      });
    }

    const result = await campaignService.updateCampaignStatus(
      campaignId,
      status,
    );
    res.json(result);
  } catch (err) {
    console.error("❌ Update campaign status failed:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/user/:phoneNumber/history
 * Get complete chat history for a user (across all campaigns)
 * Returns only conversation messages in clean format
 */
router.get("/user/:phoneNumber/history", async (req, res) => {
  try {
    const { phoneNumber } = req.params;

    // Get all conversations for this user
    const conversations = await chatHistory.getUserConversations(phoneNumber);

    if (conversations.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No conversations found for this user",
      });
    }

    // Format simplified conversation history - just messages
    const history = conversations
      .filter((conv) => conv.messages && conv.messages.length > 0) // Only conversations with messages
      .map((conversation) => {
        return {
          campaign: conversation.campaignName || "Direct Message",
          startedAt: conversation.conversationStartedAt,
          conversation: conversation.messages.map((msg) => ({
            from: msg.direction === "received" ? "user" : msg.agentName,
            message: msg.text?.maskedText || msg.text || msg.originalText,
            time: msg.timestamp,
          })),
        };
      });

    res.json({
      success: true,
      phoneNumber,
      conversations: history,
    });
  } catch (err) {
    console.error("❌ Get user history failed:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/user/:phoneNumber/campaigns
 * List all campaigns a user has participated in
 */
router.get("/user/:phoneNumber/campaigns", async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const campaigns = await chatHistory.getUserCampaigns(phoneNumber);

    res.json({
      success: true,
      phoneNumber,
      totalCampaigns: campaigns.length,
      campaigns,
    });
  } catch (err) {
    console.error("❌ Get user campaigns failed:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/analytics/campaign/:campaignId
 * Detailed campaign analytics and metrics
 */
router.get("/analytics/campaign/:campaignId", async (req, res) => {
  try {
    const { campaignId } = req.params;
    const db = await mongodb.getDatabase();

    // Get campaign
    const campaign = await db.collection("campaigns").findOne({ campaignId });
    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: "Campaign not found",
      });
    }

    // Get users
    const users = await db
      .collection("campaign_users")
      .find({ campaignId })
      .toArray();

    // Get messages
    const messages = await db
      .collection("chat_history")
      .find({ campaignId })
      .toArray();

    // Calculate analytics
    const activeUsers = users.filter((u) => u.isActive).length;
    const completedUsers = users.filter((u) => u.isCompleted).length;
    const totalMessages = messages.length;
    const messagesSent = messages.filter(
      (m) => m.message.direction === "outbound",
    ).length;
    const messagesReceived = messages.filter(
      (m) => m.message.direction === "inbound",
    ).length;
    const fraudFlagged = messages.filter((m) => m.fraud.flagged).length;

    // Fraud breakdown by risk level
    const fraudByRiskLevel = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };
    messages
      .filter((m) => m.fraud.flagged)
      .forEach((m) => {
        fraudByRiskLevel[m.fraud.riskLevel] =
          (fraudByRiskLevel[m.fraud.riskLevel] || 0) + 1;
      });

    // Top fraud reasons
    const fraudReasons = {};
    messages
      .filter((m) => m.fraud.flagged)
      .forEach((m) => {
        (m.fraud.reasons || []).forEach((reason) => {
          fraudReasons[reason] = (fraudReasons[reason] || 0) + 1;
        });
      });
    const topReasons = Object.entries(fraudReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count }));

    res.json({
      success: true,
      campaignId,
      analytics: {
        overview: {
          totalUsers: users.length,
          activeUsers,
          completedUsers,
          conversionRate: users.length > 0 ? completedUsers / users.length : 0,
          avgMessagesPerConversation:
            users.length > 0 ? totalMessages / users.length : 0,
        },
        messageFlow: {
          totalSent: messagesSent,
          totalReceived: messagesReceived,
          responseRate: messagesSent > 0 ? messagesReceived / messagesSent : 0,
        },
        fraudDetection: {
          totalFlagged: fraudFlagged,
          byRiskLevel: fraudByRiskLevel,
          topReasons,
        },
      },
    });
  } catch (err) {
    console.error("❌ Get campaign analytics failed:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/user/:phoneNumber/delete
 * Delete all user data (GDPR compliance)
 */
router.post("/user/:phoneNumber/delete", async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const { reason, adminId } = req.body;

    if (!reason || !adminId) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: reason, adminId",
      });
    }

    console.log(`🗑️ Deleting all data for user ${phoneNumber}`);

    const db = await mongodb.getDatabase();

    // Delete from all collections
    const [chatMessages, campaignUsers, fraudReports, sessions] =
      await Promise.all([
        chatHistory.deleteUserChatHistory(phoneNumber),
        db.collection("campaign_users").deleteMany({ phoneNumber }),
        db.collection("fraud_reports").deleteMany({ phoneNumber }),
        db.collection("sessions").deleteMany({ userId: phoneNumber }),
      ]);

    // Log deletion for audit
    await db.collection("audit_log").insertOne({
      action: "USER_DATA_DELETED",
      phoneNumber,
      reason,
      userId: adminId,
      timestamp: new Date(),
      deletedData: {
        chatMessages,
        campaignUsers: campaignUsers.deletedCount,
        fraudReports: fraudReports.deletedCount,
        sessions: sessions.deletedCount,
      },
    });

    console.log(`✅ Deleted all data for ${phoneNumber}`);

    res.json({
      success: true,
      phoneNumber,
      deletedData: {
        chatMessages,
        campaignUsers: campaignUsers.deletedCount,
        fraudReports: fraudReports.deletedCount,
        sessions: sessions.deletedCount,
      },
      deletedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("❌ User deletion failed:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;
