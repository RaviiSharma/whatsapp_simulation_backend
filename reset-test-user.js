/**
 * Clear session for specific user to allow fresh testing
 */

const redis = require("./project/src/config/redis");

const phoneNumber = "919102901737"; // The test user from logs

async function clearUserSession() {
  try {
    console.log(`🧹 Clearing session for ${phoneNumber}...\n`);

    // Clear session
    const sessionKey = `session:${phoneNumber}`;
    const session = await redis.get(sessionKey);
    if (session) {
      console.log(`Found session: ${JSON.stringify(session)}`);
      await redis.del(sessionKey);
      console.log(`✅ Deleted session for ${phoneNumber}`);
    } else {
      console.log(`No session found for ${phoneNumber}`);
    }

    // Clear any compromised flag
    const compromisedKey = `compromised:${phoneNumber}`;
    const compromised = await redis.get(compromisedKey);
    if (compromised) {
      console.log(`Found compromised flag: ${JSON.stringify(compromised)}`);
      await redis.del(compromisedKey);
      console.log(`✅ Cleared compromised flag for ${phoneNumber}`);
    } else {
      console.log(`No compromised flag for ${phoneNumber}`);
    }

    console.log(`\n✅ User ${phoneNumber} reset - ready for fresh test`);
    console.log(`\n📋 Next test flow:`);
    console.log(`1. User says "hello" → hackerAgent continues ✅`);
    console.log(
      `2. User shares "my otp is 123456" → AI detects CRITICAL risk → Switch to riskAgent ✅`,
    );

    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

clearUserSession();
