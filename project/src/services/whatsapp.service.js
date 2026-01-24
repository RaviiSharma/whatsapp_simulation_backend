const axios = require("axios");
const { WHATSAPP_TOKEN, PHONE_NUMBER_ID } = require("../config/env");

/**
 * Send a text message to WhatsApp user
 *
 * @param {string} to - WhatsApp phone number (with country code, no +)
 * @param {string} text - Message text
 * @returns {Promise<object>} Response with messageId
 */
exports.sendMessage = async (to, text) => {
  const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;

  const response = await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to,
      text: { body: text },
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    },
  );

  return {
    messageId: response.data.messages?.[0]?.id,
    status: "sent",
  };
};

/**
 * Send a WhatsApp Message Template (required for proactive messages)
 *
 * Templates must be created and approved in Meta Business Manager:
 * https://business.facebook.com/wa/manage/message-templates/
 *
 * @param {string} to - WhatsApp phone number (with country code, no +)
 * @param {object} template - Template configuration
 * @param {string} template.name - Template name (must be approved)
 * @param {string} template.language - Language code (e.g., "en", "en_US")
 * @param {Array} template.components - Template components with parameters
 * @returns {Promise<object>} Response with messageId
 *
 * @example
 * sendTemplateMessage("919102901737", {
 *   name: "agent_intro",
 *   language: "en",
 *   components: [
 *     {
 *       type: "body",
 *       parameters: [
 *         { type: "text", text: "Alex from Security Team" }
 *       ]
 *     }
 *   ]
 * });
 */
exports.sendTemplateMessage = async (to, template) => {
  const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;

  try {
    const response = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: template.name,
          language: {
            code: template.language,
          },
          components: template.components || [],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      },
    );

    console.log(`✅ Template message sent to ${to}: ${template.name}`);

    return {
      messageId: response.data.messages?.[0]?.id,
      status: "sent",
    };
  } catch (err) {
    console.error(
      `❌ Template send failed:`,
      err.response?.data || err.message,
    );

    // Enhanced error handling for template-specific issues
    if (err.response?.data?.error) {
      const error = err.response.data.error;

      // Common template errors
      if (error.code === 132000) {
        throw new Error(
          `Template not found: "${template.name}". Create and approve it in Meta Business Manager.`,
        );
      } else if (error.code === 132001) {
        throw new Error(`Template "${template.name}" has invalid parameters.`);
      } else if (error.code === 131047) {
        throw new Error(`Template "${template.name}" is not approved yet.`);
      } else if (error.code === 131026) {
        throw new Error(
          `Message undeliverable: User may have blocked the number or deleted WhatsApp.`,
        );
      }

      throw new Error(
        `WhatsApp API error: ${error.message || error.error_data?.details}`,
      );
    }

    throw err;
  }
};
