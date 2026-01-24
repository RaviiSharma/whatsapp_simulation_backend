# 🤖 WhatsApp Multi-Agent AI System

Production-grade WhatsApp webhook system with **multi-agent AI routing**, **Redis session management**, and **enterprise-level reliability**.

---

## 🎯 Key Features

### ✅ **AI Sends First Message**

- When a new user contacts the system, AI automatically sends an intro message
- Personalized per agent (hackerAgent, benignAgent, policyAgent, riskAgent)
- Works before user sends first message

### ✅ **Agent Stickiness (Session Binding)**

- Each user permanently assigned to **exactly ONE agent**
- Assignment persists across:
  - Server restarts (Redis persistence)
  - Multiple Node instances (shared state)
  - Network failures (recovery)
- **Guaranteed:** Same agent always handles same user

### ✅ **High Reliability**

- Webhook responds < 500ms (Meta requirement: 2s)
- Async message processing
- Automatic retry with exponential backoff
- Fallback responses when AI unavailable
- Message deduplication (prevents double-processing)
- Circuit breaker pattern
- Graceful degradation (Redis → in-memory fallback)

### ✅ **Production-Ready Architecture**

- Redis session store with in-memory fallback
- Load-balanced agent assignment
- Horizontal scaling support
- Comprehensive error handling
- Monitoring & admin endpoints
- Structured logging

---

## 📊 Architecture

```
WhatsApp User → Meta Webhook → Express Server
                                    ↓
                        [Immediate 200 Response]
                                    ↓
                          Async Processing:
                                    ↓
                    ┌───────────────┴───────────────┐
                    ↓                               ↓
              Deduplication                   Agent Router
                    ↓                               ↓
             [Check Redis]              [Get/Assign Agent]
                    ↓                               ↓
                    └───────────┬───────────────────┘
                                ↓
                        New User Detection
                                ↓
                    ┌───────────┴───────────┐
                    ↓                       ↓
              YES: Send Intro          NO: Continue
                    ↓                       ↓
                    └───────────┬───────────┘
                                ↓
                        Fraud Detection
                                ↓
                        AI Message Generation
                                ↓
                        Send to WhatsApp
```

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Start Redis (Optional)

```bash
# WSL/Linux
sudo service redis-server start

# Docker
docker run -d -p 6379:6379 redis:7-alpine
```

### 4. Run Server

```bash
# Development
npm run dev

# Production
npm start
```

### 5. Test

```bash
# Health check
curl http://localhost:3000/health

# Send test message
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d @test-webhook.json
```

---

## 📁 Project Structure

```
whatsapp_simulation/
├── ARCHITECTURE.md       # System design & data flows
├── DEPLOYMENT.md         # Production deployment guide
├── TESTING.md           # Testing strategies
├── package.json
├── .env.example
│
└── project/
    └── src/
        ├── server.js                    # Entry point with Redis init
        ├── app.js                       # Express app config
        │
        ├── config/
        │   ├── env.js                   # Environment variables
        │   └── redis.js                 # Redis client with fallback
        │
        ├── controllers/
        │   └── webhook.controller.js    # Webhook handler (< 500ms response)
        │
        ├── routes/
        │   ├── webhook.routes.js        # Webhook routes
        │   └── admin.routes.js          # Admin/monitoring routes
        │
        ├── services/
        │   ├── sessionStore.service.js   # User-agent persistence
        │   ├── agentRouter.service.js    # Agent assignment & routing
        │   ├── messageProcessor.service.js # Async message pipeline
        │   ├── ai.service.js             # AI service client
        │   ├── whatsapp.service.js       # WhatsApp API client
        │   └── logger.service.js         # Logging
        │
        └── utils/
            ├── messageParser.js          # Webhook payload parser
            ├── deduplication.js          # Message ID tracking
            └── security.js               # Security utilities
```

---

## 🎯 Core Concepts

### 1. Agent Stickiness

**Problem:** Multiple agents shouldn't talk to same user
**Solution:** Permanent user-agent binding in Redis

