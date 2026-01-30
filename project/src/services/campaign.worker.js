/**
 * Campaign Assignment Worker - Production Grade
 *
 * Processes bulk user assignments for campaigns
 *
 * Features:
 * - High concurrency (10 jobs simultaneously)
 * - Atomic database operations
 * - Idempotent processing
 * - Error handling with retries
 */

const { Worker } = require("bullmq");
const mongodb = require("../config/mongodb");
const redis = require("../config/redis");
const chatHistory = require("./chatHistory.service");

// ============================================
// WORKER CONFIGURATION
// ============================================

const campaignWorker = new Worker(
  "campaign-assignment",
  async (job) => {
    console.log(`🔧 Processing campaign assignment job: ${job.id}`);

    const { campaignId, agentAssignments } = job.data;

    try {
      // Validate input
      if (!campaignId || !Array.isArray(agentAssignments)) {
        throw new Error("Invalid job data");
      }

      // Get campaign details
      const db = await mongodb.getDatabase();
      const campaign = await db.collection("campaigns").findOne({ campaignId });

      if (!campaign) {
        throw new Error(`Campaign not found: ${campaignId}`);
      }

      // Process assignments in bulk
      const results = await processBulkAssignments(
        campaignId,
        campaign.name,
        agentAssignments,
      );

      // Update job progress
      await job.updateProgress(100);

      console.log(
        `✅ Campaign assignment completed: ${results.created} users assigned`,
      );

      return {
        success: true,
        campaignId,
        ...results,
      };
    } catch (err) {
      console.error(`❌ Campaign assignment job failed:`, err.message);
      throw err; // Will trigger retry
    }
  },
  {
    connection: redis.getClient(),
    concurrency: 10, // Process 10 jobs simultaneously
    limiter: {
      max: 10,
      duration: 1000,
    },
  },
);

// ============================================
// PROCESSING LOGIC
// ============================================

/**
 * Process bulk user assignments
 */
async function processBulkAssignments(
  campaignId,
  campaignName,
  agentAssignments,
) {
  const db = await mongodb.getDatabase();
  const results = {
    total: agentAssignments.length,
    created: 0,
    updated: 0,
    failed: 0,
    errors: [],
  };

  // Use MongoDB bulk operations for performance
  const bulkOps = agentAssignments.map((assignment) => ({
    updateOne: {
      filter: {
        campaignId,
        phoneNumber: assignment.phoneNumber,
      },
      update: {
        $setOnInsert: {
          campaignId,
          phoneNumber: assignment.phoneNumber,
          agentName: assignment.agentName,
          sessionStatus: "pending",
          isActive: false,
          assignedAt: new Date(),
          fraudFlags: {
            detected: false,
            riskLevel: "low",
            lastCheckedAt: null,
          },
          metadata: assignment.metadata || {},
          createdAt: new Date(),
        },
      },
      upsert: true,
    },
  }));

  try {
    const bulkResult = await db
      .collection("campaign_users")
      .bulkWrite(bulkOps, {
        ordered: false, // Continue on error
      });

    results.created = bulkResult.upsertedCount;
    results.updated = bulkResult.modifiedCount;

    // Create conversations for each user
    for (const assignment of agentAssignments) {
      try {
        await chatHistory.createConversationIfNotExists(
          campaignId,
          assignment.phoneNumber,
          assignment.agentName,
          campaignName,
        );
      } catch (err) {
        results.failed++;
        results.errors.push({
          phoneNumber: assignment.phoneNumber,
          error: err.message,
        });
      }
    }

    console.log(
      `✅ Bulk assignment: ${results.created} created, ${results.updated} updated`,
    );
  } catch (err) {
    console.error(`❌ Bulk assignment failed:`, err.message);
    throw err;
  }

  return results;
}

// ============================================
// EVENT HANDLERS
// ============================================

campaignWorker.on("completed", (job, result) => {
  console.log(`✅ Job completed: ${job.id}`, result);
});

campaignWorker.on("failed", (job, err) => {
  console.error(`❌ Job failed: ${job?.id}`, err.message);
});

campaignWorker.on("error", (err) => {
  console.error(`❌ Worker error:`, err.message);
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

process.on("SIGTERM", async () => {
  console.log("🛑 Shutting down campaign worker...");
  await campaignWorker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("🛑 Shutting down campaign worker...");
  await campaignWorker.close();
  process.exit(0);
});

module.exports = campaignWorker;
