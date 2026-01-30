/**
 * Assignment Queue Service - Redis BullMQ Implementation
 *
 * SOLUTION TO PROBLEM 3
 *
 * Provides:
 * - Redis-based job queue for bulk assignments
 * - Worker to process assignments asynchronously
 * - Rate limiting for WhatsApp API
 * - Retry logic
 * - Idempotency guarantees
 * - Duplicate prevention
 */

const { Queue, Worker } = require("bullmq");
const mongodb = require("../config/mongodb");
const sessionStore = require("./sessionStore.service");
const proactiveMessaging = require("./proactiveMessaging.service");

// ============================================
// REDIS CONNECTION CONFIGURATION
// ============================================
const redisConnection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
};

// ============================================
// QUEUE DEFINITIONS
// ============================================

/**
 * Campaign Assignment Queue
 *
 * Handles bulk user assignments with:
 * - Concurrency control
 * - Rate limiting
 * - Automatic retries
 * - Job deduplication
 */
const assignmentQueue = new Queue("campaign-assignments", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // Retry up to 3 times
    backoff: {
      type: "exponential",
      delay: 2000, // Start with 2 seconds, doubles each retry
    },
    removeOnComplete: 1000, // Keep last 1000 completed jobs
    removeOnFail: 5000, // Keep last 5000 failed jobs
  },
});

// Note: QueueScheduler is no longer needed in BullMQ v3+
// Scheduling is now handled automatically by Queue and Worker

// ============================================
// ENQUEUE ASSIGNMENTS FUNCTION
// ============================================

/**
 * Enqueue bulk campaign assignments
 *
 * @param {object} params - Assignment parameters
 * @param {string} params.campaignId - Campaign ID
 * @param {string} params.campaignName - Campaign name
 * @param {Array} params.assignments - Array of {phoneNumber, agentName}
 * @param {string} params.templateName - WhatsApp template name
 * @param {object} params.templateParams - Template parameters
 * @param {string} params.createdBy - Admin user ID
 * @returns {Promise<string>} Job ID
 */
async function enqueueAssignments({
  campaignId,
  campaignName,
  assignments,
  templateName,
  templateParams,
  createdBy,
}) {
  try {
    console.log(
      `📬 Enqueueing ${assignments.length} assignments for campaign: ${campaignId}`,
    );

    // Create a bulk job with all assignments
    const job = await assignmentQueue.add(
      "bulk-assign",
      {
        campaignId,
        campaignName,
        assignments,
        templateName,
        templateParams,
        createdBy,
        enqueuedAt: new Date().toISOString(),
      },
      {
        jobId: `campaign:${campaignId}:${Date.now()}`, // Unique job ID
        priority: 1, // Higher priority = processed first
      },
    );

    console.log(`✅ Assignments enqueued with job ID: ${job.id}`);

    return job.id;
  } catch (err) {
    console.error(`❌ Failed to enqueue assignments:`, err.message);
    throw err;
  }
}

/**
 * Enqueue single proactive message (used when starting campaign)
 *
 * @param {object} params - Message parameters
 * @returns {Promise<string>} Job ID
 */
async function enqueueProactiveMessage({
  campaignId,
  campaignName,
  phoneNumber,
  agentName,
  templateName,
  templateParams,
}) {
  try {
    const job = await assignmentQueue.add(
      "send-proactive",
      {
        campaignId,
        campaignName,
        phoneNumber,
        agentName,
        templateName,
        templateParams,
        enqueuedAt: new Date().toISOString(),
      },
      {
        jobId: `proactive:${campaignId}:${phoneNumber}`, // Idempotency key
        priority: 2,
      },
    );

    return job.id;
  } catch (err) {
    console.error(`❌ Failed to enqueue proactive message:`, err.message);
    throw err;
  }
}

// ============================================
// WORKER IMPLEMENTATION
// ============================================

/**
 * Assignment Worker
 *
 * Processes assignments from queue with:
 * - Rate limiting (5 messages/second default)
 * - Idempotency checks
 * - MongoDB + Redis synchronization
 * - Error handling and logging
 *
 * FLOW:
 * 1. Check if assignment already exists (idempotency)
 * 2. Create campaign_users record
 * 3. Create conversation document
 * 4. Send WhatsApp template (optional)
 * 5. Update Redis session
 * 6. Update MongoDB with firstMessageSentAt
 * 7. Handle errors with retries
 */
