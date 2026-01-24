# Visual Flow Diagrams - Complete System

## 🎯 System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    WHATSAPP MULTI-AGENT AI SYSTEM                       │
│                                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐             │
│  │   WhatsApp   │───▶│   Backend    │───▶│  AI Service  │             │
│  │    Users     │◀───│  (Node.js)   │◀───│ (localhost:  │             │
│  │              │    │              │    │    4000)     │             │
│  └──────────────┘    └──────┬───────┘    └──────────────┘             │
│                             │                                          │
│                             ▼                                          │
│                      ┌──────────────┐                                  │
│                      │   MongoDB    │                                  │
│                      │  (Sessions)  │                                  │
│                      └──────────────┘                                  │
│                                                                         │
│  Key Features:                                                         │
│  • Agent Stickiness: User → Agent (permanent)                          │
│  • Proactive Messaging: AI initiates conversation                      │
│  • High Reliability: < 2s webhook response                             │
│  • Persistence: Survives restarts                                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📱 Flow 1: Reactive Messaging (User Messages First)

### Complete Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        REACTIVE MESSAGE FLOW                            │
└─────────────────────────────────────────────────────────────────────────┘

👤 User (919102901737)
│
│  Sends "Hello" via WhatsApp
│
▼

📱 WhatsApp Business Cloud API
│
│  POST https://yourserver.com/webhook
│  Body: {
│    entry: [{
│      changes: [{
│        value: {
│          messages: [{
│            from: "919102901737",
│            text: { body: "Hello" },
│            id: "wamid.HBgN..."
│          }]
│        }
│      }]
│    }]
│  }
│
▼

🔵 Webhook Controller (webhook.controller.js)
│
├─ IMMEDIATE: Return 200 (5-50ms) ✅
│  res.status(200).send("EVENT_RECEIVED")
│
└─ ASYNC: Queue processMessage()
    │
    ▼

🔄 Message Processor (messageProcessor.service.js)
│
├─ Step 1: Parse message
│  {
│    from: "919102901737",
│    text: "Hello",
│    messageId: "wamid.HBgN..."
│  }
│
├─ Step 2: Deduplication check (deduplication.js)
│  isDuplicate("wamid.HBgN...") → false ✅
│  markAsProcessed("wamid.HBgN...") → MongoDB
│  TTL: 24 hours
│
├─ Step 3: Agent routing (agentRouter.service.js)
│  │
│  getSession("919102901737")
│  │
│  ├─ NEW USER? (session not found)
│  │  │
│  │  ├─ Get agent loads
│  │  │  hackerAgent: 10
│  │  │  benignAgent: 8   ← Lowest
│  │  │  policyAgent: 12
│  │  │  riskAgent: 9
│  │  │
│  │  ├─ Assign: benignAgent
│  │  │
│  │  ├─ Create session in MongoDB
│  │  │  {
│  │  │    userId: "919102901737",
│  │  │    agentName: "benignAgent",
│  │  │    assignedAt: "2026-01-23T10:00:00Z",
│  │  │    messageCount: 0
│  │  │  }
│  │  │
│  │  └─ Send intro message
│  │     whatsapp.sendMessage(
│  │       "919102901737",
│  │       "👋 Hello! Thanks for contacting us."
│  │     )
│  │
│  └─ EXISTING USER? (session found)
│     └─ Return: benignAgent
│
├─ Step 4: Fraud detection (ai.service.js)
│  │
│  POST http://localhost:4000/api/fraud_detection
│  Body: {
│    userId: "919102901737",
│    text: "Hello",
│    agentName: "benignAgent"
│  }
│  │
│  Response: {
│    decision: null,
│    risk: { risk_level: "low" },
│    intent: { intent: "greeting", confidence: 0.95 },
│    aiMessage: "Hey there! What's up?" ← USE THIS
│  }
│  │
│  └─ Return: {
│      decision: { action: "ALLOW" },
│      risk: { risk_level: "low" },
│      intent: { intent: "greeting" },
│      aiMessage: "Hey there! What's up!"
│    }
│
├─ Step 5: Check decision
│  decision.action === "ALLOW" → Continue ✅
│  (if BLOCK → send block message and stop)
│
├─ Step 6: Get AI reply
│  │
│  aiReply = fraudResult.aiMessage
│  │
│  if (!aiReply) {
│    // Fallback: Call generate endpoint
│    POST http://localhost:4000/api/generate
│    Response: { hackerMessage: "..." }
│    aiReply = response.hackerMessage
│  }
│  │
│  aiReply = "Hey there! What's up!" ✅
│
└─ Step 7: Send response
   │
   whatsapp.sendMessage("919102901737", "Hey there! What's up!")
   │
   POST https://graph.facebook.com/v19.0/{PHONE_NUMBER_ID}/messages
   Body: {
     messaging_product: "whatsapp",
     to: "919102901737",
     text: { body: "Hey there! What's up!" }
   }
   │
   ▼

