/**
 * Clear all compromised flags from Redis
 * Run this to reset fraud detection state
 */

const redis = require("./project/src/config/redis");

async function clearAllCompromisedFlags() {
  try {
    console.log("🧹 Clearing all compromised flags from Redis...\n");

    // Get all compromised keys
    const keys = await redis.keys("compromised:*");

    if (keys.length === 0) {
      console.log("✅ No compromised flags found");
      process.exit(0);
    }

    console.log(`Found ${keys.length} compromised user(s):`);

    // Show and delete each key
    for (const key of keys) {
      const data = await redis.get(key);
      const phoneNumber = key.replace("compromised:", "");
      console.log(
        `  - ${phoneNumber}: ${data.riskLevel} (flagged at ${data.flaggedAt})`,
      );
      await redis.del(key);
    }

    console.log(`\n✅ Cleared ${keys.length} compromised flag(s)`);
    console.log("🔄 All users can now start fresh with hackerAgent");

    process.exit(0);
  } catch (err) {
    console.error("❌ Error clearing flags:", err.message);
    process.exit(1);
  }
}

clearAllCompromisedFlags();
