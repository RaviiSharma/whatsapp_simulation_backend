/**
 * Test Campaign API
 *
 * Tests all campaign endpoints with sample data
 * Run with: node scripts/test-campaign.js
 */

require("dotenv").config();
const axios = require("axios");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// Sample data - Use dynamic ID to avoid duplicates
const CAMPAIGN_ID = `onboarding_jan2026`;
const SAMPLE_PHONES = [
  "919102901737",
  "916202897338"
];

async function testCampaignAPI() {
  console.log("🧪 Testing Campaign API\n");
  console.log(`Base URL: ${BASE_URL}\n`);

  try {
    // ========================================
    // 1. CREATE CAMPAIGN
    // ========================================
    console.log("1️⃣ Creating campaign...");

    const createResponse = await axios.post(`${BASE_URL}/api/campaign/create`, {
      campaignId: CAMPAIGN_ID,
      campaignName: "Test Security Awareness Campaign",
      templateName: "security_alert_v2",
      templateParams: {
        company_name: "TestBank",
        alert_type: "Account Review",
      },
      agentAssignments: {
        hackerAgent: [SAMPLE_PHONES[0], SAMPLE_PHONES[1]],
        policyAgent: [SAMPLE_PHONES[2]],
        riskAgent: [SAMPLE_PHONES[3], SAMPLE_PHONES[4]],
      },
      settings: {
        autoRespond: true,
        fraudDetection: true,
        maxMessagesPerUser: 50,
        sessionTimeout: 24,
      },
      adminId: "test_admin",
    });

    console.log("✅ Campaign created:", createResponse.data);
    console.log();

    // ========================================
    // 2. GET CAMPAIGN
    // ========================================
    console.log("2️⃣ Getting campaign details...");

    const getResponse = await axios.get(
      `${BASE_URL}/api/campaign/${CAMPAIGN_ID}`,
    );
    console.log(
      "✅ Campaign details:",
      JSON.stringify(getResponse.data, null, 2),
    );
    console.log();

    // ========================================
    // 3. GET CAMPAIGN USERS
    // ========================================
    console.log("3️⃣ Getting campaign users...");

    const usersResponse = await axios.get(
      `${BASE_URL}/api/campaign/${CAMPAIGN_ID}/users`,
    );
    console.log(
      "✅ Campaign users:",
      JSON.stringify(usersResponse.data, null, 2),
    );
    console.log();

    // ========================================
    // 4. START CAMPAIGN (simulate - won't actually send messages without WhatsApp setup)
    // ========================================
    console.log("4️⃣ Starting campaign (simulation mode)...");
    console.log(
      "⚠️  Note: This will not send actual WhatsApp messages in test mode",
    );

    // Uncomment to actually start campaign:
    // const startResponse = await axios.post(`${BASE_URL}/api/campaign/start`, {
    //   campaignId: CAMPAIGN_ID,
    //   startImmediately: false,
    //   throttle: {
    //     messagesPerSecond: 1,
    //     batchSize: 2,
    //   },
    // });
    // console.log('✅ Campaign started:', startResponse.data);

    console.log("⏭️  Skipped (uncomment to test)");
    console.log();

    // ========================================
    // 5. GET CHAT HISTORY (empty for now)
    // ========================================
    console.log("5️⃣ Getting chat history...");

    const historyResponse = await axios.get(
      `${BASE_URL}/api/campaign/${CAMPAIGN_ID}/chat-history`,
    );
    console.log(
      "✅ Chat history:",
      JSON.stringify(historyResponse.data, null, 2),
    );
    console.log();

    // ========================================
    // 6. GET USER CAMPAIGNS
    // ========================================
    console.log("6️⃣ Getting user campaigns...");

    const userCampaignsResponse = await axios.get(
      `${BASE_URL}/api/user/${SAMPLE_PHONES[0]}/campaigns`,
    );
    console.log(
      "✅ User campaigns:",
      JSON.stringify(userCampaignsResponse.data, null, 2),
    );
    console.log();

    // ========================================
    // 7. UPDATE CAMPAIGN STATUS
    // ========================================
    console.log("7️⃣ Updating campaign status...");

    const updateResponse = await axios.patch(
      `${BASE_URL}/api/campaign/${CAMPAIGN_ID}/status`,
      {
        status: "paused",
      },
    );
    console.log("✅ Campaign status updated:", updateResponse.data);
    console.log();

    // ========================================
    // 8. GET ANALYTICS
    // ========================================
    console.log("8️⃣ Getting campaign analytics...");

    const analyticsResponse = await axios.get(
      `${BASE_URL}/api/analytics/campaign/${CAMPAIGN_ID}`,
    );
    console.log(
      "✅ Campaign analytics:",
      JSON.stringify(analyticsResponse.data, null, 2),
    );
    console.log();

    console.log("\n✅ All tests passed!\n");
    console.log("📝 Next steps:");
    console.log(
      "   1. Set up MongoDB schema: node scripts/setup-mongodb-schema.js",
    );
    console.log("   2. Configure WhatsApp Cloud API credentials");
    console.log("   3. Start the server: npm start");
    console.log("   4. Test with real phone numbers");
  } catch (err) {
    console.error("\n❌ Test failed:", err.message);
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Response:", JSON.stringify(err.response.data, null, 2));
    }
    if (err.code) {
      console.error("Error Code:", err.code);
    }
    console.error("Stack:", err.stack);
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  testCampaignAPI();
}

module.exports = { testCampaignAPI };