📱 WhatsApp Business Cloud API
│
│  Delivers message to user
│
▼

👤 User (919102901737)
│
└─ Receives: "Hey there! What's up!" ✅

Total time: ~1500ms (webhook responded in 5ms ✅)
```

---

## 🚀 Flow 2: Proactive Messaging (AI Messages First)

### Complete Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      PROACTIVE MESSAGE FLOW (NEW)                       │
└─────────────────────────────────────────────────────────────────────────┘

🖥️ Admin/System
│
│  POST http://localhost:3000/proactive/start
│  Body: {
│    phoneNumber: "919102901737",
│    preferredAgent: "hackerAgent"
│  }
│
▼

🚀 Proactive Messaging Service (proactiveMessaging.service.js)
│
├─ Step 1: Check eligibility
│  │
│  getSession("919102901737")
│  │
│  ├─ Session exists? → Error: "User already has session"
│  └─ No session? → Continue ✅
│
├─ Step 2: Assign agent
│  │
│  preferredAgent provided? → Use "hackerAgent" ✅
│  │
│  OR auto-assign:
│  │
│  getAllAgentLoads()
│  {
│    hackerAgent: 10,
│    benignAgent: 8   ← Lowest
│    policyAgent: 12,
│    riskAgent: 9
│  }
│  Select: benignAgent (lowest load)
│
├─ Step 3: Create session BEFORE sending message
│  │
│  createSession("919102901737", {
│    agentName: "hackerAgent",
│    assignedAt: "2026-01-23T10:00:00Z",
│    lastMessageAt: "2026-01-23T10:00:00Z",
│    messageCount: 0,
│    proactiveStart: true  ← Flag for analytics
│  })
│  │
│  Saved to MongoDB ✅
│  │
│  This ensures agent stickiness is established BEFORE
│  user receives message
│
├─ Step 4: Send WhatsApp template message
│  │
│  ⚠️ IMPORTANT: Cannot send free-form text for proactive messages
│  Must use approved Message Template
│  │
│  whatsapp.sendTemplateMessage("919102901737", {
│    name: "agent_intro",  ← From .env: WHATSAPP_TEMPLATE_NAME
│    language: "en",
│    components: [{
│      type: "body",
│      parameters: [{
│        type: "text",
│        text: "Alex from Security Team"  ← Template variable {{1}}
│      }]
│    }]
│  })
│  │
│  POST https://graph.facebook.com/v19.0/{PHONE_NUMBER_ID}/messages
│  Body: {
│    messaging_product: "whatsapp",
│    to: "919102901737",
│    type: "template",
│    template: {
│      name: "agent_intro",
│      language: { code: "en" },
│      components: [...]
│    }
│  }
│  │
│  ▼
│
│  📱 WhatsApp Cloud API
│  │
│  ├─ Template approved? → Deliver message ✅
│  └─ Template not approved? → Error 131047
│      └─ Return: { success: false, error: "Template not approved" }
│
└─ Step 5: Return success
   {
     success: true,
     agentName: "hackerAgent",
     phoneNumber: "919102901737",
     messageId: "wamid.HBgN...",
     message: "Proactive conversation initiated successfully"
   }
   │
   ▼

👤 User (919102901737)
│
│  Receives WhatsApp message:
│  "Hello! I'm Alex from Security Team from SecureBank.
│   Reply to this message to chat with me."
│
│  Opens WhatsApp → Sees message → Replies "Hi"
│
▼

📱 WhatsApp Business Cloud API
│
│  POST https://yourserver.com/webhook
│  Body: {
│    entry: [{
│      changes: [{
│        value: {
│          messages: [{
│            from: "919102901737",
│            text: { body: "Hi" },
│            id: "wamid.HBgN..."
│          }]
│        }
│      }]
│    }]
│  }
│
▼

🔵 Webhook Controller
│
│  [Same as Reactive Flow from here]
│  │
│  ├─ Return 200 immediately
│  └─ Queue processMessage()
│      │
│      ├─ Deduplication: OK
│      ├─ Get session: Found! (hackerAgent) ✅
│      │   └─ Session was created in Step 3 above
│      ├─ Skip intro message (not new user)
│      ├─ Fraud detection → aiMessage: "Thanks for reaching out! How can I help?"
│      └─ Send aiMessage to user
│
▼

👤 User receives AI response using hackerAgent context ✅

---

📊 Key Difference from Reactive Flow:

Reactive:  User → WhatsApp → Assign agent → Respond
Proactive: Assign agent → Send template → User replies → Respond with assigned agent

Session created BEFORE user replies ensures agent stickiness! ✅
```

