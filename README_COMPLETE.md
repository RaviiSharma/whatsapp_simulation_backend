# WhatsApp Multi-Agent AI System - Complete Guide

## 🎯 System Overview

Production-grade WhatsApp chatbot with multiple AI agents, featuring:

- **Agent Stickiness**: Each user permanently assigned to one agent
- **Proactive Messaging**: AI initiates conversations (using WhatsApp templates)
- **High Reliability**: < 2s webhook response, never crashes on AI failures
- **Scalability**: Horizontal scaling with MongoDB session persistence
- **AI Integration**: External AI service with fraud detection + message generation

---

## 📁 Project Structure

```
project/
├── src/
│   ├── app.js                          # Express app setup
│   ├── server.js                       # Server entry point
│   ├── config/
│   │   ├── env.js                      # Environment variables
│   │   └── mongodb.js                  # MongoDB client with fallback
│   ├── controllers/
│   │   └── webhook.controller.js       # WhatsApp webhook handler
│   ├── routes/
│   │   ├── webhook.routes.js           # Webhook routes
│   │   ├── admin.routes.js             # Monitoring endpoints
│   │   └── proactive.routes.js         # Proactive messaging API
│   ├── services/
│   │   ├── ai.service.js               # AI API integration
│   │   ├── whatsapp.service.js         # WhatsApp Graph API
│   │   ├── sessionStore.service.js     # User-agent persistence
│   │   ├── agentRouter.service.js      # Agent assignment logic
│   │   ├── messageProcessor.service.js # Async message pipeline
│   │   ├── logger.service.js           # Logging
│   │   └── proactiveMessaging.service.js # Proactive messaging
│   └── utils/
│       ├── messageParser.js            # WhatsApp message parsing
│       ├── deduplication.js            # Message ID dedup
│       └── security.js                 # Validation
├── scripts/
│   └── test-proactive.js               # Test proactive messaging
└── package.json

Documentation/
├── ARCHITECTURE.md                     # System architecture
├── FLOWS.md                            # Message flow diagrams
├── DEPLOYMENT.md                       # Production deployment
├── TESTING.md                          # Testing guide
├── PROACTIVE_MESSAGING.md              # Proactive messaging guide
└── README.md                           # This file
```

---

## 🚀 Quick Start

### 1. Prerequisites

```bash
# Node.js 18+
node --version

# MongoDB
mongod --version

# WhatsApp Business Account
# - Phone Number ID
# - Access Token
# - Verify Token
```

### 2. Installation

```bash
cd project
npm install
```

### 3. Configuration

Create `.env` file:

```bash
PORT=3000
VERIFY_TOKEN=your_verify_token

# WhatsApp Business API
WHATSAPP_TOKEN=your_access_token
PHONE_NUMBER_ID=your_phone_number_id

# AI Service
AI_SERVICE_URL=http://localhost:4000/chat
AI_API_KEY=your_ai_api_key

# Message Templates (for proactive messaging)
WHATSAPP_TEMPLATE_NAME=agent_intro
WHATSAPP_TEMPLATE_LANGUAGE=en

# MongoDB
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=whatsapp_ai
```

### 4. Start Services

```bash
# Terminal 1: Start MongoDB
mongod

# Terminal 2: Start AI Service (localhost:4000)
cd ai-service
npm start

# Terminal 3: Start WhatsApp Backend
cd project
npm run dev
```

---

## 📊 System Architecture

### High-Level Flow

```
WhatsApp User
      ↓
Meta Webhook (POST /webhook)
      ↓
Webhook Controller
  ├─ Return 200 (< 2s) ✅
  └─ Queue async processing
      ↓
Message Processor
  ├─ Deduplication check
  ├─ Agent routing (get/assign)
  ├─ Fraud detection (get aiMessage)
  └─ Send aiMessage to WhatsApp
      ↓
MongoDB (Session Persistence)
  └─ userId → agentName mapping
```

### Agent Assignment

```javascript
// First message from user
User 919102901737 → Auto-assign → hackerAgent
Session stored: { userId: "919102901737", agentName: "hackerAgent" }

// All future messages
User 919102901737 → Retrieve session → hackerAgent (always)
```

### Proactive Messaging

```javascript
// Admin initiates conversation
POST /proactive/start { phoneNumber: "919102901737", preferredAgent: "hackerAgent" }
      ↓
Assign agent → Create session → Send WhatsApp template
      ↓
User receives template message
      ↓
User replies
      ↓
Normal webhook flow (agent already assigned) ✅
```

---

## 🔧 Key Features

### 1. Agent Stickiness

```javascript
// services/sessionStore.service.js
await sessionStore.createSession(userId, agentName);
// Persisted in MongoDB, survives restarts

// All future messages
const session = await sessionStore.getSession(userId);
// Returns: { agentName: "hackerAgent", ... }
```

### 2. Proactive Messaging

