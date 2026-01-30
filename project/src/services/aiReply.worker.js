/**
 * AI Reply Worker - Production Grade
 *
 * Generates and sends AI responses to user messages
 *
 * Features:
 * - Real-time response generation
 * - Fraud detection integration
 * - Agent switching logic
 * - Message storage
 * - AI blocking for HIGH risk users
 */

const { Worker } = require("bullmq");
const redis = require("../config/redis");
const chatHistory = require("./chatHistory.service");
const fraud = require("./fraud.service.PRODUCTION");
const agentSwitching = require("./agentSwitching.service");
const ai = require("./ai.service");
const whatsapp = require("./whatsapp.service");

// ============================================
// WORKER CONFIGURATION
// ============================================

const aiReplyWorker = new Worker(
  "ai-reply",
  async (job) => {
    console.log(`🤖 Processing AI reply job: ${job.id}`);

    const {
      campaignId,
      phoneNumber,
      messageId,
      userMessage,
      agentName,
      sessionData,
    } = job.data;

    try {
      // Step 1: Run fraud detection
      const fraudAnalysis = await fraud.detectFraud({
        campaignId,
        phoneNumber,
        messageId,
        text: userMessage,
        currentAgent: agentName,
      });

      await job.updateProgress(30);

      // Step 2: Check if AI should be blocked (HIGH risk users)
      const shouldBlockAI = await agentSwitching.shouldBlockAIGeneration(
        campaignId,
        phoneNumber,
      );

      let aiResponse;
      let finalAgent = agentName;

      if (shouldBlockAI) {
        // HIGH RISK: No AI generation, send static message
        aiResponse =
          "Thank you for your message. Your request is being reviewed by our team.";
        finalAgent = "riskAgent";

        console.log(`🚫 AI blocked for HIGH risk user: ${phoneNumber}`);
      } else if (fraudAnalysis.actionTaken === "SWITCH_TO_RISK_AGENT") {
        // MEDIUM RISK: Switch agent, then generate AI
        finalAgent = "riskAgent";

        // Get conversation history
        const history = await chatHistory.getLastMessages(
          campaignId,
          phoneNumber,
          10,
        );

        // Generate AI response with new agent
        aiResponse = await ai.generateResponse({
          agentName: finalAgent,
          userMessage,
          conversationHistory: history,
          sessionData,
        });

        await job.updateProgress(60);
      } else {
        // LOW RISK: Normal AI generation
        const history = await chatHistory.getLastMessages(
          campaignId,
          phoneNumber,
          10,
        );

        aiResponse = await ai.generateResponse({
          agentName: finalAgent,
          userMessage,
          conversationHistory: history,
          sessionData,
        });

        await job.updateProgress(60);
      }

      // Step 3: Send WhatsApp response
      const outboundMessageId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      const whatsappResult = await whatsapp.sendTextMessage(
        phoneNumber,
        aiResponse,
      );

      if (!whatsappResult.success) {
        throw new Error(`WhatsApp send failed: ${whatsappResult.error}`);
      }

      await job.updateProgress(80);

      // Step 4: Store outbound message
      await chatHistory.storeOutboundMessage({
        campaignId,
        phoneNumber,
        messageId: whatsappResult.messageId || outboundMessageId,
        text: aiResponse,
        timestamp: new Date(),
        agentName: finalAgent,
        metadata: {
          inboundMessageId: messageId,
          fraudAnalysis: {
            riskLevel: fraudAnalysis.riskLevel,
            confidence: fraudAnalysis.confidence,
          },
          aiBlocked: shouldBlockAI,
          jobId: job.id,
        },
      });

      await job.updateProgress(100);

      console.log(`✅ AI reply sent: ${phoneNumber} (agent: ${finalAgent})`);

      return {
        success: true,
        messageId: whatsappResult.messageId,
        aiBlocked: shouldBlockAI,
        riskLevel: fraudAnalysis.riskLevel,
        agentUsed: finalAgent,
      };
    } catch (err) {
      console.error(`❌ AI reply job failed:`, err.message);
      throw err;
    }
  },
  {
    connection: redis.getClient(),
    concurrency: 20, // High concurrency for real-time responses
    limiter: {
      max: 20, // 20 jobs
      duration: 1000, // per second
    },
  },
);

// ============================================
// EVENT HANDLERS
// ============================================

aiReplyWorker.on("completed", (job, result) => {
  console.log(`✅ AI reply job completed: ${job.id}`, {
    messageId: result.messageId,
    riskLevel: result.riskLevel,
  });
});

aiReplyWorker.on("failed", (job, err) => {
  console.error(`❌ AI reply job failed: ${job?.id}`, err.message);

  if (job?.data?.phoneNumber) {
    console.error(`   Phone number: ${job.data.phoneNumber}`);
  }
});

aiReplyWorker.on("error", (err) => {
  console.error(`❌ AI reply worker error:`, err.message);
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

process.on("SIGTERM", async () => {
  console.log("🛑 Shutting down AI reply worker...");
  await aiReplyWorker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("🛑 Shutting down AI reply worker...");
  await aiReplyWorker.close();
  process.exit(0);
});

module.exports = aiReplyWorker;