---

## 🔄 Flow 3: Agent Stickiness Across Conversations

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AGENT STICKINESS DEMONSTRATION                       │
└─────────────────────────────────────────────────────────────────────────┘

Day 1 - 10:00 AM
│
👤 User (919102901737) sends "Hello"
│
▼ Assign hackerAgent
│
💾 MongoDB: { userId: "919102901737", agentName: "hackerAgent" }
│
📤 Response: "Hey there! What's up?"

─────────────────────────────────────────────────────────────────────────

Day 1 - 10:05 AM
│
👤 User sends "How are you?"
│
▼ Retrieve session → hackerAgent ✅
│
📤 Response from hackerAgent: "I'm good! What about you?"

─────────────────────────────────────────────────────────────────────────

Day 1 - 15:30 PM
│
👤 User sends "Tell me about security"
│
▼ Retrieve session → hackerAgent ✅
│
📤 Response from hackerAgent: "Security is my specialty! Let me explain..."

─────────────────────────────────────────────────────────────────────────

[SERVER RESTART] 🔄

─────────────────────────────────────────────────────────────────────────

Day 2 - 09:00 AM
│
👤 User sends "Are you there?"
│
▼ Retrieve session from MongoDB → hackerAgent ✅
│
📤 Response from hackerAgent: "Yes! I'm here. How can I help?"

─────────────────────────────────────────────────────────────────────────

Day 30 - 14:00 PM
│
👤 User sends "Remember me?"
│
▼ Retrieve session from MongoDB → hackerAgent ✅
│
📤 Response from hackerAgent: "Of course! Good to hear from you!"

─────────────────────────────────────────────────────────────────────────

Result: User ALWAYS gets hackerAgent (agent stickiness) ✅
```

---

## 🛡️ Flow 4: Error Handling & Reliability

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     ERROR HANDLING FLOWS                                │
└─────────────────────────────────────────────────────────────────────────┘

Scenario 1: MongoDB Connection Lost
│
User sends message
│
▼ Webhook Controller
│
├─ Return 200 ✅
└─ processMessage()
    │
    ├─ getSession("919102901737")
    │  ├─ MongoDB query fails
    │  └─ Fall back to in-memory store ✅
    │
    ├─ Check in-memory Map
    │  └─ Return session if exists
    │      OR assign new agent
    │
    └─ Continue processing ✅

Result: System continues operating ✅

─────────────────────────────────────────────────────────────────────────

Scenario 2: AI Service Timeout
│
User sends message
│
▼ Fraud detection
│
├─ POST http://localhost:4000/api/fraud_detection
│  └─ Timeout after 10 seconds
│
├─ Catch error
│  └─ Return fallback: {
│      decision: { action: "ALLOW" },
│      risk: { risk_level: "unknown" },
│      aiMessage: null
│    }
│
├─ aiMessage is null → Call generate endpoint
│  └─ Also times out
│
├─ Catch error
│  └─ Return fallback message:
│      "Thanks for your message. We'll get back to you shortly."
│
└─ Send fallback to user ✅

Result: User receives response (not ignored) ✅

─────────────────────────────────────────────────────────────────────────

Scenario 3: Duplicate Webhook
│
Meta sends webhook (message ID: wamid.ABC123)
│
▼ Webhook Controller
│
├─ Return 200 ✅
└─ processMessage()
    │
    ├─ isDuplicate("wamid.ABC123")
    │  └─ Check MongoDB: Not found
    │
    ├─ markAsProcessed("wamid.ABC123")
    │  └─ Save to MongoDB with 24h TTL
    │
    └─ Continue processing ✅

─────────────────────────────────────────────────────────────────────────

Meta sends same webhook AGAIN (network retry)
│
▼ Webhook Controller
│
├─ Return 200 ✅ (Meta happy)
└─ processMessage()
    │
    ├─ isDuplicate("wamid.ABC123")
    │  └─ Check MongoDB: FOUND! ✅
    │
    └─ Skip processing
        console.log("⏭️ Skipping duplicate message")

Result: Message processed only once ✅

─────────────────────────────────────────────────────────────────────────

Scenario 4: WhatsApp Send Failure
│
Ready to send response
│
▼ sendMessage("919102901737", "Hello!")
│
├─ Attempt 1: POST to WhatsApp API
│  └─ Network error
│
├─ Wait 500ms (exponential backoff)
│
├─ Attempt 2: POST to WhatsApp API
│  └─ Network error
│
├─ Wait 1000ms
│
├─ Attempt 3: POST to WhatsApp API
│  └─ Success! ✅
│
└─ Return success

Result: Message delivered despite network issues ✅
```

---

## 📊 Flow 5: Load Balancing

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       AGENT LOAD BALANCING                              │
└─────────────────────────────────────────────────────────────────────────┘

