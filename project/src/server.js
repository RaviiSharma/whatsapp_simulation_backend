/**
 * Server Entry Point
 *
 * Initializes Express server with MongoDB connection and graceful shutdown
 */

const app = require("./app");
const { PORT } = require("./config/env");
const mongodb = require("./config/mongodb");
const redis = require("./config/redis");
const fraudReport = require("./services/fraudReport.service");

/**
 * Initialize MongoDB connection
 */
async function init() {
  console.log("🚀 Initializing WhatsApp AI Webhook System...");

  try {
    // Connect to Redis (with fallback to in-memory)
    await redis.connectRedis();

    // Connect to MongoDB (with fallback to in-memory)
    await mongodb.connectMongo();

    // Initialize fraud reports collection
    await fraudReport.initializeFraudReports();

    // Start HTTP server
    const server = app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(
        `📊 Storage MongoDB: ${mongodb.getStatus().mongodb ? "Connected" : "In-Memory (fallback)"}`,
      );
      console.log(
        `📊 Storage Redis: ${redis.getStatus().redis ? "Connected" : "In-Memory (fallback)"}`,
      );
      console.log(
        `🎯 Agents: hackerAgent, benignAgent, policyAgent, riskAgent`,
      );
      console.log(
        `\n🔗 Webhook endpoint: POST http://localhost:${PORT}/webhook`,
      );
      console.log(
        `🔗 Admin dashboard: GET http://localhost:${PORT}/admin/stats`,
      );
      console.log(
        `🔗 Fraud reports: GET http://localhost:${PORT}/admin/fraud/reports`,
      );
    });

    // Graceful shutdown handlers
    setupGracefulShutdown(server);
  } catch (err) {
    console.error("❌ Failed to start server:", err.message);
    process.exit(1);
  }
}

/**
 * Graceful shutdown configuration
 */
function setupGracefulShutdown(server) {
  function shutdown(signal) {
    console.log(`\n⚠️  Received ${signal}. Shutting down gracefully...`);

    server.close(async () => {
      console.log("✅ HTTP server closed");

      // Close connections
      await mongodb.close();
      await redis.close();

      console.log("✅ All connections closed");
      process.exit(0);
    });

    // Force exit if not closed in 10s
    setTimeout(() => {
      console.error("❌ Force exiting after timeout");
      process.exit(1);
    }, 10000);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  /**
   * Catch unexpected crashes (AI / axios / promise issues)
   */
  process.on("uncaughtException", (err) => {
    console.error("🔥 Uncaught Exception:", err);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("🔥 Unhandled Promise Rejection:", reason);
  });
}

// Start the server
init();
