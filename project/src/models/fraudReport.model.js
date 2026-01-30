/**
 * Fraud Report Model (MongoDB) - Production Grade
 *
 * Stores fraud detection reports for admin review and compliance
 * Supports: case management, risk scoring, escalation tracking, audit logs
 */

const { ObjectId } = require("mongodb");
const crypto = require("crypto");

/**
 * Generate case ID (human-readable)
 * Format: FRAUD-YYYY-NNNNNN
 */
function generateCaseId() {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, "0");
  return `FRAUD-${year}-${random}`;
}

/**
 * Hash PII for compliance (one-way hash)
 */
function hashPII(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Fraud Report Schema
 *
 * Collection: fraud_reports
 */
class FraudReport {
  constructor({
    phoneNumber,
    agent,
    riskLevel,
    evidence,
    conversationSnippet = [],
    metadata = {},
  }) {
    // CRITICAL: Validate phoneNumber is provided
    if (!phoneNumber || typeof phoneNumber !== "string") {
      throw new Error(
        "phoneNumber is required and must be a string (pass plain value, will be hashed internally)",
      );
    }

    // Case Management
    this.caseId = generateCaseId();

    // PII (Hashed for compliance)
    this.phoneNumberHash = hashPII(phoneNumber);
    this.phoneNumberLast4 = phoneNumber.slice(-4); // For support lookup

    // Event Classification
    this.eventType = this._determineEventTypes(evidence);
    this.eventCategory = this._determineEventCategory(this.eventType);

    // Risk Assessment
    this.riskLevel = riskLevel; // LOW | MEDIUM | HIGH | CRITICAL
    this.riskScore = this._calculateRiskScore(evidence, riskLevel); // Must align with riskLevel
    this.compromised = this.riskScore >= 20; // Boolean flag

    // Evidence (Masked)
    this.maskedEvidence = {
      otp: evidence.otp ? `**${evidence.otp.slice(-2)}` : null, // Last 2 digits
      card: evidence.card ? `****${evidence.card.slice(-4)}` : null, // Last 4
      cvv: evidence.cvv ? "***" : null,
      link: evidence.clickedLink || null,
      linkCount: evidence.linkCount || 0,
      password: evidence.password ? "****" : null,
    };

    // Detection Context
    this.activeAgentAtDetection = agent; // Agent active when fraud was detected (not who detected it)
    this.detectedAgent = agent; // Kept for backwards compatibility - will be deprecated
    this.detectedAt = metadata.detectedAt || new Date();
    this.messageId = metadata.messageId || null;

    // Agent Routing
    this.agentSwitched = false;
    this.previousAgent = null;
    this.newAgent = null;
    this.switchedAt = null;

    // Escalation Tracking
    // escalationStatus rules:
    //   - "urgent": CRITICAL risk, requires immediate SOC review
    //   - "escalated": HIGH risk, requires analyst assignment within 1 hour
    //   - "pending": MEDIUM/LOW risk, queued for review
    // escalatedTo can be: "soc", "security_team", "compliance", "external_authority"
    this.escalationStatus = this._determineEscalationStatus(this.riskLevel);
    this.escalatedTo = null; // Populated by admin or automated workflow
    this.escalatedAt = null; // Set when escalation occurs
    this.assignedAnalyst = null; // Human analyst ID or email

    // Conversation Context
    this.conversationSnippet = conversationSnippet;

    // Protective Actions Taken
    this.actionsTaken = [];

    // Compliance & Audit
    this.complianceFlags = {
      gdprApplies: true,
      dataRetentionDays: 90,
      consentCaptured: false,
      reportedToAuthorities: false,
    };
    this.auditLog = [
      {
        action: "case_created",
        by: "system",
        timestamp: new Date(),
      },
    ];

    // Status Tracking
    this.status = "active"; // active | investigating | resolved | false_positive
    this.resolvedAt = null;
    this.resolution = null;

    // Metadata
    this.metadata = {
      serverVersion: "2.0.0",
      environmentType: process.env.NODE_ENV || "development",
      detectionLatencyMs: metadata.detectionLatencyMs || null,
      geoLocation: metadata.geoLocation || "unknown",
      deviceType: metadata.deviceType || "mobile",
      ...metadata,
    };

    // Timestamps
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  /**
   * Determine event types from evidence
   */
  _determineEventTypes(evidence) {
    const types = [];
    if (evidence.otp) types.push("otp_shared");
    if (evidence.card) types.push("card_shared");
    if (evidence.cvv) types.push("cvv_shared");
    if (evidence.clickedLink) types.push("link_clicked");
    if (evidence.password) types.push("password_shared");
    return types;
  }

  /**
   * Determine event category
   */
  _determineEventCategory(eventTypes) {
    if (
      eventTypes.includes("card_shared") ||
      eventTypes.includes("cvv_shared")
    ) {
      return "financial_fraud";
    }
    if (
      eventTypes.includes("otp_shared") ||
      eventTypes.includes("password_shared")
    ) {
      return "credential_theft";
    }
    if (eventTypes.includes("link_clicked")) {
      return "phishing";
    }
    return "social_engineering";
  }

  /**
   * Calculate risk score (0-100) - must align with riskLevel
   */
  _calculateRiskScore(evidence, riskLevel) {
    // Start with evidence-based score
    let evidenceScore = 0;
    if (evidence.otp) evidenceScore += 40;
    if (evidence.card) evidenceScore += 50;
    if (evidence.cvv) evidenceScore += 30;
    if (evidence.clickedLink) evidenceScore += 20;
    if (evidence.password) evidenceScore += 45;
    evidenceScore = Math.min(evidenceScore, 100);

    // Ensure score aligns with riskLevel
    // CRITICAL: 76-100, HIGH: 51-75, MEDIUM: 21-50, LOW: 0-20
    const riskLevelScores = {
      CRITICAL: { min: 76, default: 85 },
      HIGH: { min: 51, default: 65 },
      MEDIUM: { min: 21, default: 40 },
      LOW: { min: 0, default: 15 },
    };

    const levelRange = riskLevelScores[riskLevel];
    if (levelRange) {
      // If evidence score is too low for the risk level, use the default
      if (evidenceScore < levelRange.min) {
        return levelRange.default;
      }
      // Otherwise use evidence score but ensure it's within range
      if (riskLevel === "CRITICAL") return Math.max(evidenceScore, 76);
      if (riskLevel === "HIGH")
        return Math.max(51, Math.min(evidenceScore, 75));
      if (riskLevel === "MEDIUM")
        return Math.max(21, Math.min(evidenceScore, 50));
      return Math.min(evidenceScore, 20);
    }

    return evidenceScore;
  }

  /**
   * Determine initial escalation status
   */
  _determineEscalationStatus(riskLevel) {
    switch (riskLevel) {
      case "CRITICAL":
        return "urgent";
      case "HIGH":
        return "escalated";
      case "MEDIUM":
        return "pending";
      default:
        return "pending";
    }
  }

  /**
   * Record agent switch
   */
  recordAgentSwitch(previousAgent, newAgent) {
    this.agentSwitched = true;
    this.previousAgent = previousAgent;
    this.newAgent = newAgent;
    this.switchedAt = new Date();

    this.actionsTaken.push({
      action: "switch_agent",
      from: previousAgent,
      to: newAgent,
      timestamp: new Date(),
    });

    this.auditLog.push({
      action: "agent_switched",
      by: "system",
      details: { previousAgent, newAgent },
      timestamp: new Date(),
    });

    this.updatedAt = new Date();
  }

  /**
   * Record protective action
   */
  recordAction(action, details = {}) {
    this.actionsTaken.push({
      action,
      ...details,
      timestamp: new Date(),
    });

    this.auditLog.push({
      action: `action_${action}`,
      by: "system",
      details,
      timestamp: new Date(),
    });

    this.updatedAt = new Date();
  }

  /**
   * Escalate case
   *
   * @param {string} escalatedTo - Target: "soc", "security_team", "compliance", "external_authority"
   * @param {string} assignedAnalyst - Optional analyst identifier (email/ID)
   */
  escalate(escalatedTo, assignedAnalyst = null) {
    // Validate escalation target
    const validTargets = [
      "soc",
      "security_team",
      "compliance",
      "external_authority",
    ];
    if (!validTargets.includes(escalatedTo)) {
      throw new Error(`escalatedTo must be one of: ${validTargets.join(", ")}`);
    }

    this.escalationStatus = "escalated";
    this.escalatedTo = escalatedTo;
    this.escalatedAt = new Date();
    this.assignedAnalyst = assignedAnalyst;

    this.auditLog.push({
      action: "escalation",
      by: assignedAnalyst || "system",
      details: { escalatedTo },
      timestamp: new Date(),
    });

    this.updatedAt = new Date();
  }

  /**
   * Resolve case
   */
  resolve(resolution, resolvedBy = "system") {
    this.status = "resolved";
    this.resolvedAt = new Date();
    this.resolution = resolution;

    this.auditLog.push({
      action: "case_resolved",
      by: resolvedBy,
      details: { resolution },
      timestamp: new Date(),
    });

    this.updatedAt = new Date();
  }

  /**
   * Validate fraud report data
   */
  validate() {
    if (!this.phoneNumberHash || typeof this.phoneNumberHash !== "string") {
      throw new Error("phoneNumberHash is required and must be a string");
    }

    if (!this.detectedAgent || typeof this.detectedAgent !== "string") {
      throw new Error("detectedAgent is required and must be a string");
    }

    const validRiskLevels = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
    if (!validRiskLevels.includes(this.riskLevel)) {
      throw new Error(
        `riskLevel must be one of: ${validRiskLevels.join(", ")}`,
      );
    }

    if (!this.maskedEvidence || typeof this.maskedEvidence !== "object") {
      throw new Error("maskedEvidence is required and must be an object");
    }

    return true;
  }

  /**
   * Convert to MongoDB document
   */
  toDocument() {
    return {
      caseId: this.caseId,
      phoneNumberHash: this.phoneNumberHash,
      phoneNumberLast4: this.phoneNumberLast4,
      eventType: this.eventType,
      eventCategory: this.eventCategory,
      riskScore: this.riskScore,
      riskLevel: this.riskLevel,
      compromised: this.compromised,
      maskedEvidence: this.maskedEvidence,
      detectedAgent: this.detectedAgent,
      detectedAt: this.detectedAt,
      messageId: this.messageId,
      agentSwitched: this.agentSwitched,
      previousAgent: this.previousAgent,
      newAgent: this.newAgent,
      switchedAt: this.switchedAt,
      escalationStatus: this.escalationStatus,
      escalatedTo: this.escalatedTo,
      escalatedAt: this.escalatedAt,
      assignedAnalyst: this.assignedAnalyst,
      conversationSnippet: this.conversationSnippet,
      actionsTaken: this.actionsTaken,
      complianceFlags: this.complianceFlags,
      auditLog: this.auditLog,
      status: this.status,
      resolvedAt: this.resolvedAt,
      resolution: this.resolution,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * Create from MongoDB document
   */
  static fromDocument(doc) {
    if (!doc) return null;

    // Create minimal instance (skip constructor logic)
    const report = Object.create(FraudReport.prototype);

    // Copy all fields
    Object.assign(report, doc);

    return report;
  }
}

module.exports = FraudReport;
