# System Flow Diagrams

## 📊 Main Message Processing Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                          NEW USER FLOW                              │
└─────────────────────────────────────────────────────────────────────┘

1. WhatsApp User: "Hello"
        │
        ▼
2. Meta sends webhook POST /webhook
        │
        ▼
3. webhook.controller.js
   ├─ Return HTTP 200 (< 500ms) ✅
   └─ Queue async processing
        │
        ▼
4. messageProcessor.processMessage()
   ├─ Parse message
   ├─ Check deduplication
   └─ Get/Assign agent
        │
        ▼
5. agentRouter.getOrAssignAgent()
   ├─ Check sessionStore
   ├─ NOT FOUND → NEW USER ✅
   ├─ Load balance agents
   ├─ Select "hackerAgent"
   └─ Create session
        │
        ▼
6. handleNewUser()
   ├─ Get intro: "🔓 Hey there!..."
   ├─ Send intro to WhatsApp ✅
   └─ Wait 500ms
        │
        ▼
7. Fraud Detection
   ├─ Call AI: checkFraud()
   └─ Result: ALLOW
        │
        ▼
8. Generate Reply
   ├─ Call AI: generateAgentMessage()
   └─ Reply: "Thanks for contacting us..."
        │
        ▼
9. Send to WhatsApp
   └─ User receives reply ✅


┌─────────────────────────────────────────────────────────────────────┐
│                       EXISTING USER FLOW                            │
└─────────────────────────────────────────────────────────────────────┘

1. WhatsApp User: "How are you?"
        │
        ▼
2. Meta sends webhook POST /webhook
        │
        ▼
3. webhook.controller.js
   ├─ Return HTTP 200 (< 500ms) ✅
   └─ Queue async processing
        │
        ▼
4. messageProcessor.processMessage()
   ├─ Parse message
   ├─ Check deduplication
   └─ Get agent
        │
        ▼
5. agentRouter.getOrAssignAgent()
   ├─ Check sessionStore
   ├─ FOUND → EXISTING USER ✅
   ├─ Return "hackerAgent"
   └─ isNewUser = false
        │
        ▼
6. Skip handleNewUser() (not new)
        │
        ▼
7. Fraud Detection
   ├─ Call AI: checkFraud("hackerAgent")
   └─ Result: ALLOW
        │
        ▼
8. Generate Reply
   ├─ Call AI: generateAgentMessage("hackerAgent")
   └─ Reply: "I understand..."
        │
        ▼
9. Send to WhatsApp
   └─ User receives reply ✅


┌─────────────────────────────────────────────────────────────────────┐
│                    AGENT STICKINESS GUARANTEE                       │
└─────────────────────────────────────────────────────────────────────┘

User ID: +1234567890

First Contact (Day 1, 10:00 AM)
    ↓
sessionStore.createSession("+1234567890", "hackerAgent")
    ↓
Redis: session:user:+1234567890 → { agentName: "hackerAgent" }
    ↓
✅ ALL FUTURE MESSAGES FROM THIS USER → hackerAgent

Second Message (Day 1, 10:05 AM)
    ↓
sessionStore.getSession("+1234567890")
    ↓
Redis: → { agentName: "hackerAgent" }
    ↓
✅ Route to hackerAgent

------ SERVER RESTART ------

Third Message (Day 2, 9:00 AM)
    ↓
sessionStore.getSession("+1234567890")
    ↓
Redis: → { agentName: "hackerAgent" } (PERSISTED)
    ↓
✅ Still routed to hackerAgent

------ 100 MORE MESSAGES ------

Message #103 (Day 30)
    ↓
sessionStore.getSession("+1234567890")
    ↓
Redis: → { agentName: "hackerAgent" } (PERMANENT)
    ↓
✅ ALWAYS hackerAgent (NEVER CHANGES)


┌─────────────────────────────────────────────────────────────────────┐
│                    LOAD BALANCING ALGORITHM                         │
└─────────────────────────────────────────────────────────────────────┘

New User: +9876543210

Step 1: Query current agent loads
    ↓
Redis:
  agent:load:hackerAgent  → 42
  agent:load:benignAgent  → 38 ← MINIMUM
  agent:load:policyAgent  → 45
  agent:load:riskAgent    → 40

Step 2: Select agent with MIN load
    ↓
Selected: benignAgent

Step 3: Create session
    ↓
Redis SET: session:user:+9876543210 → { agentName: "benignAgent" }

Step 4: Increment agent load
    ↓
