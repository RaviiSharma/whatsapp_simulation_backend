/**
 * Fraud Report Service
 *
 * Manages fraud reports in MongoDB
 * Provides CRUD operations and admin queries
 */

const { connectMongo, getDb } = require("../config/mongodb");
const FraudReport = require("../models/fraudReport.model");

const COLLECTION = "fraud_reports";

/**
 * Create fraud report
 *
 * @param {object} reportData - Fraud report data
 * @returns {Promise<object>} Created report with _id
 */
async function createFraudReport(reportData) {
  try {
    const report = new FraudReport(reportData);
    report.validate();

    const db = getDb();
    const collection = db.collection(COLLECTION);

    const result = await collection.insertOne(report.toDocument());

    console.log(
      `🚨 Fraud report created: ${report.caseId} (${report.riskLevel}) - ID: ${result.insertedId}`,
    );

    return {
      ...report.toDocument(),
      _id: result.insertedId,
    };
  } catch (err) {
    console.error(`❌ Failed to create fraud report:`, err.message);
    throw err;
  }
}

/**
 * Get fraud report by ID
 *
 * @param {string} reportId - Report ID
 * @returns {Promise<object|null>} Fraud report or null
 */
async function getFraudReport(reportId) {
  try {
    const db = getDb();
    const collection = db.collection(COLLECTION);

    const { ObjectId } = require("mongodb");
    const doc = await collection.findOne({ _id: new ObjectId(reportId) });

    return FraudReport.fromDocument(doc);
  } catch (err) {
    console.error(`❌ Failed to get fraud report ${reportId}:`, err.message);
    return null;
  }
}

/**
 * Get fraud reports by phone number
 *
 * @param {string} phoneNumber - User's phone number
 * @param {number} limit - Max results (default 10)
 * @returns {Promise<array>} Fraud reports
 */
async function getFraudReportsByPhone(phoneNumber, limit = 10) {
  try {
    const db = getDb();
    const collection = db.collection(COLLECTION);

    const docs = await collection
      .find({ phoneNumber })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return docs.map((doc) => FraudReport.fromDocument(doc));
  } catch (err) {
    console.error(
      `❌ Failed to get fraud reports for ${phoneNumber}:`,
      err.message,
    );
    return [];
  }
}

/**
 * Get fraud reports by status
 *
 * @param {string} status - Report status (new, reviewed, escalated, resolved)
 * @param {number} limit - Max results (default 50)
 * @returns {Promise<array>} Fraud reports
 */
async function getFraudReportsByStatus(status, limit = 50) {
  try {
    const db = getDb();
    const collection = db.collection(COLLECTION);

    const docs = await collection
      .find({ status })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return docs.map((doc) => FraudReport.fromDocument(doc));
  } catch (err) {
    console.error(
      `❌ Failed to get fraud reports by status ${status}:`,
      err.message,
    );
    return [];
  }
}

/**
 * Get fraud reports by risk level
 *
 * @param {string} riskLevel - Risk level (LOW, MEDIUM, HIGH, CRITICAL)
 * @param {number} limit - Max results (default 50)
 * @returns {Promise<array>} Fraud reports
 */
async function getFraudReportsByRiskLevel(riskLevel, limit = 50) {
  try {
    const db = getDb();
    const collection = db.collection(COLLECTION);

    const docs = await collection
      .find({ riskLevel })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return docs.map((doc) => FraudReport.fromDocument(doc));
  } catch (err) {
    console.error(
      `❌ Failed to get fraud reports by risk level ${riskLevel}:`,
      err.message,
    );
    return [];
  }
}

/**
 * Get all fraud reports
 *
 * @param {number} limit - Max results (default 50)
 * @returns {Promise<array>} Fraud reports
 */
async function getAllFraudReports(limit = 50) {
  try {
    const db = getDb();
    const collection = db.collection(COLLECTION);

    const docs = await collection
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return docs.map((doc) => FraudReport.fromDocument(doc));
  } catch (err) {
    console.error(`❌ Failed to get all fraud reports:`, err.message);
    return [];
  }
}

/**
 * Update fraud report status
 *
 * @param {string} reportId - Report ID
 * @param {string} status - New status
 * @param {string} reviewedBy - Admin user ID
 * @param {string} notes - Review notes (optional)
 * @returns {Promise<boolean>} Success status
 */
