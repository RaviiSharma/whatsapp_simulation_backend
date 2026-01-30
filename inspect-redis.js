/**
 * Check Redis for any cached data that might cause premature agent switching
 */

const redis = require("./project/src/config/redis");

async function inspectRedis() {
  try {
    console.log("🔍 Inspecting Redis for agent switching issues...\n");

    // Check for compromised flags
    console.log("1. Compromised flags:");
    const compromisedKeys = await redis.keys("compromised:*");
    console.log(`   Found ${compromisedKeys.length} compromised user(s)`);
    for (const key of compromisedKeys) {
      const data = await redis.get(key);
      console.log(`   - ${key}: ${JSON.stringify(data)}`);
    }

    // Check for sessions
    console.log("\n2. Active sessions:");
    const sessionKeys = await redis.keys("session:*");
    console.log(`   Found ${sessionKeys.length} session(s)`);
    for (const key of sessionKeys) {
      const data = await redis.get(key);
      console.log(`   - ${key}: ${JSON.stringify(data)}`);
    }

    // Check for fraud reports
    console.log("\n3. Fraud detection keys:");
    const fraudKeys = await redis.keys("fraud:*");
    console.log(`   Found ${fraudKeys.length} fraud key(s)`);

    // Check all keys
    console.log("\n4. All Redis keys:");
    const allKeys = await redis.keys("*");
    console.log(`   Total keys in Redis: ${allKeys.length}`);

    console.log("\n✅ Inspection complete");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

inspectRedis();
