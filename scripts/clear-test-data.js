/**
 * Clear Test Campaign Data
 */

require("dotenv").config();
const mongodb = require("../project/src/config/mongodb");

async function clearTestData() {
  try {
    await mongodb.connectMongo();
    const db = await mongodb.getDatabase();

    console.log("🗑️ Clearing test campaign data...\n");

    // Delete campaign
    const campaignResult = await db.collection("campaigns").deleteMany({
      campaignId: { $regex: /^onboarding_jan2026$|^test_campaign/ },
    });
    console.log(`✅ Deleted ${campaignResult.deletedCount} campaigns`);

    // Delete campaign users
    const usersResult = await db.collection("campaign_users").deleteMany({
      campaignId: { $regex: /^onboarding_jan2026$|^test_campaign/ },
    });
    console.log(`✅ Deleted ${usersResult.deletedCount} campaign users`);

    // Delete chat history
    const historyResult = await db.collection("chat_history").deleteMany({
      campaignId: { $regex: /^onboarding_jan2026$|^test_campaign/ },
    });
    console.log(`✅ Deleted ${historyResult.deletedCount} chat messages`);

    console.log("\n✨ Test data cleared successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

clearTestData();
