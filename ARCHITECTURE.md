# WhatsApp Multi-Agent AI System - Production Architecture

## 🏗️ ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────┐
│                         WhatsApp User                           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ 1. User sends message
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Meta Webhook (POST)                          │
│                    https://yourserver/webhook                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ 2. Webhook received
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│               Webhook Controller (Express)                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. Return HTTP 200 immediately (< 2 sec)                 │  │
│  │ 2. Check message ID deduplication                        │  │
│  │ 3. Parse message (from, text, messageId)                 │  │
│  │ 4. Queue async processing                                │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ 3. Async processing
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Message Processor                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Step 1: Check if new user                                │  │
│  │   → YES: Assign agent + send intro message               │  │
│  │   → NO: Continue                                         │  │
│  │                                                           │  │
│  │ Step 2: Get user's assigned agent                        │  │
│  │   → Query Redis/SessionStore                             │  │
│  │                                                           │  │
│  │ Step 3: Route to correct agent                           │  │
│  │   → AgentRouter.route(userId, agent, text)               │  │
│  │                                                           │  │
│  │ Step 4: Call AI service with agent context               │  │
│  │   → Fraud detection                                      │  │
│  │   → Generate response                                    │  │
│  │                                                           │  │
│  │ Step 5: Send WhatsApp reply                              │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Redis     │  │  AI Service │  │  WhatsApp   │
│ SessionStore│  │ localhost:  │  │  Graph API  │
│             │  │    4000     │  │             │
│ user→agent  │  │             │  │ Send message│
│ mapping     │  │ /fraud_det  │  │             │
│             │  │ /generate   │  │             │
└─────────────┘  └─────────────┘  └─────────────┘
```

---

## 📊 DATA FLOW SEQUENCE

### New User First Contact:

```
1. WhatsApp User sends first message
2. Webhook receives → returns 200 immediately
3. Message Processor detects NEW USER
4. Agent Router assigns agent (e.g., "hackerAgent")
5. SessionStore saves: userId → "hackerAgent"
6. AI generates intro message for hackerAgent
7. System sends INTRO message to user on WhatsApp
8. System processes original user message
9. AI generates response (using hackerAgent context)
10. System sends response to user
```

### Existing User Message:

```
1. WhatsApp User sends message
2. Webhook receives → returns 200 immediately
3. Message Processor checks MessageID (dedup)
4. SessionStore retrieves: userId → "hackerAgent"
5. Agent Router routes to hackerAgent
6. AI processes with hackerAgent context
7. System sends response to user
```

---

## 🗄️ DATA MODELS

### Redis Schema:

```javascript
// Key-Value Store Structure

// 1. User-Agent Mapping (Permanent)
Key: "session:user:{phoneNumber}"
Value: {
  agentName: "hackerAgent",
  assignedAt: "2026-01-23T10:30:00.000Z",
  lastMessageAt: "2026-01-23T10:35:00.000Z",
  messageCount: 5
}
TTL: null (never expires)

// 2. Message Deduplication (24h expiry)
Key: "msgid:{messageId}"
Value: "1"
TTL: 86400 (24 hours)

// 3. Agent Load Tracking
Key: "agent:load:{agentName}"
Value: 15 (number of users assigned)
TTL: null

