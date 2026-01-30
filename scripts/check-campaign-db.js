/**
 * Check Campaign Database Status
 */

require("dotenv").config();
const mongodb = require("../project/src/config/mongodb");

async function checkDatabase() {
  try {
    await mongodb.connectMongo();
    const db = await mongodb.getDatabase();

    console.log("🔍 Checking recent campaigns in database\n");

    // Check campaigns collection
    const campaigns = await db
      .collection("campaigns")
      .find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();
    console.log(`📦 Recent campaigns: ${campaigns.length} found`);
    campaigns.forEach((c, i) => {
      console.log(
        `  ${i + 1}. ${c.campaignId} - ${c.campaignName} (${c.status}) - ${c.stats.totalUsers} users`,
      );
    });
    console.log();

    // Check campaign_users for first campaign
    if (campaigns.length > 0) {
      const firstCampaign = campaigns[0];
      const users = await db
        .collection("campaign_users")
        .find({ campaignId: firstCampaign.campaignId })
        .toArray();
      console.log(
        `👥 Users in "${firstCampaign.campaignId}": ${users.length} found`,
      );
      users.forEach((user, i) => {
        console.log(
          `  ${i + 1}. ${user.phoneNumber} → ${user.agentName} (${user.sessionStatus})`,
        );
      });
      console.log();
    }

    // Check indexes
    const indexes = await db.collection("campaign_users").indexes();
    console.log("📊 Indexes on campaign_users:");
    indexes.forEach((idx) => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

checkDatabase();