Current state:
┌──────────────┬───────┐
│ Agent        │ Load  │
├──────────────┼───────┤
│ hackerAgent  │  25   │
│ benignAgent  │  20   │ ← Minimum
│ policyAgent  │  30   │
│ riskAgent    │  22   │
└──────────────┴───────┘

New user (919102901737) messages
│
▼ Agent Router
│
├─ Get all agent loads from MongoDB
│  {
│    hackerAgent: 25,
│    benignAgent: 20,  ← Lowest
│    policyAgent: 30,
│    riskAgent: 22
│  }
│
├─ Find minimum load agent
│  Math.min(25, 20, 30, 22) = 20
│  └─ Select: benignAgent ✅
│
├─ Create session
│  { userId: "919102901737", agentName: "benignAgent" }
│
└─ Increment agent load
   benignAgent: 20 → 21 ✅

New state:
┌──────────────┬───────┐
│ Agent        │ Load  │
├──────────────┼───────┤
│ hackerAgent  │  25   │
│ benignAgent  │  21   │ ← Incremented
│ policyAgent  │  30   │
│ riskAgent    │  22   │
└──────────────┴───────┘

Result: Load distributed evenly across agents ✅
```

---

## 🎯 Flow 6: Complete System Integration

```
┌─────────────────────────────────────────────────────────────────────────┐
│                  END-TO-END SYSTEM INTEGRATION                          │
└─────────────────────────────────────────────────────────────────────────┘

                           ┌─────────────────┐
                           │   WhatsApp User │
                           └────────┬────────┘
                                    │
                                    │ Messages
                                    ▼
                          ┌──────────────────────┐
                          │  Meta Webhook System │
                          │  (WhatsApp Cloud API)│
                          └─────────┬────────────┘
                                    │
                                    │ POST /webhook
                                    ▼
              ┌──────────────────────────────────────────┐
              │      Webhook Controller                  │
              │  ┌────────────────────────────────────┐  │
              │  │ 1. Verify signature (security)     │  │
              │  │ 2. Return 200 (< 2s) ✅            │  │
              │  │ 3. Queue async processing          │  │
              │  └────────────────────────────────────┘  │
              └─────────────────┬────────────────────────┘
                                │
                                │ Async
                                ▼
              ┌──────────────────────────────────────────┐
              │    Message Processor                     │
              │  ┌────────────────────────────────────┐  │
              │  │ parseMessage()                     │  │
              │  │ isDuplicate()                      │  │
              │  │ routeToAgent()                     │  │
              │  │ detectFraud()                      │  │
              │  │ generateReply()                    │  │
              │  │ sendMessage()                      │  │
              │  └────────────────────────────────────┘  │
              └─────────┬──────────┬────────────┬────────┘
                        │          │            │
         ┌──────────────┘          │            └──────────────┐
         │                         │                           │
         ▼                         ▼                           ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│    MongoDB       │    │   AI Service     │    │  WhatsApp API    │
│                  │    │                  │    │                  │
│ • sessions       │    │ • /fraud_detect  │    │ • Send message   │
│ • message_dedup  │    │ • /generate      │    │ • Send template  │
│ • agent_loads    │    │                  │    │                  │
│                  │    │ Returns:         │    │                  │
│ Indexes:         │    │ • aiMessage      │    │ Endpoints:       │
│ • userId (uniq)  │    │ • decision       │    │ • /messages      │
│ • expiresAt(TTL) │    │ • risk           │    │ • /messages      │
│                  │    │ • intent         │    │   (templates)    │
└──────────────────┘    └──────────────────┘    └──────────────────┘
         │                         │                           │
         └─────────────────────────┴───────────────────────────┘
                                   │
                                   │ Data flows back through processor
                                   ▼
                          ┌──────────────────┐
                          │  Response Queue  │
                          └─────────┬────────┘
                                    │
                                    ▼
                          ┌──────────────────┐
                          │ WhatsApp User    │
                          │ Receives Message │
                          └──────────────────┘

Key Integration Points:

1. Webhook → Controller: HTTPS with signature verification
2. Controller → Processor: Async queue (setImmediate)
3. Processor → MongoDB: Session lookup/storage
4. Processor → AI: HTTP with 10s timeout
5. Processor → WhatsApp: HTTP with 3x retry
6. MongoDB → Processor: Automatic fallback to in-memory

Reliability Features:

✅ Immediate webhook response (< 2s)
✅ Message deduplication (24h TTL)
✅ Agent stickiness (MongoDB persistence)
✅ AI timeout handling (fallback messages)
✅ Network retry logic (exponential backoff)
✅ Graceful degradation (in-memory fallback)
✅ Error logging (all failures tracked)
```

---

**All flows implemented and tested! ✅**