```javascript
// services/proactiveMessaging.service.js
const result = await startConversation("919102901737", "hackerAgent");
// Sends WhatsApp template message
// User can then reply, AI responds normally
```

### 3. AI Response Routing (Fixed)

```javascript
// services/messageProcessor.service.js
const fraudResult = await detectFraud(userId, text, agentName);
// Returns: { decision, risk, intent, aiMessage }

// Use aiMessage from fraud detection directly
const aiReply = fraudResult.aiMessage || (await generateReply(...));
await sendMessage(userId, aiReply);
```

### 4. High Reliability

```javascript
// Webhook responds immediately
res.status(200).send("EVENT_RECEIVED");

// Process async (even if AI times out, webhook already responded)
processMessage(message).catch((err) => {
  console.error("Processing failed:", err);
  // Send fallback message
});
```

### 5. MongoDB Persistence

```javascript
// config/mongodb.js
// Collections:
sessions: {
  (userId, agentName, assignedAt, messageCount);
}
message_dedup: {
  (messageId, expiresAt);
} // 24h TTL
agent_loads: {
  (agentName, count);
}

// In-memory fallback if MongoDB unavailable
```

---

## 🎯 API Endpoints

### Webhook (WhatsApp)

```bash
# Meta verification
GET /webhook?hub.mode=subscribe&hub.verify_token=mytoken123&hub.challenge=123
# Returns: 123

# Receive messages
POST /webhook
Body: { entry[0].changes[0].value.messages[0] }
# Returns: 200 immediately
```

### Admin (Monitoring)

```bash
# System stats
GET /admin/stats

# Agent distribution
GET /admin/agents

# User session
GET /admin/user/:phoneNumber

# Health check
GET /admin/health
```

### Proactive Messaging

```bash
# Start conversation (single user)
POST /proactive/start
Body: { phoneNumber, preferredAgent?, templateParams? }

# Batch start (multiple users)
POST /proactive/batch
Body: { phoneNumbers[], preferredAgent? }

# Check eligibility
GET /proactive/check/:phoneNumber

# Proactive stats
GET /proactive/stats
```

---

## 🧪 Testing

### Test Reactive Flow (User Messages First)

```bash
# 1. User sends "Hello" via WhatsApp to your number
# 2. Check logs:
npm run dev

# Expected output:
🔄 Processing message from 919102901737: "Hello"
🎯 Routed to: hackerAgent (new: true)
🆕 New user detected: 919102901737 → hackerAgent
📤 Sending intro message
✅ Using aiMessage from fraud detection: "Hey there! What's up?"
📤 Message sent to 919102901737
```

### Test Proactive Flow (AI Messages First)

```bash
# 1. Start conversation
node scripts/test-proactive.js 919102901737 hackerAgent

# Expected:
✅ Conversation started
✅ Session verified
📱 Check WhatsApp - template message sent

# 2. User replies via WhatsApp

# 3. Check logs - should use existing session
🔄 Processing message from 919102901737: "Hi"
🎯 Routed to: hackerAgent (new: false)
✅ Using aiMessage from fraud detection
```

### Test Agent Stickiness

```bash
# Send multiple messages from same number
# All should route to same agent

curl -X POST http://localhost:3000/admin/user/919102901737
# Should return same agentName every time
```

---

## 🛡️ Production Deployment

### 1. Environment Setup

```bash
# Production .env
NODE_ENV=production
PORT=443
WHATSAPP_TOKEN=production_token
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/whatsapp_ai
```

### 2. MongoDB Setup

```bash
# Create MongoDB Atlas cluster
# Enable IP whitelist
# Create user with readWrite permissions
# Connection string → MONGODB_URI in .env
```

### 3. WhatsApp Setup

```bash
# Meta Business Manager
1. Create App → WhatsApp Business API
2. Get Phone Number ID
3. Generate Access Token (never expires)
4. Configure Webhook URL: https://yourdomain.com/webhook
5. Subscribe to: messages, message_status
6. Create & approve message templates for proactive messaging
```

### 4. SSL/TLS

```bash
# Meta requires HTTPS for webhooks
# Use nginx as reverse proxy:

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
    }
}
```

### 5. Process Management

```bash
# Use PM2 for production
npm install -g pm2

pm2 start src/server.js --name whatsapp-ai
pm2 startup
pm2 save
```

---

## 🔍 Monitoring

### System Health

```bash
GET /admin/health

Response:
{
  "status": "healthy",
  "mongodb": "connected",
  "uptime": 3600,
  "memory": { "heapUsed": "50MB", "heapTotal": "100MB" }
}
```

### Agent Distribution

```bash
GET /admin/agents

Response:
{
  "agents": {
    "hackerAgent": { "count": 25 },
    "benignAgent": { "count": 20 },
    "policyAgent": { "count": 15 },
    "riskAgent": { "count": 10 }
  }
}
```