Redis INCR: agent:load:benignAgent → 39

Result:
  ✅ User assigned to benignAgent
  ✅ Load now balanced (42, 39, 45, 40)


┌─────────────────────────────────────────────────────────────────────┐
│                      DEDUPLICATION FLOW                             │
└─────────────────────────────────────────────────────────────────────┘

Message ID: wamid.ABC123 (from Meta)

First Delivery (10:00:00)
    ↓
deduplication.isDuplicate("wamid.ABC123")
    ↓
Redis: msgid:wamid.ABC123 → NOT FOUND
    ↓
Result: false (NOT duplicate)
    ↓
deduplication.markAsProcessed("wamid.ABC123")
    ↓
Redis SET: msgid:wamid.ABC123 → "1" (TTL: 24 hours)
    ↓
✅ Process message normally

------ Meta Retry (10:00:05) ------

Second Delivery (same message ID)
    ↓
deduplication.isDuplicate("wamid.ABC123")
    ↓
Redis: msgid:wamid.ABC123 → EXISTS
    ↓
Result: true (IS duplicate)
    ↓
⏭️ Skip processing
    ↓
✅ Message NOT processed twice


┌─────────────────────────────────────────────────────────────────────┐
│                         ERROR HANDLING                              │
└─────────────────────────────────────────────────────────────────────┘

Scenario 1: AI Service Timeout
    ↓
ai.service.checkFraud() → TIMEOUT (10s)
    ↓
Catch error: "ECONNABORTED"
    ↓
Log: "⏱ AI service timeout"
    ↓
Return fallback: { decision: "ALLOW", risk: "unknown" }
    ↓
✅ Continue processing (don't block user)

Scenario 2: Redis Connection Lost
    ↓
redis.get("session:user:123") → ERROR
    ↓
Catch error
    ↓
Switch to: memoryStore.get("session:user:123")
    ↓
✅ System continues with in-memory fallback

Scenario 3: WhatsApp Send Failure
    ↓
whatsapp.sendMessage() → ERROR (network)
    ↓
Retry #1 after 1s → ERROR
    ↓
Retry #2 after 3s → ERROR
    ↓
Retry #3 after 9s → ERROR
    ↓
Log: "❌ All send attempts failed"
    ↓
✅ Don't crash (user may retry)


┌─────────────────────────────────────────────────────────────────────┐
│                    MULTI-INSTANCE DEPLOYMENT                        │
└─────────────────────────────────────────────────────────────────────┘

                    Load Balancer
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
    Instance 1      Instance 2      Instance 3
    (Port 3000)     (Port 3001)     (Port 3002)
         │               │               │
         └───────────────┼───────────────┘
                         │
                         ▼
                    Redis Server
                  (Shared State)
                         │
        ┌────────────────┼────────────────┐
        ↓                ↓                ↓
    Sessions         Agent Loads      Dedup IDs


User sends message → Load Balancer → Any Instance
                                           ↓
                                    Queries Redis
                                           ↓
                                  Gets agent: "hackerAgent"
                                           ↓
                                    Routes correctly

✅ No matter which instance handles request
✅ All instances see same session data
✅ Agent stickiness maintained across instances


┌─────────────────────────────────────────────────────────────────────┐
│                    PERFORMANCE TIMELINE                             │
└─────────────────────────────────────────────────────────────────────┘

T=0ms     Webhook POST received
T=15ms    Parse message
T=20ms    Check Redis (session)
T=25ms    Return HTTP 200 ✅ (Meta happy)

          ------ Async Processing Starts ------

T=30ms    Check deduplication
T=35ms    Assign/Get agent
T=100ms   Send intro message (if new)
T=150ms   Call AI fraud detection
T=5000ms  AI fraud response
T=5100ms  Call AI generate
T=10000ms AI generate response
T=10100ms Send WhatsApp message
T=10500ms Done ✅

Total: 10.5 seconds (user sees reply)
Webhook: 25ms (well under 2s limit)
```

## 🎯 Key Takeaways

1. **Webhook responds in < 100ms** → Meta never retries unnecessarily
2. **Agent assigned once** → User always gets same agent forever
3. **Intro message sent first** → AI initiates conversation
4. **Deduplication prevents doubles** → Same message never processed twice
5. **Redis persistence** → Survives restarts and works across instances
6. **Fallback on errors** → System never crashes, always responds safely
7. **Load balancing** → Agents get equal distribution of users
8. **Async processing** → Heavy work happens after webhook response
