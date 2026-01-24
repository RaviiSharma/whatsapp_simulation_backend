/**
 * Proactive Messaging Routes
 *
 * Admin endpoints to initiate AI-first conversations with users
 *
 * IMPORTANT: These endpoints should be protected in production
 * - Add authentication middleware
 * - Rate limiting
 * - IP whitelisting
 */

const express = require("express");
const router = express.Router();
const proactiveMessaging = require("../services/proactiveMessaging.service");

/**
 * POST /proactive/start
 *
 * Start a proactive conversation with a single user
 *
 * Body:
 * {
 *   "phoneNumber": "917633811342",
 *   "preferredAgent": "hackerAgent" (optional),
 *   "templateParams": { "agentName": "Custom Name" } (optional)
 * }
 */
router.post("/start", async (req, res) => {
  try {
    const { phoneNumber, preferredAgent, templateParams } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        error: "Missing required field: phoneNumber",
      });
    }

    // Validate phone number format
    if (!phoneNumber.match(/^[1-9]\d{10,14}$/)) {
      return res.status(400).json({
        error:
          "Invalid phone number format. Use country code + number (no + or spaces)",
        example: "917633811342",
      });
    }

    console.log(`📥 Proactive start request for ${phoneNumber}`);

    const result = await proactiveMessaging.startConversation(
      phoneNumber,
      preferredAgent,
      templateParams,
    );

    if (result.success) {
      res.json({
        success: true,
        data: result,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        message: result.message,
      });
    }
  } catch (err) {
    console.error("❌ Proactive start error:", err);
    res.status(500).json({
      error: "Internal server error",
      message: err.message,
    });
  }
});

/**
 * POST /proactive/batch
 *
 * Start proactive conversations with multiple users
 *
 * Body:
 * {
 *   "phoneNumbers": ["917633811342", "917633811343"],
 *   "preferredAgent": "hackerAgent" (optional)
 * }
 */
router.post("/batch", async (req, res) => {
  try {
    const { phoneNumbers, preferredAgent } = req.body;

    if (!phoneNumbers || !Array.isArray(phoneNumbers)) {
      return res.status(400).json({
        error: "Missing or invalid field: phoneNumbers (must be array)",
      });
    }

    if (phoneNumbers.length === 0) {
      return res.status(400).json({
        error: "phoneNumbers array is empty",
      });
    }

    if (phoneNumbers.length > 100) {
      return res.status(400).json({
        error: "Maximum 100 phone numbers per batch request",
      });
    }

    console.log(
      `📥 Batch proactive start request for ${phoneNumbers.length} users`,
    );

    const results = await proactiveMessaging.batchStartConversations(
      phoneNumbers,
      preferredAgent,
    );

    const successCount = results.filter((r) => r.success).length;

    res.json({
      success: true,
      total: results.length,
      successful: successCount,
      failed: results.length - successCount,
      results,
    });
  } catch (err) {
    console.error("❌ Batch proactive start error:", err);
    res.status(500).json({
      error: "Internal server error",
      message: err.message,
    });
  }
});

/**
 * GET /proactive/check/:phoneNumber
 *
 * Check if a phone number is eligible for proactive messaging
 */
router.get("/check/:phoneNumber", async (req, res) => {
  try {
    const { phoneNumber } = req.params;

    const eligibility = await proactiveMessaging.checkEligibility(phoneNumber);

    res.json(eligibility);
  } catch (err) {
    console.error("❌ Check eligibility error:", err);
    res.status(500).json({
      error: "Internal server error",
      message: err.message,
    });
  }
});

/**
 * GET /proactive/stats
 *
 * Get statistics about proactive conversations
 */
router.get("/stats", async (req, res) => {
  try {
    const stats = await proactiveMessaging.getProactiveStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    console.error("❌ Proactive stats error:", err);
    res.status(500).json({
      error: "Internal server error",
      message: err.message,
    });
  }
});

module.exports = router;
