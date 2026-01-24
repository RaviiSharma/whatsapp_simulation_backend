# Testing Guide - WhatsApp Multi-Agent AI System

## 🧪 Testing Strategy

### 1. Unit Tests (Components)

#### Session Store

```javascript
// Test: Create session
const session = await sessionStore.createSession("1234567890", "hackerAgent");
assert(session.agentName === "hackerAgent");

// Test: Get session
const retrieved = await sessionStore.getSession("1234567890");
assert(retrieved.agentName === "hackerAgent");

// Test: Agent load tracking
const load = await sessionStore.getAgentLoad("hackerAgent");
assert(load === 1);
```

#### Agent Router

```javascript
// Test: New user assignment
const result = await agentRouter.getOrAssignAgent("1234567890");
assert(result.isNewUser === true);
assert(result.agentName !== null);

// Test: Stickiness
const result2 = await agentRouter.getOrAssignAgent("1234567890");
assert(result2.agentName === result.agentName);
assert(result2.isNewUser === false);
```

#### Deduplication

```javascript
// Test: First message
const isDupe = await deduplication.isDuplicate("msg123");
assert(isDupe === false);

// Mark as processed
await deduplication.markAsProcessed("msg123");

// Test: Duplicate detection
const isDupe2 = await deduplication.isDuplicate("msg123");
assert(isDupe2 === true);
```

---

### 2. Integration Tests

#### A. Full Message Flow

**Test Case: New User - First Message**

```bash
# Send webhook POST
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "1234567890",
            "id": "msg_001",
            "timestamp": "1234567890",
            "type": "text",
            "text": { "body": "Hello" }
          }],
          "contacts": [{
            "profile": { "name": "Test User" }
          }]
        }
      }]
    }]
  }'
```

**Expected Behavior:**

1. ✅ Webhook responds with 200 immediately (< 500ms)
2. ✅ User assigned to agent (check logs)
3. ✅ Intro message sent to user
4. ✅ User's message processed
5. ✅ AI reply sent

**Verify:**

```bash
# Check user's assigned agent
curl http://localhost:3000/admin/user/1234567890
```

---

**Test Case: Existing User - Subsequent Message**

```bash
# Send second message
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "1234567890",
            "id": "msg_002",
            "timestamp": "1234567891",
            "type": "text",
            "text": { "body": "How are you?" }
          }]
        }
      }]
    }]
  }'
```

**Expected Behavior:**

1. ✅ Webhook responds with 200
2. ✅ Same agent handles message (stickiness)
3. ✅ NO intro message (not new)
4. ✅ Reply sent

---

#### B. Duplicate Message Handling

```bash
# Send same message twice
curl -X POST http://localhost:3000/webhook -d '{...same messageId...}'
curl -X POST http://localhost:3000/webhook -d '{...same messageId...}'
```

**Expected:**

- First: Processed normally
- Second: Skipped (duplicate detected in logs)

---

#### C. Agent Load Balancing

```bash
# Create 10 new users
for i in {1..10}; do
  curl -X POST http://localhost:3000/webhook \
    -H "Content-Type: application/json" \
    -d "{
      \"entry\": [{
        \"changes\": [{
          \"value\": {
            \"messages\": [{
              \"from\": \"555000000$i\",
              \"id\": \"msg_$i\",
              \"type\": \"text\",
              \"text\": { \"body\": \"Test\" }
            }]
          }
        }]
      }]
    }"
done

# Check distribution
curl http://localhost:3000/admin/agents
```

**Expected:**

- Agents have roughly equal load (2-3 users each)

---

### 3. Failure Scenarios

#### A. Redis Unavailable

**Test:**

1. Start server without Redis running
2. Send messages

**Expected:**

- ✅ Fallback to in-memory store
- ✅ System still works
- ⚠️ Log warning: "Redis unavailable, using in-memory store"

---

#### B. AI Service Timeout

**Test:**

```bash
# Stop AI service (localhost:4000)
# Send message
```

**Expected:**

- ✅ Webhook responds quickly
- ✅ Fallback response sent to user
- ⚠️ Log: "AI service timeout"

---

#### C. AI Service 429 (Rate Limit)

**Simulate:**

```javascript
// Mock AI service to return 429
```

**Expected:**

- ✅ Fallback message sent
- ⚠️ Log: "AI service rate limit exceeded"

---

#### D. Network Failure

**Test:**

- Disconnect network mid-processing

**Expected:**

- ✅ Error caught
- ✅ Fallback message attempt
- ❌ Log error but don't crash

---

### 4. Load Testing

#### A. Concurrent Webhooks

**Test:**