// 4. Circuit Breaker State (per agent)
Key: "circuit:{agentName}"
Value: {
  failures: 2,
  state: "closed", // closed, open, half-open
  lastFailure: "2026-01-23T10:30:00.000Z"
}
TTL: 300 (5 minutes)
```

### In-Memory Fallback (when Redis unavailable):

```javascript
const sessions = new Map();
sessions.set(userId, {
  agentName: "hackerAgent",
  assignedAt: Date.now(),
});
```

---

## 🎯 AGENT ASSIGNMENT STRATEGY

### Load Balancing Algorithm:

```
1. Get all available agents: [hackerAgent, benignAgent, policyAgent, riskAgent]
2. Query current load for each agent from Redis
3. Select agent with MINIMUM load
4. Persist assignment permanently
5. Increment agent load counter
```

### Agent Stickiness Guarantee:

- Once assigned, NEVER change
- Survives server restarts (Redis persistence)
- Works across multiple Node instances
- Atomic operations prevent race conditions

---

## 🛡️ RELIABILITY SAFEGUARDS

### 1. Webhook Response Time

- **Target**: < 500ms
- **Max**: 2000ms (Meta timeout)
- **Strategy**: Immediate 200 response, async processing

### 2. Deduplication

- Store messageId in Redis with 24h TTL
- Skip processing if already seen
- Prevents double-processing on Meta retry

### 3. Timeout Handling

```javascript
AI Service Timeouts:
- fraud_detection: 10s
- generate: 25s
- Fallback: ALLOW with safe defaults
```

### 4. Circuit Breaker

```
State Machine:
CLOSED → (5 failures) → OPEN → (30s wait) → HALF-OPEN → (success) → CLOSED

When OPEN:
- Skip AI calls
- Return cached/fallback responses
- Prevent cascading failures
```

### 5. Error Handling

```javascript
Try-Catch Layers:
1. Webhook controller (parse errors)
2. Message processor (processing errors)
3. AI service calls (network/timeout)
4. WhatsApp send (API failures)

Never crash. Always log. Always respond safely.
```

### 6. Retry Strategy

```
AI Service Calls:
- Max retries: 2
- Backoff: 500ms, 1500ms
- Only retry on 5xx or network errors
- Never retry on 4xx

WhatsApp Send:
- Max retries: 3
- Backoff: 1s, 3s, 9s exponential
```

---

## 🔄 PRODUCTION DEPLOYMENT

### Multi-Instance Setup:

```
Load Balancer
    │
    ├─ Node Instance 1 (port 3000)
    ├─ Node Instance 2 (port 3001)
    └─ Node Instance 3 (port 3002)
         │
         └──→ Redis (shared session store)
```

### Environment Variables:

```env
PORT=3000
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
AI_SERVICE_URL=http://localhost:4000
WHATSAPP_TOKEN=your_token
PHONE_NUMBER_ID=your_phone_id
VERIFY_TOKEN=your_verify_token
NODE_ENV=production
```

---

## 🧪 TESTING STRATEGY

### 1. Unit Tests

- sessionStore CRUD operations
- agentRouter load balancing
- deduplication logic
- messageParser edge cases

### 2. Integration Tests

- Full webhook → AI → WhatsApp flow
- Redis connection failures (fallback)
- AI service timeout/error scenarios
- Multiple concurrent users

### 3. Load Tests

- 1000 concurrent webhook requests
- Agent assignment distribution
- Redis connection pooling
- Memory leak detection

### 4. Chaos Engineering

- Kill Redis mid-request
- AI service returns 500
- Network latency injection
- Duplicate webhook deliveries

---

## 📈 MONITORING

### Key Metrics:

```
1. webhook_response_time (p50, p95, p99)
2. ai_service_latency
3. message_processing_duration
4. agent_load_distribution
5. error_rate (by type)
6. deduplication_hit_rate
7. circuit_breaker_state
```

### Alerts:

- Webhook response > 1.5s
- Error rate > 5%
- Circuit breaker OPEN
- Redis connection lost
- AI service unavailable

---

## 🚀 SCALING CONSIDERATIONS

### Horizontal Scaling:

- Stateless app servers (Redis for state)
- Session affinity NOT required
- Any instance can handle any user

### Vertical Scaling:

- Node.js cluster mode
- Worker threads for CPU tasks
- Redis connection pooling

### Bottlenecks:

1. AI service (localhost:4000) - consider load balancing multiple AI instances
2. WhatsApp API rate limits - implement queue with rate limiting
3. Redis throughput - use Redis Cluster for > 100k users

---

## 🔐 SECURITY

- Verify webhook signature (Meta's X-Hub-Signature)
- Rate limit per user (prevent spam)
- Sanitize user input before AI
- Encrypt sensitive data in Redis
- Use HTTPS for all external APIs
- Rotate tokens regularly
