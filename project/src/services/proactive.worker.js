/**
 * Proactive Message Worker - Production Grade
 *
 * Sends initial template messages to users
 *
 * Features:
 * - WhatsApp API rate limiting (10/sec)
 * - Retry logic with exponential backoff
 * - Message storage in chat history
 * - Session activation
 */

const { Worker } = require("bullmq");
const redis = require("../config/redis");
const chatHistory = require("./chatHistory.service");
const whatsapp = require("./whatsapp.service");
const sessionStore = require("./sessionStore.service");

// ============================================
// WORKER CONFIGURATION
// ============================================

const proactiveWorker = new Worker(
  "proactive-message",
  async (job) => {
    console.log(`📨 Processing proactive message job: ${job.id}`);

    const { campaignId, phoneNumber, agentName, templateName, templateParams } =
      job.data;

    try {
      // Send WhatsApp template message
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      const whatsappResult = await whatsapp.sendTemplateMessage(
        phoneNumber,
        templateName,
        templateParams,
      );

      if (!whatsappResult.success) {
        throw new Error(`WhatsApp API error: ${whatsappResult.error}`);
      }

      // Store message in chat history
      await chatHistory.storeProactiveMessage({
        campaignId,
        phoneNumber,
        messageId: whatsappResult.messageId || messageId,
        templateName,
        templateParams,
        text: formatTemplateText(templateName, templateParams),
        timestamp: new Date(),
        agentName,
        metadata: {
          whatsappMessageId: whatsappResult.messageId,
          jobId: job.id,
        },
      });

      // Initialize session
      const sessionKey = `session:${phoneNumber}`;
      await sessionStore.createSession(sessionKey, {
        phoneNumber,
        campaignId,
        agentName,
        status: "active",
        conversationStartedAt: new Date(),
      });

      // Update job progress
      await job.updateProgress(100);

      console.log(`✅ Proactive message sent: ${phoneNumber}`);

      return {
        success: true,
        messageId: whatsappResult.messageId,
        phoneNumber,
      };
    } catch (err) {
      console.error(`❌ Proactive message job failed:`, err.message);

      // Check if this is a WhatsApp API rate limit error
      if (err.message.includes("rate limit") || err.message.includes("429")) {
        throw new Error("RATE_LIMIT"); // Will trigger retry with backoff
      }

      throw err;
    }
  },
  {
    connection: redis.getClient(),
    concurrency: 5, // Conservative for WhatsApp API
    limiter: {
      max: 10, // 10 messages
      duration: 1000, // per second
    },
  },
);

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format template text for storage (placeholder for actual template rendering)
 */
function formatTemplateText(templateName, params) {
  // This should match your actual WhatsApp template format
  return `Template: ${templateName} with params: ${JSON.stringify(params)}`;
}

// ============================================
// EVENT HANDLERS
// ============================================

proactiveWorker.on("completed", (job, result) => {
  console.log(`✅ Proactive message job completed: ${job.id}`);
});

proactiveWorker.on("failed", (job, err) => {
  console.error(`❌ Proactive message job failed: ${job?.id}`, err.message);

  // Log failed phone number for retry/manual intervention
  if (job?.data?.phoneNumber) {
    console.error(`   Phone number: ${job.data.phoneNumber}`);
  }
});

proactiveWorker.on("error", (err) => {
  console.error(`❌ Proactive worker error:`, err.message);
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

process.on("SIGTERM", async () => {
  console.log("🛑 Shutting down proactive worker...");
  await proactiveWorker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("🛑 Shutting down proactive worker...");
  await proactiveWorker.close();
  process.exit(0);
});

module.exports = proactiveWorker;
