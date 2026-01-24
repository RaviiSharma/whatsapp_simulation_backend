/**
 * Message Deduplication Utility
 *
 * Prevents duplicate processing of webhook messages when Meta retries delivery.
 * Uses MongoDB with 24-hour TTL for message ID tracking.
 */

const mongodb = require("../config/mongodb");

const DEDUP_TTL = 86400; // 24 hours in seconds

/**
 * Check if message ID has already been processed
 *
 * @param {string} messageId - WhatsApp message ID
 * @returns {Promise<boolean>} True if already processed (duplicate)
 */
async function isDuplicate(messageId) {
  try {
    if (!messageId) {
      console.warn("⚠️ No message ID provided for deduplication check");
      return false;
    }

    const exists = await mongodb.messageExists(messageId);

    if (exists) {
      console.log(`🔁 Duplicate message detected: ${messageId}`);
      return true;
    }

    return false;
  } catch (err) {
    console.error(
      `❌ Deduplication check failed for ${messageId}:`,
      err.message,
    );
    // Fail open: allow processing if check fails
    return false;
  }
}

/**
 * Mark message ID as processed
 *
 * @param {string} messageId - WhatsApp message ID
 * @returns {Promise<boolean>} Success status
 */
async function markAsProcessed(messageId) {
  try {
    if (!messageId) {
      console.warn("⚠️ No message ID provided for marking as processed");
      return false;
    }

    await mongodb.markMessageProcessed(messageId);

    console.log(`✅ Marked message as processed: ${messageId}`);
    return true;
  } catch (err) {
    console.error(
      `❌ Failed to mark message as processed ${messageId}:`,
      err.message,
    );
    return false;
  }
}

/**
 * Process message with deduplication check
 *
 * Higher-level function that combines check + mark
 *
 * @param {string} messageId - WhatsApp message ID
 * @param {Function} processFn - Async function to execute if not duplicate
 * @returns {Promise<object>} { processed, duplicate, result }
 */
async function processOnce(messageId, processFn) {
  try {
    // Check if duplicate
    const duplicate = await isDuplicate(messageId);

    if (duplicate) {
      return {
        processed: false,
        duplicate: true,
        result: null,
      };
    }

    // Mark as processed BEFORE executing (prevents race condition)
    await markAsProcessed(messageId);

    // Execute processing function
    const result = await processFn();

    return {
      processed: true,
      duplicate: false,
      result,
    };
  } catch (err) {
    console.error(`❌ processOnce failed for ${messageId}:`, err.message);
    throw err;
  }
}

/**
 * Clear specific message ID from deduplication cache
 * (Mainly for testing/debugging)
 *
 * @param {string} messageId - WhatsApp message ID
 * @returns {Promise<void>}
 */
async function clearMessageId(messageId) {
  try {
    const key = `${MSGID_PREFIX}${messageId}`;
    await redis.del(key);
    console.log(`🗑️ Cleared message ID: ${messageId}`);
  } catch (err) {
    console.error(`❌ Failed to clear message ID ${messageId}:`, err.message);
  }
}

/**
 * Get deduplication statistics
 *
 * @returns {Promise<object>} Stats object
 */
async function getStats() {
  try {
    const trackedMessages = await mongodb.getDedupCount();

    return {
      trackedMessages,
      ttl: DEDUP_TTL,
      ttlHours: DEDUP_TTL / 3600,
    };
  } catch (err) {
    console.error("❌ Failed to get deduplication stats:", err.message);
    return {
      error: err.message,
    };
  }
}

/**
 * Clear all message IDs from deduplication cache
 * (Use with caution - mainly for testing)
 *
 * @returns {Promise<number>} Number of keys cleared
 */
async function clearAll() {
  try {
    const keys = await redis.keys(`${MSGID_PREFIX}*`);

    let cleared = 0;
    for (const key of keys) {
      await redis.del(key);
      cleared++;
    }

    console.log(`🗑️ Cleared ${cleared} message IDs from cache`);
    return cleared;
  } catch (err) {
    console.error("❌ Failed to clear all message IDs:", err.message);
    return 0;
  }
}

module.exports = {
  isDuplicate,
  markAsProcessed,
  processOnce,
  clearMessageId,
  clearAll,
  getStats,
};
