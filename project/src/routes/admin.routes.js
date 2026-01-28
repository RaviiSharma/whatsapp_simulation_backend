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
const fraudReport = require("../services/fraudReport.service");
const fraudDetection = require("../services/fraudDetection.service");
const sessionWindow = require("../services/sessionWindow.service");
const redis = require("../config/redis");

/**
 * GET /admin/stats
 *
 * System-wide statistics
 */
router.get("/stats", async (req, res) => {
  try {
    const routingStats = await agentRouter.getRoutingStats();
    const dedupStats = await deduplication.getStats();
    const fraudStats = await fraudReport.getFraudReportStats();

    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      routing: routingStats,
      deduplication: dedupStats,
      fraud: fraudStats,
      storage: {
        mongodb: mongodb.getStatus(),
        redis: redis.getStatus(),
      },
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

    res.json({
      success: true,
      message: `User ${userId} reassigned to ${agentName}`,
    });
  } catch (err) {
    console.error(
      `❌ Reassignment failed for ${req.params.userId}:`,
      err.message,
    );

    // Handle specific error cases
    if (err.message.includes("has no session")) {
      return res.status(404).json({
        error: "Reassignment failed",
        reason: "User session not found",
        details: `User ${req.params.userId} has not sent any messages yet`,
      });
    }

    if (err.message.includes("Invalid or disallowed agent")) {
      return res.status(400).json({
        error: "Reassignment failed",
        reason: err.message,
      });
    }

    // Generic error
    res.status(500).json({
      error: "Reassignment failed",
      reason: err.message,
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
    const redisStatus = redis.getStatus();
    const stats = await sessionStore.getStats();

    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      mongodb: mongoStatus.mongodb ? "connected" : "fallback",
      redis: redisStatus.redis ? "connected" : "fallback",
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

// ============================================================
// FRAUD MANAGEMENT ROUTES
// ============================================================

/**
 * GET /admin/fraud/reports
 *
 * Get fraud reports with filtering
 * Query params: status, riskLevel, limit
 */
router.get("/fraud/reports", async (req, res) => {
  try {
    const { status, riskLevel, limit } = req.query;

    let reports;

    if (status) {
      reports = await fraudReport.getFraudReportsByStatus(
        status,
        parseInt(limit || 50),
      );
    } else if (riskLevel) {
      reports = await fraudReport.getFraudReportsByRiskLevel(
        riskLevel,
        parseInt(limit || 50),
      );
    } else {
      // Get all reports (no filter) - changed from "new" to get all
      reports = await fraudReport.getAllFraudReports(parseInt(limit || 50));
    }

    res.json({
      success: true,
      count: reports.length,
      reports: reports.map((r) => (r.toDocument ? r.toDocument() : r)),
    });
  } catch (err) {
    console.error("Error fetching fraud reports:", err.message);
    res.status(500).json({
      error: err.message,
    });
  }
});

/**
 * GET /admin/fraud/report/:reportId
 *
 * Get specific fraud report
 */
router.get("/fraud/report/:reportId", async (req, res) => {
  try {
    const { reportId } = req.params;
    const report = await fraudReport.getFraudReport(reportId);

    if (!report) {
      return res.status(404).json({
        error: "Report not found",
      });
    }

    res.json(report.toDocument());
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

/**
 * GET /admin/fraud/user/:phoneNumber
 *
 * Get fraud reports for specific user
 */
router.get("/fraud/user/:phoneNumber", async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const reports = await fraudReport.getFraudReportsByPhone(phoneNumber, 20);

    // Also get compromised status
    const compromisedStatus =
      await fraudDetection.isUserCompromised(phoneNumber);

    res.json({
      phoneNumber,
      compromised: compromisedStatus !== null,
      compromisedStatus,
      reportCount: reports.length,
      reports: reports.map((r) => r.toDocument()),
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

/**
 * PUT /admin/fraud/report/:reportId/status
 *
 * Update fraud report status (review/escalate/resolve)
 */
router.put("/fraud/report/:reportId/status", async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status, reviewedBy, notes } = req.body;

    if (!status) {
      return res.status(400).json({
        error: "status is required",
      });
    }

    const validStatuses = ["new", "reviewed", "escalated", "resolved"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const success = await fraudReport.updateFraudReportStatus(
      reportId,
      status,
      reviewedBy || "admin",
      notes,
    );

    if (success) {
      res.json({
        success: true,
        message: `Report ${reportId} updated to ${status}`,
      });
    } else {
      res.status(404).json({
        error: "Report not found",
      });
    }
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

/**
 * DELETE /admin/fraud/report/:reportId
 *
 * Delete fraud report (admin only, use with caution)
 */
router.delete("/fraud/report/:reportId", async (req, res) => {
  try {
    const { reportId } = req.params;
    const success = await fraudReport.deleteFraudReport(reportId);

    if (success) {
      res.json({
        success: true,
        message: `Report ${reportId} deleted`,
      });
    } else {
      res.status(404).json({
        error: "Report not found",
      });
    }
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

/**
 * GET /admin/fraud/stats
 *
 * Fraud detection statistics
 */
router.get("/fraud/stats", async (req, res) => {
  try {
    const stats = await fraudReport.getFraudReportStats();

    res.json(stats);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

/**
 * POST /admin/fraud/user/:phoneNumber/clear
 *
 * Clear compromised flag for user (after resolution)
 */
router.post("/fraud/user/:phoneNumber/clear", async (req, res) => {
  try {
    const { phoneNumber } = req.params;

    await fraudDetection.clearCompromisedFlag(phoneNumber);

    res.json({
      success: true,
      message: `Compromised flag cleared for ${phoneNumber}`,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

/**
 * GET /admin/fraud/compromised
 *
 * Get all compromised users (from Redis)
 */
router.get("/fraud/compromised", async (req, res) => {
  try {
    const keys = await redis.keys("compromised:*");

    const compromisedUsers = await Promise.all(
      keys.map(async (key) => {
        const phoneNumber = key.replace("compromised:", "");
        const data = await redis.get(key);
        return {
          phoneNumber,
          ...data,
        };
      }),
    );

    res.json({
      count: compromisedUsers.length,
      users: compromisedUsers,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

// ============================================================
// SESSION WINDOW ROUTES
// ============================================================

/**
 * GET /admin/windows
 *
 * Get all active 24h session windows
 */
router.get("/windows", async (req, res) => {
  try {
    const windows = await sessionWindow.getActiveWindows();

    res.json({
      count: windows.length,
      windows,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

/**
 * GET /admin/windows/:phoneNumber
 *
 * Get session window status for specific user
 */
router.get("/windows/:phoneNumber", async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const status = await sessionWindow.getWindowStatus(phoneNumber);

    res.json({
      phoneNumber,
      ...status,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

/**
 * DELETE /admin/windows/:phoneNumber
 *
 * Manually close session window (force template messages)
 */
router.delete("/windows/:phoneNumber", async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    await sessionWindow.closeSessionWindow(phoneNumber);

    res.json({
      success: true,
      message: `Session window closed for ${phoneNumber}`,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

module.exports = router;
