/**
 * Check BullMQ Queue and Worker Status
 */

require("dotenv").config();
const {
  assignmentQueue,
  getQueueStats,
} = require("./project/src/services/assignmentQueue.service");

async function checkStatus() {
  try {
    console.log("\n📊 Campaign Assignment Queue Status\n");
    console.log("=".repeat(50));

    // Get queue stats
    const stats = await getQueueStats();
    console.log("\n📈 Job Counts:");
    console.log(`   Waiting:   ${stats.waiting}`);
    console.log(`   Active:    ${stats.active}`);
    console.log(`   Completed: ${stats.completed}`);
    console.log(`   Failed:    ${stats.failed}`);
    console.log(`   Delayed:   ${stats.delayed}`);
    console.log(`   Total:     ${stats.total}`);

    // Check if worker is running
    const workers = await assignmentQueue.getWorkers();
    console.log(`\n👷 Active Workers: ${workers.length}`);
    if (workers.length > 0) {
      console.log("   Worker IDs:", workers.map((w) => w.id).join(", "));
    } else {
      console.log(
        "   ⚠️  No workers detected - jobs will queue but not process",
      );
    }

    // Get recent jobs
    console.log("\n📋 Recent Jobs:");
    const completedJobs = await assignmentQueue.getCompleted(0, 5);
    const failedJobs = await assignmentQueue.getFailed(0, 5);
    const waitingJobs = await assignmentQueue.getWaiting(0, 5);

    if (completedJobs.length > 0) {
      console.log(
        `   ✅ ${completedJobs.length} completed jobs (showing latest):`,
      );
      completedJobs.forEach((job) => {
        console.log(`      - ${job.name} (${job.id})`);
      });
    }

    if (failedJobs.length > 0) {
      console.log(`   ❌ ${failedJobs.length} failed jobs:`);
      failedJobs.forEach((job) => {
        console.log(`      - ${job.name} (${job.id}): ${job.failedReason}`);
      });
    }

    if (waitingJobs.length > 0) {
      console.log(`   ⏳ ${waitingJobs.length} waiting jobs:`);
      waitingJobs.forEach((job) => {
        console.log(`      - ${job.name} (${job.id})`);
      });
    }

    if (
      completedJobs.length === 0 &&
      failedJobs.length === 0 &&
      waitingJobs.length === 0
    ) {
      console.log("   No recent jobs found");
    }

    console.log("\n" + "=".repeat(50));

    if (workers.length === 0 && stats.waiting > 0) {
      console.log(
        "\n⚠️  WARNING: Jobs are queued but no workers are processing them!",
      );
      console.log("   Make sure the server is running: npm start");
    } else if (workers.length > 0) {
      console.log("\n✅ Queue and Worker are operational!");
    } else {
      console.log("\n✅ Queue is ready (no pending jobs)");
    }

    await assignmentQueue.close();
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Error:", err.message);
    process.exit(1);
  }
}

checkStatus();
