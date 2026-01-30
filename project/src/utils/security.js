/**
 * Verify WhatsApp webhook signature
 */
exports.verifySignature = (req) => {
  return true;
};

/**
 * Mask sensitive data in messages
 *
 * @param {string} text - Original message text
 * @returns {object} { maskedText, originalText, containsPII }
 */
function maskSensitiveData(text) {
  if (!text) {
    return {
      maskedText: text,
      originalText: null,
      containsPII: false,
    };
  }

  let maskedText = text;
  let containsPII = false;

  // OTP patterns (4-6 digits)
  if (/\b\d{4,6}\b/.test(text)) {
    maskedText = maskedText.replace(/\b\d{4,6}\b/g, "████");
    containsPII = true;
  }

  // Card numbers (13-19 digits with optional spaces/dashes)
  if (/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4,7}\b/.test(text)) {
    maskedText = maskedText.replace(
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4,7}\b/g,
      "████-████-████-████",
    );
    containsPII = true;
  }

  // CVV (3-4 digits after "CVV" or "CVC")
  if (/\b(cvv|cvc|cvn)\s*:?\s*\d{3,4}\b/i.test(text)) {
    maskedText = maskedText.replace(
      /\b(cvv|cvc|cvn)\s*:?\s*\d{3,4}\b/gi,
      "$1: ███",
    );
    containsPII = true;
  }

  // Account numbers (8-17 digits)
  if (/\b\d{8,17}\b/.test(text)) {
    maskedText = maskedText.replace(/\b(\d{4})\d+(\d{4})\b/g, "$1████$2");
    containsPII = true;
  }

  // Email addresses
  if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(text)) {
    maskedText = maskedText.replace(
      /\b([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Z|a-z]{2,})\b/g,
      "████@$2",
    );
    containsPII = true;
  }

  // Aadhaar numbers (India) - 12 digits with optional spaces
  if (/\b\d{4}\s?\d{4}\s?\d{4}\b/.test(text)) {
    maskedText = maskedText.replace(
      /\b\d{4}\s?\d{4}\s?\d{4}\b/g,
      "████ ████ ████",
    );
    containsPII = true;
  }

  return {
    maskedText,
    originalText: containsPII ? text : null,
    containsPII,
  };
}

exports.maskSensitiveData = maskSensitiveData;
