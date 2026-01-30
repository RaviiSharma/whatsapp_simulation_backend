/**
 * Enhanced Campaign Routes - Production Grade
 *
 * Endpoints:
 * - GET /api/campaign/:campaignId/users - Get campaign users with details
 * - GET /api/campaign/:campaignId/stats - Get campaign statistics
 * - GET /api/campaign/:campaignId/fraud - Get fraud statistics
 */

const express = require("express");
const router = express.Router();
const mongodb = require("../config/mongodb");
const chatHistory = require("../services/chatHistory.service");

// ============================================
// GET CAMPAIGN USERS WITH FULL DETAILS
// ============================================

/**
 * GET /api/campaign/:campaignId/users
 *
 * Returns complete user information including:
 * - Assignment details
 * - Session status
 * - Last message time
 * - Fraud flags
 * - Message counts
 * - Agent history
 */
router.get("/campaign/:campaignId/users", async (req, res) => {
  try {
    const { campaignId } = req.params;
    const {
      page = 1,
      limit = 50,
      status, // Filter by sessionStatus
      riskLevel, // Filter by fraud risk level
      agentName, // Filter by agent
    } = req.query;

    const db = await mongodb.getDatabase();

    // Build filter
    const filter = { campaignId };
    if (status) filter.sessionStatus = status;
    if (agentName) filter.agentName = agentName;
    if (riskLevel) filter["fraudFlags.riskLevel"] = riskLevel;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get users from campaign_users
    const users = await db
      .collection("campaign_users")
      .find(filter)
      .sort({ assignedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    // Enrich with conversation data
    const enrichedUsers = await Promise.all(
      users.map(async (user) => {
        // Get conversation stats
        const conversation = await chatHistory.getConversation(
          campaignId,
          user.phoneNumber,
        );

        // Get agent history
        const agentHistory = await chatHistory.getAgentHistory(
          campaignId,
          user.phoneNumber,
        );

        return {
          phoneNumber: user.phoneNumber,
          agentName: user.agentName,
          previousAgent: user.previousAgent || null,
          sessionStatus: user.sessionStatus,
          isActive: user.isActive,
          assignedAt: user.assignedAt,
          firstMessageSentAt: user.firstMessageSentAt || null,
          lastMessageAt: conversation?.lastMessageAt || null,

          // Message counts
          messageCounts: {
            total: conversation?.messageCount || 0,
            sent: conversation?.messagesSent || 0,
            received: conversation?.messagesReceived || 0,
          },

          // Fraud information
          fraud: {
            detected: user.fraudFlags?.detected || false,
            riskLevel: user.fraudFlags?.riskLevel || "low",
            lastChecked: user.fraudFlags?.lastCheckedAt || null,
            // Include conversation-level fraud details
            conversationFraud: conversation?.fraud || null,
          },

          // Agent switches
          agentSwitches: agentHistory.length,
          agentHistory: agentHistory.slice(-3), // Last 3 switches

          // Metadata
          metadata: user.metadata || {},
        };
      }),
    );

    // Get total count for pagination
    const total = await db.collection("campaign_users").countDocuments(filter);

    res.json({
      success: true,
      campaignId,
      users: enrichedUsers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
      filters: { status, riskLevel, agentName },
    });
  } catch (err) {
    console.error("❌ Get campaign users failed:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ============================================
// GET CAMPAIGN STATISTICS
// ============================================

/**
 * GET /api/campaign/:campaignId/stats
 *
 * Returns aggregated campaign statistics
 */
router.get("/campaign/:campaignId/stats", async (req, res) => {
  try {
    const { campaignId } = req.params;
    const db = await mongodb.getDatabase();

    // Get campaign details
    const campaign = await db.collection("campaigns").findOne({ campaignId });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: "Campaign not found",
      });
    }

    // User statistics
    const userStats = await db
      .collection("campaign_users")
      .aggregate([
        { $match: { campaignId } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: {
              $sum: { $cond: [{ $eq: ["$sessionStatus", "active"] }, 1, 0] },
            },
            pending: {
              $sum: { $cond: [{ $eq: ["$sessionStatus", "pending"] }, 1, 0] },
            },
            completed: {
              $sum: { $cond: [{ $eq: ["$sessionStatus", "completed"] }, 1, 0] },
            },
          },
        },
      ])
      .toArray();

    // Fraud statistics
    const fraudStats = await db
      .collection("conversations")
      .aggregate([
        { $match: { campaignId } },
        {
          $group: {
            _id: "$fraud.riskLevel",
            count: { $sum: 1 },
            avgConfidence: { $avg: "$fraud.confidence" },
          },
        },
      ])
      .toArray();

    // Agent distribution
    const agentStats = await db
      .collection("campaign_users")
      .aggregate([
        { $match: { campaignId } },
        {
          $group: {
            _id: "$agentName",
            count: { $sum: 1 },
          },
        },
      ])
      .toArray();

    // Message statistics
    const messageStats = await db
      .collection("conversations")
      .aggregate([
        { $match: { campaignId } },
        {
          $group: {
            _id: null,
            totalMessages: { $sum: "$messageCount" },
            totalSent: { $sum: "$messagesSent" },
            totalReceived: { $sum: "$messagesReceived" },
            avgMessagesPerConversation: { $avg: "$messageCount" },
          },
        },
      ])
      .toArray();

    res.json({
      success: true,
      campaignId,
      campaign: {
        name: campaign.name,
        status: campaign.status,
        createdAt: campaign.createdAt,
        startedAt: campaign.startedAt,
      },
      users: userStats[0] || {
        total: 0,
        active: 0,
        pending: 0,
        completed: 0,
      },
      fraud: fraudStats,
      agents: agentStats,
      messages: messageStats[0] || {
        totalMessages: 0,
        totalSent: 0,
        totalReceived: 0,
        avgMessagesPerConversation: 0,
      },
    });
  } catch (err) {
    console.error("❌ Get campaign stats failed:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ============================================
// GET CAMPAIGN FRAUD DETAILS
// ============================================

/**
 * GET /api/campaign/:campaignId/fraud
 *
 * Returns detailed fraud analysis for campaign
 */
router.get("/campaign/:campaignId/fraud", async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { riskLevel } = req.query; // Filter by risk level

    const db = await mongodb.getDatabase();

    // Build filter
    const filter = { campaignId, "fraud.flagged": true };
    if (riskLevel) filter["fraud.riskLevel"] = riskLevel;

    // Get flagged conversations
    const flaggedConversations = await db
      .collection("conversations")
      .find(filter)
      .sort({ "fraud.detectedAt": -1 })
      .limit(100)
      .toArray();

    // Extract fraud summaries
    const fraudCases = flaggedConversations.map((conv) => ({
      phoneNumber: conv.phoneNumber,
      conversationId: conv.conversationId,
      riskLevel: conv.fraud.riskLevel,
      confidence: conv.fraud.confidence,
      reasons: conv.fraud.reasons,
      detectedAt: conv.fraud.detectedAt,
      blockedUser: conv.fraud.blockedUser,
      currentAgent: conv.currentAgentName,
      messageCount: conv.messageCount,
    }));

    // Aggregate statistics
    const summary = await db
      .collection("conversations")
      .aggregate([
        { $match: { campaignId, "fraud.flagged": true } },
        {
          $group: {
            _id: "$fraud.riskLevel",
            count: { $sum: 1 },
            avgConfidence: { $avg: "$fraud.confidence" },
            blocked: {
              $sum: { $cond: ["$fraud.blockedUser", 1, 0] },
            },
          },
        },
      ])
      .toArray();

    res.json({
      success: true,
      campaignId,
      summary,
      cases: fraudCases,
      total: fraudCases.length,
    });
  } catch (err) {
    console.error("❌ Get campaign fraud failed:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;
