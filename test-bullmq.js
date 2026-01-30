/**
 * Test BullMQ and Redis Connection
 */

require("dotenv").config();
const { Queue } = require("bullmq");

const redisConnection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  username: process.env.REDIS_USERNAME || "default",
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

async function testBullMQ() {
  console.log("\n🧪 Testing BullMQ & Redis Connection...\n");

  try {
    // Create test queue
    console.log("1️⃣ Creating BullMQ queue...");
    const testQueue = new Queue("test-queue", {
      connection: redisConnection,
    });

    console.log("✅ Queue created successfully");

    // Add a test job
    console.log("\n2️⃣ Adding test job to queue...");
    const job = await testQueue.add(
      "test-job",
      { message: "Hello BullMQ!" },
      { jobId: `test-${Date.now()}` },
    );
    console.log(`✅ Job added: ${job.id}`);

    // Get job counts
    console.log("\n3️⃣ Getting queue statistics...");
    const counts = await testQueue.getJobCounts();
    console.log("Queue Stats:", JSON.stringify(counts, null, 2));

    // Check if job exists
    console.log("\n4️⃣ Verifying job...");
    const retrievedJob = await testQueue.getJob(job.id);
    if (retrievedJob) {
      console.log(`✅ Job verified: ${retrievedJob.id}`);
      console.log(`   Data:`, retrievedJob.data);
    }

    // Clean up test job
    console.log("\n5️⃣ Cleaning up test job...");
    await retrievedJob.remove();
    console.log("✅ Test job removed");

    // Check campaign queue
    console.log("\n6️⃣ Checking campaign-assignments queue...");
    const campaignQueue = new Queue("campaign-assignments", {
      connection: redisConnection,
    });
    const campaignCounts = await campaignQueue.getJobCounts();
    console.log(
      "Campaign Queue Stats:",
      JSON.stringify(campaignCounts, null, 2),
    );

    // Close connections
    await testQueue.close();
    await campaignQueue.close();

    console.log(
      "\n✅ All tests passed! BullMQ and Redis are working correctly.\n",
    );
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Test failed:", err.message);
    console.error("Stack:", err.stack);
    process.exit(1);
  }
}

testBullMQ();
