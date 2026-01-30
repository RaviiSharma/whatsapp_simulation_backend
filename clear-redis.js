/**
 * Clear Redis for fresh campaign start
 */

const redis = require("./project/src/config/redis");

async function clearRedis() {
  try {
    console.log("🧹 Clearing Redis for fresh start...\n");

    // Get all keys
    const allKeys = await redis.keys("*");
    console.log(`Found ${allKeys.length} keys in Redis`);

    if (allKeys.length === 0) {
      console.log("✅ Redis is already empty");
      process.exit(0);
    }

    // Show what will be deleted
    const sessions = allKeys.filter((k) => k.startsWith("session:"));
    const compromised = allKeys.filter((k) => k.startsWith("compromised:"));
    const dedup = allKeys.filter((k) => k.startsWith("dedup:"));
    const bull = allKeys.filter((k) => k.startsWith("bull:"));
    const other = allKeys.filter(
      (k) =>
        !k.startsWith("session:") &&
        !k.startsWith("compromised:") &&
        !k.startsWith("dedup:") &&
        !k.startsWith("bull:"),
    );

    console.log(`\n📊 Keys to delete:`);
    console.log(`  - Sessions: ${sessions.length}`);
    console.log(`  - Compromised flags: ${compromised.length}`);
    console.log(`  - Deduplication: ${dedup.length}`);
    console.log(`  - BullMQ jobs: ${bull.length}`);
    console.log(`  - Other: ${other.length}`);

    // Delete all keys
    for (const key of allKeys) {
      await redis.del(key);
    }

    console.log(`\n✅ Cleared ${allKeys.length} keys from Redis`);
    console.log("🔄 Redis is now ready for fresh campaign start");

    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

clearRedis();
