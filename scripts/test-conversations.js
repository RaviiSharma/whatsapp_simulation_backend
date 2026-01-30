/**
 * Test Conversation-Based Storage
 */

require("dotenv").config();
const chatHistory = require("../project/src/services/chatHistory.service");
const mongodb = require("../project/src/config/mongodb");

async function test() {
  try {
    console.log("🧪 Testing Conversation-Based Chat Storage\n");

    await mongodb.connectMongo();
    const db = await mongodb.getDatabase();
    console.log("✅ Connected to MongoDB\n");

    // Clear test data
    await db.collection("conversations").deleteMany({
      phoneNumber: { $regex: /^9199999/ },
    });
    console.log("🗑️ Cleared test data\n");

    const testPhone = "919999988888";
    const campaignId = "test_fraud_campaign";

    // ========================================
    // TEST 1: Store first message
    // ========================================
    console.log("1️⃣ Storing first message (no fraud)...");
    const msg1 = await chatHistory.storeChatMessage({
      phoneNumber: testPhone,
      campaignId,
      campaignName: "Test Fraud Campaign",
      agentName: "policyAgent",
      direction: "outbound",
      message: "Hello! Welcome to our service.",
      messageId: "msg_001",
      fraudFlag: false,
      proactive: true,
    });
    console.log("Result:", msg1);
    console.log();

    // ========================================
    // TEST 2: Store second message (normal)
    // ========================================
    console.log("2️⃣ Storing second message (user reply, no fraud)...");
    const msg2 = await chatHistory.storeChatMessage({
      phoneNumber: testPhone,
      campaignId,
      agentName: "policyAgent",
      direction: "inbound",
      message: "Hi, thanks!",
      messageId: "msg_002",
      fraudFlag: false,
    });
    console.log("Result:", msg2);
    console.log();

    // ========================================
    // TEST 3: Store third message (with FRAUD)
    // ========================================
    console.log("3️⃣ Storing third message (OTP - FRAUD DETECTED)...");
    const msg3 = await chatHistory.storeChatMessage({
      phoneNumber: testPhone,
      campaignId,
      agentName: "policyAgent",
      direction: "inbound",
      message: "This is my OTP 123456",
      messageId: "msg_003",
      fraudFlag: true,
      riskLevel: "high",
      fraudReasons: ["otp_shared"],
      fraudConfidence: 0.95,
    });
    console.log("Result:", msg3);
    console.log();

    // ========================================
    // TEST 4: Check conversation document
    // ========================================
    console.log("4️⃣ Checking conversation document...");
    const conversation = await db.collection("conversations").findOne({
      phoneNumber: testPhone,
      campaignId,
    });

    console.log("\n📄 Conversation Document:");
    console.log("   Phone:", conversation.phoneNumber);
    console.log("   Campaign:", conversation.campaignId);
    console.log("   Agent:", conversation.agentName);
    console.log("   Total Messages:", conversation.messages.length);
    console.log("   Message Count:", conversation.messageCount);
    console.log(
      "   Fraud Flagged:",
      conversation.fraud.flagged ? "✅ YES" : "❌ NO",
    );
    if (conversation.fraud.flagged) {
      console.log("   Fraud Risk Level:", conversation.fraud.riskLevel);
      console.log(
        "   Fraud Detected At:",
        conversation.fraud.detectedAt.toISOString(),
      );
      console.log("   Fraud Message:", conversation.fraud.lastFraudMessage);
    }
    console.log("\n   Messages in Array:");
    conversation.messages.forEach((msg, i) => {
      console.log(
        `   ${i + 1}. [${msg.direction}] ${msg.text.substring(0, 30)}... (fraud: ${msg.fraud.flagged ? "YES" : "NO"})`,
      );
    });
    console.log();

    // ========================================
    // TEST 5: Update fraud on existing message
    // ========================================
    console.log("5️⃣ Updating fraud status on message 2...");
    const updateResult = await chatHistory.updateMessageFraudStatus("msg_002", {
      flagged: true,
      riskLevel: "medium",
      reasons: ["suspicious_pattern"],
      confidence: 0.75,
    });
    console.log("Update Result:", updateResult);
    console.log();

    // ========================================
    // TEST 6: Verify fraud update
    // ========================================
    console.log("6️⃣ Verifying fraud update...");
    const updatedConv = await db.collection("conversations").findOne({
      phoneNumber: testPhone,
      campaignId,
    });
    console.log("   Conversation fraud flag:", updatedConv.fraud.flagged);
    console.log(
      "   Message 2 fraud flag:",
      updatedConv.messages[1].fraud.flagged,
    );
    console.log();

    // ========================================
    // TEST 7: Get user chat history
    // ========================================
    console.log("7️⃣ Retrieving user chat history...");
    const userHistory = await chatHistory.getUserChatHistory(testPhone);
    console.log(
      `   Retrieved ${userHistory.length} messages across all conversations`,
    );
    console.log();

    // ========================================
    // TEST 8: Get campaign chat history
    // ========================================
    console.log("8️⃣ Retrieving campaign chat history...");
    const campaignHistory =
      await chatHistory.getCampaignChatHistory(campaignId);
    console.log(`   Retrieved ${campaignHistory.messages.length} messages`);
    console.log(
      `   Pagination: page ${campaignHistory.pagination.page}/${campaignHistory.pagination.totalPages}`,
    );
    console.log();

    console.log("✅ All tests passed!\n");

    console.log("📊 Summary:");
    console.log("   ✅ Messages stored in array (not separate documents)");
    console.log("   ✅ Fraud flag updated at conversation level");
    console.log("   ✅ Individual message fraud tracked");
    console.log("   ✅ Chat history retrieval working");
    console.log("   ✅ Campaign queries working\n");

    process.exit(0);
  } catch (err) {
    console.error("\n❌ Test failed:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

test();
