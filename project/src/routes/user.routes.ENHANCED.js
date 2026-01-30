/**
 * Enhanced User Routes - Production Grade
 *
 * Endpoints:
 * - GET /api/user/:phone/history - Full conversation history across campaigns
 * - GET /api/user/:phone/fraud - Fraud history for user
 * - GET /api/user/:phone/agents - Agent transition history
 */

const express = require("express");
const router = express.Router();
const chatHistory = require("../services/chatHistory.service");
const mongodb = require("../config/mongodb");

// ============================================
// GET USER FULL HISTORY (ALL CAMPAIGNS)
// ============================================

/**
 * GET /api/user/:phone/history
 *
 * Returns complete conversation history grouped by campaign:
 * - All messages
 * - Agent transitions
 * - Fraud timeline
 * - Session details
 */
router.get("/user/:phone/history", async (req, res) => {
  try {
    const { phone } = req.params;

    // Get all conversations for this user
    const conversations = await chatHistory.getUserConversations(phone);

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
      phoneNumber: phone,
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

// ============================================
// GET USER FRAUD HISTORY
// ============================================

/**
 * GET /api/user/:phone/fraud
 *
 * Returns fraud detection history across all campaigns
 */
router.get("/user/:phone/fraud", async (req, res) => {
  try {
    const { phone } = req.params;
    const db = await mongodb.getDatabase();

    // Get all fraud-flagged conversations
    const fraudConversations = await db
      .collection("conversations")
      .find({
        phoneNumber: phone,
        "fraud.flagged": true,
      })
      .sort({ "fraud.detectedAt": -1 })
      .toArray();

    // Get fraud reports
    const fraudReports = await db
      .collection("fraud_reports")
      .find({ phoneNumber: phone })
      .sort({ detectedAt: -1 })
      .toArray();

    // Extract fraud events from messages
    const fraudMessages = [];
    for (const conv of fraudConversations) {
      for (const msg of conv.messages || []) {
        if (msg.fraud?.flagged) {
          fraudMessages.push({
            campaignId: conv.campaignId,
            conversationId: conv.conversationId,
            messageId: msg.messageId,
            messageText: msg.text,
            direction: msg.direction,
            timestamp: msg.timestamp,
            riskLevel: msg.fraud.riskLevel,
            confidence: msg.fraud.confidence,
            reasons: msg.fraud.reasons,
          });
        }
      }
    }

    // Sort all fraud events by time
    fraudMessages.sort((a, b) => b.timestamp - a.timestamp);

    // Calculate risk score trend
    const riskTrend = fraudMessages.map((msg, index) => ({
      timestamp: msg.timestamp,
      confidence: msg.confidence,
      riskLevel: msg.riskLevel,
      eventNumber: fraudMessages.length - index,
    }));

    // Summary
    const summary = {
      totalFraudEvents: fraudMessages.length,
      conversationsFlagged: fraudConversations.length,
      reportsGenerated: fraudReports.length,
      highestRiskLevel: fraudConversations.reduce((max, conv) => {
        const levels = { low: 1, medium: 2, high: 3 };
        return levels[conv.fraud.riskLevel] > levels[max]
          ? conv.fraud.riskLevel
          : max;
      }, "low"),
      currentlyBlocked: fraudConversations.some((c) => c.fraud.blockedUser),
    };

    res.json({
      success: true,
      phoneNumber: phone,
      summary,
      fraudMessages,
      riskTrend,
      fraudReports,
    });
  } catch (err) {
    console.error("❌ Get user fraud history failed:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ============================================
// GET USER AGENT TRANSITIONS
// ============================================

/**
 * GET /api/user/:phone/agents
 *
 * Returns agent switching history across all campaigns
 */
router.get("/user/:phone/agents", async (req, res) => {
  try {
    const { phone } = req.params;
    const db = await mongodb.getDatabase();

    // Get all conversations with agent history
    const conversations = await db
      .collection("conversations")
      .find({ phoneNumber: phone })
      .project({
        campaignId: 1,
        conversationId: 1,
        agentName: 1,
        currentAgentName: 1,
        agentHistory: 1,
        conversationStartedAt: 1,
      })
      .sort({ conversationStartedAt: -1 })
      .toArray();

    // Flatten agent transitions
    const allTransitions = [];
    for (const conv of conversations) {
      for (const transition of conv.agentHistory || []) {
        allTransitions.push({
          campaignId: conv.campaignId,
          conversationId: conv.conversationId,
          from: transition.from,
          to: transition.to,
          reason: transition.reason,
          timestamp: transition.timestamp,
          metadata: transition.metadata,
        });
      }
    }

    // Sort by time
    allTransitions.sort((a, b) => b.timestamp - a.timestamp);

    // Agent statistics
    const agentStats = {};
    conversations.forEach((conv) => {
      const agent = conv.currentAgentName;
      if (!agentStats[agent]) {
        agentStats[agent] = {
          agentName: agent,
          conversationCount: 0,
          transitionsTo: 0,
          transitionsFrom: 0,
        };
      }
      agentStats[agent].conversationCount++;

      // Count transitions
      (conv.agentHistory || []).forEach((t) => {
        if (t.to === agent) agentStats[agent].transitionsTo++;
        if (t.from === agent) agentStats[agent].transitionsFrom++;
      });
    });

    // Summary
    const summary = {
      totalConversations: conversations.length,
      totalTransitions: allTransitions.length,
      currentAgents: conversations.map((c) => ({
        campaignId: c.campaignId,
        agentName: c.currentAgentName,
      })),
      agentStats: Object.values(agentStats),
    };

    res.json({
      success: true,
      phoneNumber: phone,
      summary,
      transitions: allTransitions,
    });
  } catch (err) {
    console.error("❌ Get user agent history failed:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;