const assignmentWorker = new Worker(
  "campaign-assignments",
  async (job) => {
    const { name, data } = job;

    console.log(`🔧 Processing job: ${job.id} (${name})`);

    try {
      if (name === "bulk-assign") {
        return await processBulkAssignment(job, data);
      } else if (name === "send-proactive") {
        return await processProactiveMessage(job, data);
      } else {
        throw new Error(`Unknown job type: ${name}`);
      }
    } catch (err) {
      console.error(`❌ Job ${job.id} failed:`, err.message);
      throw err; // Will trigger retry
    }
  },
  {
    connection: redisConnection,
    concurrency: 5, // Process 5 jobs concurrently (recommended for WhatsApp API)
    limiter: {
      max: 5, // Max 5 jobs
      duration: 1000, // Per 1 second (rate limiting for WhatsApp API)
    },
  },
);

/**
 * Process bulk assignment job
 *
 * @param {object} job - BullMQ job
 * @param {object} data - Job data
 * @returns {Promise<object>} Processing result
 */
async function processBulkAssignment(job, data) {
  const {
    campaignId,
    campaignName,
    assignments,
    templateName,
    templateParams,
    createdBy,
  } = data;

  console.log(
    `📦 Processing bulk assignment for campaign: ${campaignId} (${assignments.length} users)`,
  );

  const db = await mongodb.getDatabase();
  const results = {
    total: assignments.length,
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  // Process assignments with progress tracking
  for (let i = 0; i < assignments.length; i++) {
    const { phoneNumber, agentName } = assignments[i];

    // Update job progress
    await job.updateProgress((i / assignments.length) * 100);

    try {
      // ============================================
      // STEP 1: IDEMPOTENCY CHECK
      // ============================================
      const existingAssignment = await db.collection("campaign_users").findOne({
        campaignId,
        phoneNumber,
      });

      if (existingAssignment) {
        console.log(`⏭️ Assignment already exists: ${phoneNumber} (skipping)`);
        results.skipped++;
        continue;
      }

      // ============================================
      // STEP 2: CREATE CAMPAIGN_USERS RECORD
      // ============================================
      const campaignUser = {
        campaignId,
        phoneNumber,
        agentName,
        uniqueKey: `${campaignId}:${phoneNumber}`,
        assignedAt: new Date(),
        assignedBy: createdBy,
        sessionStatus: "pending",
        firstMessageSentAt: null,
        firstUserResponseAt: null,
        lastMessageAt: null,
        messageCount: { sent: 0, received: 0 },
        isActive: false,
        isCompleted: false,
        proactiveMessageId: null,
        fraudFlags: {
          detected: false,
          riskLevel: "low",
          lastCheckedAt: new Date(),
        },
      };

      await db.collection("campaign_users").insertOne(campaignUser);

      // ============================================
      // STEP 3: CREATE CONVERSATION DOCUMENT
      // ============================================
      const retentionDays = parseInt(process.env.CHAT_RETENTION_DAYS) || 365;
      const retentionExpiry = new Date();
      retentionExpiry.setDate(retentionExpiry.getDate() + retentionDays);

      const conversation = {
        phoneNumber,
        campaignId,
        campaignName,
        agentName,
        currentAgentName: agentName,
        conversationStartedAt: new Date(),
        lastMessageAt: null,
        retentionExpiry,
        createdAt: new Date(),
        fraud: {
          flagged: false,
          riskLevel: "low",
          detectedAt: null,
        },
        messageCount: 0,
        messagesSent: 0,
        messagesReceived: 0,
        messages: [], // Empty array initially
      };

      await db.collection("conversations").insertOne(conversation);

      console.log(
        `✅ Created assignment: ${phoneNumber} → ${agentName} (campaign: ${campaignId})`,
      );
      results.created++;
    } catch (err) {
      console.error(
        `❌ Failed to create assignment for ${phoneNumber}:`,
        err.message,
      );
      results.failed++;
      results.errors.push({
        phoneNumber,
        error: err.message,
      });
    }
  }

  await job.updateProgress(100);

  console.log(
    `✅ Bulk assignment completed: ${results.created} created, ${results.skipped} skipped, ${results.failed} failed`,
  );

  return results;
}

/**
 * Process proactive message job
 *
 * @param {object} job - BullMQ job
 * @param {object} data - Job data
 * @returns {Promise<object>} Processing result
 */
async function processProactiveMessage(job, data) {
  const {
    campaignId,
    campaignName,
    phoneNumber,
    agentName,
    templateName,
    templateParams,
  } = data;

  console.log(
    `📤 Sending proactive message: ${phoneNumber} (campaign: ${campaignId})`,
  );

  const db = await mongodb.getDatabase();

  try {
    // ============================================
    // STEP 1: CHECK SESSION
    // ============================================
    const existingSession = await sessionStore.getSession(phoneNumber);
    if (existingSession) {
      console.log(`⏭️ Session already exists for ${phoneNumber} (skipping)`);
      return { success: true, skipped: true, reason: "session_exists" };
    }

    // ============================================
    // STEP 2: SEND TEMPLATE MESSAGE
    // ============================================
    const result = await proactiveMessaging.startConversation(
      phoneNumber,
      agentName,
      {
        campaignId,
        campaignName,
        templateName,
        ...templateParams,
      },
    );

    if (!result.success) {
      throw new Error(`WhatsApp send failed: ${result.error}`);
    }

    // ============================================
    // STEP 3: UPDATE CAMPAIGN_USERS
    // ============================================
    await db.collection("campaign_users").updateOne(
      { campaignId, phoneNumber },
      {
        $set: {
          sessionStatus: "initiated",
          firstMessageSentAt: new Date(),
          proactiveMessageId: result.messageId,
          isActive: true,
        },
      },
    );

    console.log(`✅ Proactive message sent: ${phoneNumber}`);

    return {
      success: true,
      messageId: result.messageId,
      phoneNumber,
      agentName,
    };
  } catch (err) {
    console.error(
      `❌ Failed to send proactive message to ${phoneNumber}:`,
      err.message,
    );
    throw err; // Will trigger retry
  }
}

// ============================================
// WORKER EVENT HANDLERS
// ============================================

assignmentWorker.on("completed", (job, result) => {
  console.log(`✅ Job ${job.id} completed:`, result);
});

assignmentWorker.on("failed", (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err.message);
});