### User Session

```bash
GET /admin/user/919102901737

Response:
{
  "userId": "919102901737",
  "agentName": "hackerAgent",
  "assignedAt": "2026-01-23T10:00:00.000Z",
  "messageCount": 15,
  "lastMessageAt": "2026-01-23T12:30:00.000Z"
}
```

---

## 🚨 Troubleshooting

### Issue: MongoDB Connection Failed

```bash
⚠️ MongoDB initialization failed, using in-memory store

Solution:
1. Check MongoDB is running: mongod
2. Verify MONGODB_URI in .env
3. Check network connectivity
4. System automatically falls back to in-memory store
```

### Issue: AI Service Timeout

```bash
⚠️ AI generation failed: timeout of 10000ms exceeded

Solution:
- AI service has 10s timeout
- Webhook already responded (< 2s)
- System sends fallback message
- No crash, no user-facing error ✅
```

### Issue: WhatsApp Template Not Found

```bash
❌ Template send failed: Template not found

Solution:
1. Create template in Meta Business Manager
2. Wait for approval (1-3 days)
3. Update WHATSAPP_TEMPLATE_NAME in .env
4. Restart server
```

### Issue: Duplicate Messages

```bash
⏭️ Skipping duplicate message: wamid.HBgN...

Expected behavior:
- Message IDs tracked for 24h
- Prevents duplicate processing
- No action needed ✅
```

---

## 📚 Documentation Links

- [ARCHITECTURE.md](ARCHITECTURE.md) - Detailed system architecture
- [FLOWS.md](FLOWS.md) - Message flow diagrams
- [DEPLOYMENT.md](DEPLOYMENT.md) - Production deployment guide
- [TESTING.md](TESTING.md) - Testing procedures
- [PROACTIVE_MESSAGING.md](PROACTIVE_MESSAGING.md) - Proactive messaging guide

---

## 🔐 Security Considerations

### 1. Webhook Verification

```javascript
// controllers/webhook.controller.js
if (req.query["hub.verify_token"] !== VERIFY_TOKEN) {
  return res.status(403).send("Invalid verify token");
}
```

### 2. Admin Endpoints

```javascript
// TODO: Add authentication
// routes/admin.routes.js
const auth = require("../middleware/auth");
router.use(auth.requireAdmin);
```

### 3. Rate Limiting

```javascript
// TODO: Add rate limiting
const rateLimit = require("express-rate-limit");
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
});
app.use("/proactive", limiter);
```

### 4. Sensitive Data

```bash
# Never commit .env to git
echo ".env" >> .gitignore

# Use secrets management in production
# - AWS Secrets Manager
# - Azure Key Vault
# - HashiCorp Vault
```

---

## 🎓 Best Practices

### 1. Agent Selection Strategy

```javascript
// services/agentRouter.service.js
// Load balancing: Assign to agent with least users
const loads = await sessionStore.getAllAgentLoads();
const agentName = findMinLoadAgent(loads);
```

### 2. Error Handling

```javascript
// Always provide fallback
try {
  const aiReply = await generateReply(...);
  await sendMessage(userId, aiReply);
} catch (err) {
  // Fallback message
  await sendMessage(userId, "Thanks for your message. We'll get back to you shortly.");
}
```

### 3. Logging

```javascript
// services/logger.service.js
console.log(`🔄 Processing message from ${userId}: "${text}"`);
console.log(`🎯 Routed to: ${agentName}`);
console.log(`✅ Message processed in ${duration}ms`);
```

### 4. Testing

```bash
# Test with WhatsApp test numbers
# Meta provides test numbers that bypass template approval
# Dashboard → WhatsApp → API Setup → Test Numbers
```

---

## 📈 Scaling

### Horizontal Scaling

```bash
# Run multiple instances
pm2 start src/server.js -i 4  # 4 instances

# Load balancer (nginx)
upstream whatsapp_backend {
    server localhost:3001;
    server localhost:3002;
    server localhost:3003;
    server localhost:3004;
}
```

### Database Scaling

```bash
# MongoDB replica set for high availability
# MongoDB sharding for large datasets (> 1M users)
# Indexes already created:
# - sessions.userId (unique)
# - message_dedup.messageId (unique)
# - message_dedup.expiresAt (TTL index)
```

---

## 🤝 Contributing

```bash
# Development workflow
git checkout -b feature/your-feature
npm run dev
# Make changes
npm test
git commit -m "feat: your feature"
git push origin feature/your-feature
```

---

## 📞 Support

For issues or questions:

1. Check [TROUBLESHOOTING](TROUBLESHOOTING.md)
2. Review [ARCHITECTURE.md](ARCHITECTURE.md)
3. Test with [scripts/test-proactive.js](scripts/test-proactive.js)

---

## 📄 License

MIT License - See LICENSE file for details

---

**Built with ❤️ for production reliability and scalability**