async function updateFraudReportStatus(
  reportId,
  status,
  reviewedBy,
  notes = null,
) {
  try {
    const db = getDb();
    const collection = db.collection(COLLECTION);

    const { ObjectId } = require("mongodb");
    const updateData = {
      status,
      reviewedAt: new Date(),
      reviewedBy,
      updatedAt: new Date(),
    };

    if (notes) {
      updateData.notes = notes;
    }

    const result = await collection.updateOne(
      { _id: new ObjectId(reportId) },
      { $set: updateData },
    );

    if (result.matchedCount === 0) {
      console.warn(`⚠️ Fraud report ${reportId} not found`);
      return false;
    }

    console.log(`✅ Fraud report ${reportId} updated to status: ${status}`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to update fraud report ${reportId}:`, err.message);
    return false;
  }
}

/**
 * Get fraud report statistics
 *
 * @returns {Promise<object>} Statistics
 */
async function getFraudReportStats() {
  try {
    const db = getDb();
    const collection = db.collection(COLLECTION);

    const [totalCount, statusCounts, riskCounts, recentReports] =
      await Promise.all([
        // Total reports
        collection.countDocuments(),

        // Counts by status
        collection
          .aggregate([
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
              },
            },
          ])
          .toArray(),

        // Counts by risk level
        collection
          .aggregate([
            {
              $group: {
                _id: "$riskLevel",
                count: { $sum: 1 },
              },
            },
          ])
          .toArray(),

        // Recent reports (last 24 hours)
        collection.countDocuments({
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        }),
      ]);

    // Convert aggregation results to objects
    const byStatus = {};
    statusCounts.forEach((item) => {
      byStatus[item._id] = item.count;
    });

    const byRiskLevel = {};
    riskCounts.forEach((item) => {
      byRiskLevel[item._id] = item.count;
    });

    return {
      total: totalCount,
      byStatus,
      byRiskLevel,
      last24Hours: recentReports,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`❌ Failed to get fraud report stats:`, err.message);
    return {
      total: 0,
      byStatus: {},
      byRiskLevel: {},
      last24Hours: 0,
      error: err.message,
    };
  }
}

/**
 * Search fraud reports
 *
 * @param {object} query - Search criteria
 * @param {number} limit - Max results (default 50)
 * @returns {Promise<array>} Fraud reports
 */
async function searchFraudReports(query, limit = 50) {
  try {
    const db = getDb();
    const collection = db.collection(COLLECTION);

    const docs = await collection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return docs.map((doc) => FraudReport.fromDocument(doc));
  } catch (err) {
    console.error(`❌ Failed to search fraud reports:`, err.message);
    return [];
  }
}

/**
 * Delete fraud report (admin only)
 *
 * @param {string} reportId - Report ID
 * @returns {Promise<boolean>} Success status
 */
async function deleteFraudReport(reportId) {
  try {
    const db = getDb();
    const collection = db.collection(COLLECTION);

    const { ObjectId } = require("mongodb");
    const result = await collection.deleteOne({ _id: new ObjectId(reportId) });

    if (result.deletedCount === 0) {
      console.warn(`⚠️ Fraud report ${reportId} not found`);
      return false;
    }

    console.log(`✅ Fraud report ${reportId} deleted`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to delete fraud report ${reportId}:`, err.message);
    return false;
  }
}

/**
 * Initialize fraud reports collection with indexes
 */
async function initializeFraudReports() {
  try {
    const db = getDb();
    const collection = db.collection(COLLECTION);

    // Create indexes for performance
    await collection.createIndex({ phoneNumber: 1 });
    await collection.createIndex({ status: 1 });
    await collection.createIndex({ riskLevel: 1 });
    await collection.createIndex({ createdAt: -1 });
    await collection.createIndex({ agent: 1 });

    // Compound index for common queries
    await collection.createIndex({ status: 1, riskLevel: 1 });

    console.log("✅ Fraud reports collection initialized");
  } catch (err) {
    console.error(`❌ Failed to initialize fraud reports:`, err.message);
  }
}

module.exports = {
  createFraudReport,
  getFraudReport,
  getFraudReportsByPhone,
  getFraudReportsByStatus,
  getFraudReportsByRiskLevel,
  getAllFraudReports,
  updateFraudReportStatus,
  getFraudReportStats,
  searchFraudReports,
  deleteFraudReport,
  initializeFraudReports,
};
