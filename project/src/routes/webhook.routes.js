const express = require("express");
const router = express.Router();
const webhookController = require("../controllers/webhook.controller");

router.get("/webhook", webhookController.verifyWebhook);
router.post("/webhook", webhookController.receiveMessage);

module.exports = router;