```javascript
// First contact
User "123" → System assigns → "hackerAgent"

// All future messages
User "123" → Always routes to → "hackerAgent"

// Persists through restarts ✅
```

### 2. First Message Flow

**Problem:** AI needs to initiate conversation
**Solution:** Detect new users and send intro before processing

```javascript
New User Detected
  ↓
Assign Agent: "hackerAgent"
  ↓
Send Intro: "🔓 Hey there! I noticed your account..."
  ↓
Process User's Message
  ↓
Send AI Reply
```

### 3. Webhook Performance

**Problem:** Meta times out after 2 seconds
**Solution:** Immediate response + async processing

```javascript
POST /webhook
  ↓
Return 200 (< 500ms) ✅
  ↓
Process in background (no await)
```

---

## 🛠️ API Endpoints

### Webhook (WhatsApp)

```bash
GET  /webhook          # Webhook verification
POST /webhook          # Receive messages
```

### Admin (Monitoring)

```bash
GET  /admin/stats                    # System statistics
GET  /admin/agents                   # Agent load distribution
GET  /admin/user/:userId             # User session info
POST /admin/user/:userId/reassign    # Manually reassign agent
DELETE /admin/user/:userId           # Clear user session
GET  /admin/health                   # Detailed health check
```

### Health

```bash
GET  /health           # Basic health check
```

---

## 📊 Data Models

### User Session (Redis)

```json
{
  "agentName": "hackerAgent",
  "assignedAt": "2026-01-23T10:30:00.000Z",
  "lastMessageAt": "2026-01-23T10:35:00.000Z",
  "messageCount": 5,
  "isNewUser": false
}
```

### Agent Load (Redis)

```json
{
  "hackerAgent": 42,
  "benignAgent": 38,
  "policyAgent": 45,
  "riskAgent": 40
}
```

---

## 🔧 Configuration

### Available Agents

Edit in `services/agentRouter.service.js`:

```javascript
const AVAILABLE_AGENTS = [
  "hackerAgent",
  "benignAgent",
  "policyAgent",
  "riskAgent",
];
```

### Agent Personalities

Edit in `services/agentRouter.service.js`:

```javascript
hackerAgent: {
  role: "hacker",
  personality: "suspicious, technical, probing",
  introMessage: "🔓 Hey there! Quick security check needed."
}
```

### Timeouts

```javascript
// ai.service.js
fraud_detection: 10s
generate: 25s

// webhook.controller.js
Must respond: < 2s (Meta requirement)
Target: < 500ms
```

---

## 🧪 Testing

### Run Full Test Suite

```bash
npm test
```

### Manual Testing

```bash
# Test new user flow
curl -X POST http://localhost:3000/webhook -d @test-new-user.json

# Check assignment
curl http://localhost:3000/admin/user/1234567890

# Test duplicate handling
curl -X POST http://localhost:3000/webhook -d @same-message-id.json
curl -X POST http://localhost:3000/webhook -d @same-message-id.json
# Second should be skipped
```

See [TESTING.md](TESTING.md) for comprehensive test scenarios.

---

## 🚀 Deployment

### Development

```bash
npm run dev
```

### Production

