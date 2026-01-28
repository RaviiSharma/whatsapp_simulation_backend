/**
 * WhatsApp 24-Hour Session Window Service
 *
 * Tracks WhatsApp's 24-hour messaging window for compliance
 * After 24h of inactivity, business must use template messages
 *
 * Uses Redis for real-time tracking with automatic expiration
 */

const redis = require("../config/redis");

const WINDOW_TTL = 24 * 60 * 60; // 24 hours in seconds

/**
 * Update session window timestamp
 * Call this whenever user sends a message
 *
 * @param {string} phoneNumber - User's phone number
 * @returns {Promise<void>}
 */
async function updateSessionWindow(phoneNumber) {
  try {
    const key = `window:${phoneNumber}`;
    const timestamp = new Date().toISOString();

    await redis.set(key, { lastMessageAt: timestamp }, WINDOW_TTL);

    console.log(`🕐 Session window updated for ${phoneNumber}`);
  } catch (err) {
    console.error(
      `❌ Failed to update session window for ${phoneNumber}:`,
      err.message,
    );
  }
}

/**
 * Check if user is within 24-hour messaging window
 *
 * @param {string} phoneNumber - User's phone number
 * @returns {Promise<boolean>} True if within window
 */
async function isWithinWindow(phoneNumber) {
  try {
    const key = `window:${phoneNumber}`;
    const data = await redis.get(key);

    if (!data) {
      console.log(`⏰ No active window for ${phoneNumber}`);
      return false;
    }

    // If key exists in Redis, user is within window (TTL handles expiration)
    console.log(`✅ User ${phoneNumber} within 24h window`);
    return true;
  } catch (err) {
    console.error(
      `❌ Failed to check session window for ${phoneNumber}:`,
      err.message,
    );
    // Fail open: allow messaging if check fails
    return true;
  }
}

/**
 * Get session window status
 *
 * @param {string} phoneNumber - User's phone number
 * @returns {Promise<object>} Window status
 */
async function getWindowStatus(phoneNumber) {
  try {
    const key = `window:${phoneNumber}`;
    const data = await redis.get(key);

    if (!data) {
      return {
        active: false,
        lastMessageAt: null,
        expiresAt: null,
        requiresTemplate: true,
      };
    }

    const lastMessageAt = new Date(data.lastMessageAt);
    const expiresAt = new Date(lastMessageAt.getTime() + WINDOW_TTL * 1000);

    return {
      active: true,
      lastMessageAt: lastMessageAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      requiresTemplate: false,
    };
  } catch (err) {
    console.error(
      `❌ Failed to get window status for ${phoneNumber}:`,
      err.message,
    );
    return {
      active: false,
      lastMessageAt: null,
      expiresAt: null,
      requiresTemplate: true,
      error: err.message,
    };
  }
}

/**
 * Manually close session window (admin action)
 *
 * @param {string} phoneNumber - User's phone number
 * @returns {Promise<void>}
 */
async function closeSessionWindow(phoneNumber) {
  try {
    const key = `window:${phoneNumber}`;
    await redis.del(key);

    console.log(`🔚 Session window closed for ${phoneNumber}`);
  } catch (err) {
    console.error(
      `❌ Failed to close session window for ${phoneNumber}:`,
      err.message,
    );
  }
}

/**
 * Get all active session windows (admin dashboard)
 *
 * @returns {Promise<array>} Active sessions
 */
async function getActiveWindows() {
  try {
    const keys = await redis.keys("window:*");

    const windows = await Promise.all(
      keys.map(async (key) => {
        const phoneNumber = key.replace("window:", "");
        const status = await getWindowStatus(phoneNumber);

        return {
          phoneNumber,
          ...status,
        };
      }),
    );

    return windows.filter((w) => w.active);
  } catch (err) {
    console.error(`❌ Failed to get active windows:`, err.message);
    return [];
  }
}

module.exports = {
  updateSessionWindow,
  isWithinWindow,
  getWindowStatus,
  closeSessionWindow,
  getActiveWindows,
  WINDOW_TTL,
};
