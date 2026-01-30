const express = require("express");
const morgan = require("morgan");

const webhookRoutes = require("./routes/webhook.routes");
const adminRoutes = require("./routes/admin.routes");
const proactiveRoutes = require("./routes/proactive.routes");
const campaignRoutes = require("./routes/campaign.routes");

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

// Webhook routes (WhatsApp)
app.use("/", webhookRoutes);

// Admin routes (monitoring & stats)
app.use("/admin", adminRoutes);

// Proactive messaging routes (AI-initiated conversations)
app.use("/proactive", proactiveRoutes);

// Campaign routes (campaign management & chat history)
app.use("/api/campaign", campaignRoutes);
app.use("/api", campaignRoutes); // Also mount under /api for user endpoints

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

module.exports = app;
