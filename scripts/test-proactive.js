/**
 * Test Proactive Messaging
 *
 * Quick script to test proactive conversation initiation
 *
 * Usage:
 * node scripts/test-proactive.js 919102901737 hackerAgent
 */

const axios = require("axios");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

async function testProactiveStart(phoneNumber, preferredAgent = null) {
  console.log("\n🧪 Testing proactive conversation start");
  console.log(`📱 Phone Number: ${phoneNumber}`);
  console.log(`🤖 Preferred Agent: ${preferredAgent || "auto-assign"}\n`);

  try {
    // 1. Check eligibility
    console.log("📋 Step 1: Checking eligibility...");
    const eligibilityRes = await axios.get(
      `${BASE_URL}/proactive/check/${phoneNumber}`,
    );
    console.log("✅ Eligibility check:", eligibilityRes.data);

    if (!eligibilityRes.data.eligible) {
      console.log("⚠️ User not eligible:", eligibilityRes.data.reason);
      return;
    }

    // 2. Start conversation
    console.log("\n🚀 Step 2: Starting proactive conversation...");
    const startRes = await axios.post(`${BASE_URL}/proactive/start`, {
      phoneNumber,
      preferredAgent,
      templateParams: {
        agentName: "Test Agent",
      },
    });

    console.log("✅ Conversation started:", startRes.data);

    // 3. Verify session created
    console.log("\n🔍 Step 3: Verifying session...");
    const sessionRes = await axios.get(`${BASE_URL}/admin/user/${phoneNumber}`);
    console.log("✅ Session verified:", sessionRes.data);

    // 4. Get stats
    console.log("\n📊 Step 4: Getting proactive stats...");
    const statsRes = await axios.get(`${BASE_URL}/proactive/stats`);
    console.log("✅ Stats:", statsRes.data);

    console.log("\n✅ Test completed successfully!");
    console.log("\n📱 Next steps:");
    console.log(`   1. Check WhatsApp on ${phoneNumber}`);
    console.log("   2. Reply to the template message");
    console.log("   3. AI will respond using the assigned agent");
  } catch (err) {
    console.error("\n❌ Test failed:");

    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Error:", err.response.data);
    } else {
      console.error("Error:", err.message);
    }
  }
}

async function testBatchStart(phoneNumbers, preferredAgent = null) {
  console.log("\n🧪 Testing batch proactive start");
  console.log(`📱 Phone Numbers: ${phoneNumbers.join(", ")}`);
  console.log(`🤖 Preferred Agent: ${preferredAgent || "auto-assign"}\n`);

  try {
    const res = await axios.post(`${BASE_URL}/proactive/batch`, {
      phoneNumbers,
      preferredAgent,
    });

    console.log("✅ Batch result:");
    console.log(`   Total: ${res.data.total}`);
    console.log(`   Successful: ${res.data.successful}`);
    console.log(`   Failed: ${res.data.failed}`);
    console.log("\nDetails:");
    res.data.results.forEach((r) => {
      const status = r.success ? "✅" : "❌";
      console.log(`   ${status} ${r.phoneNumber}: ${r.message || r.error}`);
    });
  } catch (err) {
    console.error("\n❌ Batch test failed:");

    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Error:", err.response.data);
    } else {
      console.error("Error:", err.message);
    }
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
Usage:
  node scripts/test-proactive.js <phoneNumber> [preferredAgent]
  node scripts/test-proactive.js --batch <phone1> <phone2> ... [preferredAgent]

Examples:
  node scripts/test-proactive.js 919102901737
  node scripts/test-proactive.js 919102901737 hackerAgent
  node scripts/test-proactive.js --batch 919102901737 919102901738 hackerAgent

Available agents:
  - hackerAgent
  - benignAgent
  - policyAgent
  - riskAgent
`);
  process.exit(1);
}

if (args[0] === "--batch") {
  const phoneNumbers = [];
  let preferredAgent = null;

  for (let i = 1; i < args.length; i++) {
    if (args[i].match(/^[1-9]\d{10,14}$/)) {
      phoneNumbers.push(args[i]);
    } else {
      preferredAgent = args[i];
    }
  }

  if (phoneNumbers.length === 0) {
    console.error("❌ No valid phone numbers provided");
    process.exit(1);
  }

  testBatchStart(phoneNumbers, preferredAgent);
} else {
  const phoneNumber = args[0];
  const preferredAgent = args[1] || null;

  if (!phoneNumber.match(/^[1-9]\d{10,14}$/)) {
    console.error("❌ Invalid phone number format");
    console.error("Expected: Country code + number (no + or spaces)");
    console.error("Example: 919102901737");
    process.exit(1);
  }

  testProactiveStart(phoneNumber, preferredAgent);
}
