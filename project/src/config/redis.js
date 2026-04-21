
/**
 * Redis Configuration
 *
 * Provides Redis client with automatic reconnection and fallback to in-memory store
 */

const redis = require("redis");

let client = null;
let isRedisAvailable = false;

// In-memory fallback store
const memoryStore = new Map();

/**
 * Initialize Redis connection
 */
async function connectRedis() {
  try {
    client = redis.createClient({
      username: process.env.REDIS_USERNAME || "default",
      password: process.env.REDIS_PASSWORD,
      socket: {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379", 10),
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error(" Redis max retries reached");
            return new Error("Redis retry exhausted");
          }
          // Exponential backoff: 100ms, 200ms, 400ms, ..., max 3s
          return Math.min(retries * 100, 3000);
        },
      },
    });

    client.on("error", (err) => {
      console.error("Redis error:", err.message);
      isRedisAvailable = false;
    });

    client.on("connect", () => {
      console.log("Redis connected");
      isRedisAvailable = true;
    });

    client.on("ready", () => {
      console.log("Redis ready");
      isRedisAvailable = true;
      // Note: BullMQ will warn about eviction policy if needed
      // To fix: edit redis.windows.conf and set 'maxmemory-policy noeviction'
    });

    client.on("reconnecting", () => {
      console.log("🔄 Redis reconnecting...");
      isRedisAvailable = false;
    });

    client.on("end", () => {
      console.log("⚪ Redis connection ended");
      isRedisAvailable = false;
    });

    await client.connect();
  } catch (err) {
    console.error(
      "⚠️ Redis initialization failed, using in-memory store:",
      err.message,
    );
    isRedisAvailable = false;
  }
}

/**
 * Get value from Redis or fallback to memory
 */
async function get(key) {
  if (isRedisAvailable && client) {
    try {
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (err) {
      console.error(`⚠️ Redis GET failed for ${key}:`, err.message);
      isRedisAvailable = false;
    }
  }

  // Fallback to memory
  return memoryStore.get(key) || null;
}

/**
 * Set value in Redis or fallback to memory
 */
async function set(key, value, ttl = null) {
  const jsonValue = JSON.stringify(value);

  if (isRedisAvailable && client) {
    try {
      if (ttl) {
        await client.setEx(key, ttl, jsonValue);
      } else {
        await client.set(key, jsonValue);
      }
      return true;
    } catch (err) {
      console.error(`⚠️ Redis SET failed for ${key}:`, err.message);
      isRedisAvailable = false;
    }
  }

  // Fallback to memory
  memoryStore.set(key, value);

  // Handle TTL in memory (simple implementation)
  if (ttl) {
    setTimeout(() => {
      memoryStore.delete(key);
    }, ttl * 1000);
  }

  return true;
}

/**
 * Delete key from Redis or memory
 */
async function del(key) {
  if (isRedisAvailable && client) {
    try {
      await client.del(key);
    } catch (err) {
      console.error(`⚠️ Redis DEL failed for ${key}:`, err.message);
    }
  }

  memoryStore.delete(key);
}

/**
 * Increment counter (atomic operation)
 */
async function incr(key) {
  if (isRedisAvailable && client) {
    try {
      return await client.incr(key);
    } catch (err) {
      console.error(`⚠️ Redis INCR failed for ${key}:`, err.message);
    }
  }

  // Fallback to memory
  const current = memoryStore.get(key) || 0;
  const newValue = current + 1;
  memoryStore.set(key, newValue);
  return newValue;
}

/**
 * Check if key exists
 */
async function exists(key) {
  if (isRedisAvailable && client) {
    try {
      const result = await client.exists(key);
      return result === 1;
    } catch (err) {
      console.error(`⚠️ Redis EXISTS failed for ${key}:`, err.message);
    }
  }

  return memoryStore.has(key);
}

/**
 * Get all keys matching pattern
 */
async function keys(pattern) {
  if (isRedisAvailable && client) {
    try {
      return await client.keys(pattern);
    } catch (err) {
      console.error(`⚠️ Redis KEYS failed for ${pattern}:`, err.message);
    }
  }

  // Fallback: convert glob pattern to regex (simple implementation)
  const regex = new RegExp(pattern.replace(/\*/g, ".*"));
  return Array.from(memoryStore.keys()).filter((key) => regex.test(key));
}

/**
 * Close Redis connection
 */
async function close() {
  if (client) {
    try {
      await client.quit();
      console.log("✅ Redis connection closed gracefully");
    } catch (err) {
      console.error("⚠️ Redis close error:", err.message);
    }
  }
}

/**
 * Health check
 */
function getStatus() {
  return {
    redis: isRedisAvailable,
    fallback: !isRedisAvailable,
    memoryStoreSize: memoryStore.size,
  };
}

module.exports = {
  connectRedis,
  get,
  set,
  del,
  incr,
  exists,
  keys,
  close,
  getStatus,
};