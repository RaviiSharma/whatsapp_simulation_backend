require("dotenv").config();

module.exports = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: process.env.PORT,
  VERIFY_TOKEN: process.env.VERIFY_TOKEN,
  WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN,
  PHONE_NUMBER_ID: process.env.PHONE_NUMBER_ID,
  AI_SERVICE_URL: process.env.AI_SERVICE_URL,

  // Production safety flags
  isProduction() {
    return this.NODE_ENV === "production";
  },
  isDevelopment() {
    return this.NODE_ENV === "development";
  },
};
