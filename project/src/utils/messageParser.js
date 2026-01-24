/**
 * Parse incoming WhatsApp webhook payload
 *
 * Extracts message details including messageId for deduplication
 *
 * @param {object} payload - Raw webhook payload from Meta
 * @returns {object|null} Parsed message or null
 */
exports.parseMessage = (payload) => {
  try {
    const entry = payload.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const msg = value?.messages?.[0];

    if (!msg || msg.type !== "text") {
      console.log("⏭️ Skipping non-text message or empty payload");
      return null;
    }

    return {
      from: msg.from,
      text: msg.text.body,
      messageId: msg.id, // For deduplication
      timestamp: msg.timestamp,
      name: value.contacts?.[0]?.profile?.name || "Unknown",
    };
  } catch (err) {
    console.error("❌ Message parse error:", err.message);
    return null;
  }
};
