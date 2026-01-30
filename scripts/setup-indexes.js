#!/usr/bin/env node
/**
 * MongoDB Index Setup Script
 *
 * Run this script to create all production indexes:
 * $ node scripts/setup-indexes.js
 */

const indexes = require("../project/src/config/indexes");
const mongodb = require("../project/src/config/mongodb");

async function main() {
  try {
    console.log("🚀 Starting MongoDB index setup...\n");

    // Connect to MongoDB
    await mongodb.connect();
    console.log("✅ Connected to MongoDB\n");

    // Create all indexes
    const results = await indexes.createAllIndexes();

    // Display summary
    console.log("\n📊 Index Creation Summary:");
    console.log("================================");
    for (const [collection, indexList] of Object.entries(results)) {
      console.log(`\n${collection}: ${indexList.length} indexes`);
      indexList.forEach((name) => {
        console.log(`  ✅ ${name}`);
      });
    }

    console.log("\n✅ Index setup complete!");

    // Optionally verify indexes
    console.log("\n🔍 Verifying indexes...");
    for (const collection of Object.keys(results)) {
      const indexList = await indexes.listIndexes(collection);
      console.log(`  ${collection}: ${indexList.length} total indexes`);
    }

    console.log("\n✅ Verification complete!");
  } catch (err) {
    console.error("\n❌ Index setup failed:", err.message);
    process.exit(1);
  } finally {
    await mongodb.close();
    process.exit(0);
  }
}

main();
