/**
 * Diagnostic: Check why AI fraud detection returns CRITICAL for every message
 */

const axios = require("axios");

const AI_BASE_URL = "http://localhost:4000";

async function testFraudDetection() {
  console.log("🧪 Testing AI Fraud Detection Server\n");

  const testCases = [
    {
      userId: "test_user_1",
      text: "hello",
      agentName: "hackerAgent",
      expected: "low",
    },
    {
      userId: "test_user_1",
      text: "okay",
      agentName: "hackerAgent",
      expected: "low",
    },
    {
      userId: "test_user_1",
      text: "my otp is 123456",
      agentName: "hackerAgent",
      expected: "critical",
    },
    {
      userId: "test_user_1",
      text: "I dont understand",
      agentName: "riskAgent",
      expected: "low/medium",
    },
  ];

  console.log("Testing fraud detection with sequential messages:\n");

  for (const test of testCases) {
    try {
      console.log(`\n📤 Sending: "${test.text}" (agent: ${test.agentName})`);

      const res = await axios.post(
        `${AI_BASE_URL}/api/fraud_detection`,
        {
          userId: test.userId,
          text: test.text,
          sessionId: test.userId,
          agentName: test.agentName,
        },
        { timeout: 10000 },
      );

      const riskLevel = res.data?.risk?.risk_level || "unknown";
      const reasons = res.data?.risk?.reasons || [];

      console.log(`📥 Response: risk_level = "${riskLevel}"`);
      console.log(`   Expected: ${test.expected}`);
      console.log(`   Reasons: ${reasons.join(", ") || "none"}`);

      if (riskLevel === "critical" && test.expected !== "critical") {
        console.log(`   ⚠️ WARNING: AI is over-detecting fraud!`);
      }

      // Wait 1 second between requests
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (err) {
      console.error(`❌ Error: ${err.message}`);
      if (err.code === "ECONNREFUSED") {
        console.log("\n⚠️ AI server is not running at localhost:4000");
        console.log("Please start your AI fraud detection server first.");
        break;
      }
    }
  }

  console.log("\n📋 Diagnosis:");
  console.log(
    'If AI returns "critical" for every message after the first OTP:',
  );
  console.log(
    "- AI server is maintaining session state and marking user as compromised",
  );
  console.log(
    "- AI should only detect fraud in CURRENT message, not persist state",
  );
  console.log(
    "- Solution: AI server should NOT cache user risk level across requests",
  );
}

testFraudDetection();
