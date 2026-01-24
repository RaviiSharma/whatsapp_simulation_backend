/**
 * Admin Routes
 *
 * Provides monitoring, statistics, and admin endpoints
 */

const express = require("express");
const router = express.Router();

const sessionStore = require("../services/sessionStore.service");
const agentRouter = require("../services/agentRouter.service");
const deduplication = require("../utils/deduplication");
const mongodb = require("../config/mongodb");

/**
 * GET /admin/stats
 *
 * System-wide statistics
 */
router.get("/stats", async (req, res) => {
  try {
    const routingStats = await agentRouter.getRoutingStats();
    const dedupStats = await deduplication.getStats();

    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      routing: routingStats,
      deduplication: dedupStats,
      storage: mongodb.getStatus(),
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

/**
 * GET /admin/agents
 *
 * Agent load distribution
 */
router.get("/agents", async (req, res) => {
  try {
    const agentLoads = await sessionStore.getAllAgentLoads();

    res.json({
      availableAgents: agentRouter.AVAILABLE_AGENTS,
      loads: agentLoads,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

/**
 * GET /admin/user/:userId
 *
 * Get user session info
 */
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const session = await sessionStore.getSession(userId);

    if (!session) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    res.json({
      userId,
      session,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

/**
 * POST /admin/user/:userId/reassign
 *
 * Manually reassign user to different agent
 * (Use with caution - breaks stickiness)
 */
router.post("/user/:userId/reassign", async (req, res) => {
  try {
    const { userId } = req.params;
    const { agentName } = req.body;

    if (!agentName) {
      return res.status(400).json({
        error: "agentName is required",
      });
    }

    if (!agentRouter.isValidAgent(agentName)) {
      return res.status(400).json({
        error: `Invalid agent: ${agentName}`,
        availableAgents: agentRouter.AVAILABLE_AGENTS,
      });
    }

    const success = await agentRouter.reassignAgent(userId, agentName);

    if (success) {
      res.json({
        success: true,
        message: `User ${userId} reassigned to ${agentName}`,
      });
    } else {
      res.status(500).json({
        error: "Reassignment failed",
      });
    }
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

/**
 * DELETE /admin/user/:userId
 *
 * Clear user session (testing only)
 */
router.delete("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    await sessionStore.clearSession(userId);

    res.json({
      success: true,
      message: `Session cleared for ${userId}`,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

/**
 * GET /admin/health
 *
 * Detailed health check
 */
router.get("/health", async (req, res) => {
  try {
    const mongoStatus = mongodb.getStatus();
    const stats = await sessionStore.getStats();

    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      mongodb: mongoStatus.mongodb ? "connected" : "fallback",
      totalUsers: stats.totalUsers,
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB",
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + "MB",
      },
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

module.exports = router;