assignmentWorker.on("progress", (job, progress) => {
  console.log(`📊 Job ${job.id} progress: ${progress}%`);
});

// ============================================
// QUEUE MONITORING
// ============================================

/**
 * Get queue statistics
 *
 * @returns {Promise<object>} Queue stats
 */
async function getQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    assignmentQueue.getWaitingCount(),
    assignmentQueue.getActiveCount(),
    assignmentQueue.getCompletedCount(),
    assignmentQueue.getFailedCount(),
    assignmentQueue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed,
  };
}

/**
 * Get job status by ID
 *
 * @param {string} jobId - Job ID
 * @returns {Promise<object>} Job details
 */
async function getJobStatus(jobId) {
  const job = await assignmentQueue.getJob(jobId);

  if (!job) {
    return null;
  }

  const state = await job.getState();
  const progress = job.progress || 0;

  return {
    id: job.id,
    name: job.name,
    data: job.data,
    state,
    progress,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
    finishedOn: job.finishedOn,
    processedOn: job.processedOn,
    returnvalue: job.returnvalue,
  };
}

/**
 * Cancel/remove a job
 *
 * @param {string} jobId - Job ID
 * @returns {Promise<boolean>} Success status
 */
async function cancelJob(jobId) {
  const job = await assignmentQueue.getJob(jobId);
  if (!job) {
    return false;
  }

  await job.remove();
  return true;
}

/**
 * Clean old jobs to prevent memory buildup
 * Removes completed jobs older than specified time
 *
 * @param {number} grace - Grace period in milliseconds (default: 1 hour)
 * @param {number} limit - Max number of jobs to clean at once
 * @returns {Promise<number[]>} Number of jobs cleaned per status
 */
async function cleanOldJobs(grace = 3600000, limit = 1000) {
  try {
    const cleaned = await assignmentQueue.clean(grace, limit);
    console.log(`🧹 Cleaned ${cleaned.length} old jobs from queue`);
    return cleaned;
  } catch (err) {
    console.error("❌ Failed to clean old jobs:", err.message);
    return [];
  }
}

// Periodic cleanup: Run every hour to prevent memory buildup
setInterval(async () => {
  console.log("🧹 Running periodic queue cleanup...");
  await cleanOldJobs(3600000, 1000); // Clean jobs older than 1 hour
}, 3600000); // Run every hour

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

process.on("SIGTERM", async () => {
  console.log("🛑 Shutting down assignment worker...");
  await assignmentWorker.close();
  await assignmentQueue.close();
  console.log("✅ Assignment worker shut down gracefully");
  process.exit(0);
});

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Queue operations
  enqueueAssignments,
  enqueueProactiveMessage,
  getQueueStats,
  getJobStatus,
  cancelJob,
  cleanOldJobs,

  // Queue instances (for testing/monitoring)
  assignmentQueue,
  assignmentWorker,
};
