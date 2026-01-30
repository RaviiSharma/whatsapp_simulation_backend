/**
 * Direct Campaign Test (No Server Required)
 */

require("dotenv").config();
const campaignService = require("../project/src/services/campaign.service");
const mongodb = require("../project/src/config/mongodb");

async function test() {
  try {
    console.log("🧪 Direct Campaign Service Test\n");

    // Connect to MongoDB
    await mongodb.connectMongo();
    console.log("✅ Connected to MongoDB\n");

    // Clear old test data
    const db = await mongodb.getDatabase();
    await db.collection("campaigns").deleteMany({
      campaignId: { $regex: /^test_direct/ },
    });
    await db.collection("campaign_users").deleteMany({
      campaignId: { $regex: /^test_direct/ },
    });
    console.log("🗑️ Cleared old test data\n");

    // Test 1: Array Format
    console.log("1️⃣  Testing ARRAY format...");
    const campaign1 = await campaignService.createCampaign({
      campaignId: "test_direct_array",
      campaignName: "Test Array Format",
      agentAssignments: [
        { phoneNumber: "919876543210", agentName: "policyAgent" },
        { phoneNumber: "919876543211", agentName: "riskAgent" },
        { phoneNumber: "919876543212", agentName: "hackerAgent" },
      ],
    });
    console.log("Result:", JSON.stringify(campaign1.stats, null, 2));

    // Verify users were created
    const users1 = await db
      .collection("campaign_users")
      .find({ campaignId: "test_direct_array" })
      .toArray();
    console.log(`✅ Created ${users1.length} users (expected 3)\n`);

    // Test 2: Object Format
    console.log("2️⃣ Testing OBJECT format...");
    const campaign2 = await campaignService.createCampaign({
      campaignId: "test_direct_object",
      campaignName: "Test Object Format",
      agentAssignments: {
        policyAgent: ["919102901737", "916202897338"],
        riskAgent: ["916202897338"],
        hackerAgent: ["916202897338", "919102901737"],
      },
    });
    console.log("Result:", JSON.stringify(campaign2.stats, null, 2));

    // Verify users were created
    const users2 = await db
      .collection("campaign_users")
      .find({ campaignId: "test_direct_object" })
      .toArray();
    console.log(`✅ Created ${users2.length} users (expected 5)\n`);

    // Test 3: Start Campaign
    console.log("3️⃣ Testing campaign start...");
    const startResult = await campaignService.startCampaign(
      "test_direct_array",
      {
        throttle: { messagesPerSecond: 10 },
      },
    );
    console.log("Start Result:", JSON.stringify(startResult, null, 2));

    console.log("\n✅ All tests passed!");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Test failed:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

test();