```bash
# With PM2
pm2 start project/src/server.js --name whatsapp-ai

# With Docker
docker build -t whatsapp-ai .
docker run -d -p 3000:3000 --env-file .env whatsapp-ai
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete deployment guide.

---

## 📈 Monitoring

### Key Metrics

- **Webhook Response Time:** Target < 500ms
- **Message Processing:** Target < 30s end-to-end
- **Agent Distribution:** Should be balanced
- **Error Rate:** Target < 1%
- **Redis Status:** Connected or fallback

### Admin Dashboard

```bash
# Real-time stats
curl http://localhost:3000/admin/stats
```

**Output:**

```json
{
  "status": "ok",
  "timestamp": "2026-01-23T10:30:00.000Z",
  "routing": {
    "totalUsers": 165,
    "agentLoads": {
      "hackerAgent": 42,
      "benignAgent": 41,
      "policyAgent": 40,
      "riskAgent": 42
    },
    "agentDistribution": {
      "hackerAgent": "25.45%",
      "benignAgent": "24.85%",
      "policyAgent": "24.24%",
      "riskAgent": "25.45%"
    }
  },
  "deduplication": {
    "trackedMessages": 342,
    "ttlHours": 24
  },
  "storage": {
    "redis": true,
    "fallback": false
  }
}
```

---

## 🛡️ Reliability Features

### 1. Message Deduplication

- Tracks message IDs in Redis (24h TTL)
- Prevents double-processing on Meta retry
- Atomic check-and-mark operation

### 2. Circuit Breaker

- Monitors AI service failures
- Auto-switches to fallback after threshold
- Self-healing after cooldown period

### 3. Retry Logic

- Exponential backoff for AI calls
- Max 3 retries for WhatsApp send
- Timeout handling at every layer

### 4. Graceful Degradation

```
Redis fails → In-memory fallback
AI fails → Fallback messages
Network fails → Retry with backoff
```

### 5. Error Recovery

- Uncaught exceptions logged (no crash)
- Unhandled promise rejections caught
- Graceful shutdown on SIGTERM/SIGINT

---

## 🔒 Security

### Implemented

- ✅ Environment variable protection
- ✅ Request timeout limits
- ✅ Async processing (no blocking)
- ✅ Error sanitization in logs

### TODO (Production)

- [ ] Webhook signature verification (X-Hub-Signature)
- [ ] Rate limiting per user
- [ ] Input sanitization
- [ ] Redis password/TLS
- [ ] HTTPS only
- [ ] CORS configuration
- [ ] Helmet.js security headers

---

## 📚 Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System design, data flows, scaling
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Installation, configuration, hosting
- **[TESTING.md](TESTING.md)** - Test strategies, scenarios, tools

---

## 🐛 Troubleshooting

### Redis Connection Failed

```
⚠️ Redis initialization failed, using in-memory store
```

**Action:** Check Redis is running or rely on fallback (temporary)

### AI Service Timeout

```
⏱ AI service timeout
```

**Action:** Check AI service on port 4000, system uses fallback

### Webhook Not Verified

```
❌ Webhook verification failed
```

**Action:** Check VERIFY_TOKEN matches Meta console

### Agent Not Sticky After Restart

```
User gets different agent
```

**Action:** Ensure Redis connected (not fallback), check persistence

---

## 🎓 Key Learnings

### Why Immediate Webhook Response?

- Meta requires < 2s response
- Slow response causes retries
- Retries cause duplicate processing
- Solution: Respond immediately, process async

### Why Redis?

- Persistent storage across restarts
- Shared state for multi-instance
- Atomic operations prevent race conditions
- Fast lookups (< 1ms)

### Why Agent Stickiness?

- Consistent conversation flow
- Better AI context retention
- Prevents confusion for users
- Easier fraud pattern detection

### Why Deduplication?

- Meta retries failed webhooks
- Same message shouldn't process twice
- Prevents duplicate charges/actions
- 24h TTL handles delayed retries

---

## 📝 License

MIT

---

## 🙏 Contributing

1. Fork repository
2. Create feature branch
3. Add tests
4. Submit pull request

---

## 📞 Support

- **Issues:** GitHub Issues
- **Docs:** See ARCHITECTURE.md, DEPLOYMENT.md, TESTING.md
- **Logs:** Check console output or PM2 logs

---

## ✨ Features Roadmap

- [ ] WebSocket support for real-time updates
- [ ] Multi-language support
- [ ] Advanced fraud detection models
- [ ] Conversation history API
- [ ] Analytics dashboard
- [ ] Automated testing suite
- [ ] Kubernetes deployment configs
- [ ] Prometheus metrics export
- [ ] Grafana dashboards

---

**Built with ❤️ for production-grade WhatsApp AI systems**