```bash
# Install Apache Bench
# Send 100 concurrent requests

ab -n 1000 -c 100 -p webhook.json -T application/json \
  http://localhost:3000/webhook
```

**Expected:**

- All requests respond < 2s
- No crashes
- No duplicate processing

---

#### B. Agent Assignment Under Load

**Test:**

```javascript
// Simulate 1000 users joining simultaneously
const users = Array.from({ length: 1000 }, (_, i) => `user_${i}`);

await Promise.all(users.map((userId) => agentRouter.getOrAssignAgent(userId)));

// Check distribution
const loads = await sessionStore.getAllAgentLoads();
console.log(loads); // Should be ~250 per agent
```

---

### 5. Monitoring Tests

#### Health Endpoints

```bash
# System health
curl http://localhost:3000/health

# Admin stats
curl http://localhost:3000/admin/stats

# Agent distribution
curl http://localhost:3000/admin/agents
```

**Expected Response:**

```json
{
  "status": "ok",
  "uptime": 3600,
  "redis": "connected",
  "totalUsers": 150,
  "memory": {
    "used": "45MB",
    "total": "128MB"
  }
}
```

---

### 6. Chaos Engineering

#### A. Random Redis Failures

**Test:**

1. Start with Redis
2. Kill Redis mid-operation
3. Restart Redis
4. Continue sending messages

**Expected:**

- ✅ Graceful degradation to memory
- ✅ Reconnect when Redis available
- ⚠️ May lose session data during downtime

---

#### B. AI Service Intermittent Failures

**Simulate:**

- AI returns 500 every 3rd request

**Expected:**

- ✅ Fallback messages used
- ✅ Successful requests still work
- ⚠️ Logs show errors

---

### 7. Manual Testing Checklist

#### New User Flow

- [ ] User sends first message
- [ ] Intro message received on WhatsApp
- [ ] User's message processed
- [ ] AI reply received
- [ ] Check admin panel: user assigned to agent

#### Existing User Flow

- [ ] User sends second message
- [ ] No intro message this time
- [ ] Reply matches agent personality
- [ ] Same agent handling (check admin)

#### Agent Stickiness

- [ ] Restart server
- [ ] Same user sends message
- [ ] Same agent still assigned
- [ ] Conversation continues seamlessly

#### Multi-User

- [ ] 5 users send messages
- [ ] Each gets different/same agent
- [ ] All conversations isolated
- [ ] No message mix-ups

#### Admin Panel

- [ ] `/admin/stats` returns valid data
- [ ] `/admin/agents` shows load distribution
- [ ] `/admin/user/:id` shows session
- [ ] Manual reassignment works

---

### 8. Performance Benchmarks

**Target Metrics:**

- Webhook response time: < 500ms (p95)
- AI fraud detection: < 10s
- AI generation: < 25s
- Message processing (end-to-end): < 30s
- Concurrent users: 100+
- Memory usage: < 200MB for 1000 users

---

### 9. Testing Tools

```bash
# Install testing dependencies
npm install --save-dev jest supertest

# Run tests
npm test
```

**Test File Structure:**

```
tests/
  ├── unit/
  │   ├── sessionStore.test.js
  │   ├── agentRouter.test.js
  │   └── deduplication.test.js
  ├── integration/
  │   ├── webhook.test.js
  │   └── messageFlow.test.js
  └── load/
      └── concurrent.test.js
```

---

### 10. Production Validation

**Before deploying:**

- [ ] Redis connection tested
- [ ] All agents configured
- [ ] AI service accessible
- [ ] WhatsApp tokens valid
- [ ] Webhook verified by Meta
- [ ] Health endpoints working
- [ ] Logs structured and clear
- [ ] Error handling tested
- [ ] Monitoring configured
- [ ] Backup/recovery plan

---

## 🔍 Debug Commands

```bash
# Check user session
curl http://localhost:3000/admin/user/1234567890

# View all agent loads
curl http://localhost:3000/admin/agents

# System stats
curl http://localhost:3000/admin/stats

# Clear user (testing only)
curl -X DELETE http://localhost:3000/admin/user/1234567890

# Reassign user
curl -X POST http://localhost:3000/admin/user/1234567890/reassign \
  -H "Content-Type: application/json" \
  -d '{"agentName": "benignAgent"}'
```

---

## 📊 Success Criteria

✅ **Reliability:** 99.9% uptime, graceful degradation
✅ **Performance:** < 2s webhook response
✅ **Stickiness:** Users always get same agent
✅ **Scalability:** Handle 1000+ concurrent users
✅ **Recovery:** Auto-reconnect to Redis/AI
✅ **Monitoring:** Clear logs and metrics
