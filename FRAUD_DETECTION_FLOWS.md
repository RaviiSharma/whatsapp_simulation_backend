# WhatsApp AI Fraud Detection - Visual Flow Diagrams

## 🔄 Complete Message Processing Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                          USER SENDS MESSAGE                             │
│                    (WhatsApp → Cloud API → Webhook)                     │
└────────────────────────────┬───────────────────────────────────────────┘
                             │
                             ↓
┌────────────────────────────────────────────────────────────────────────┐
│  WEBHOOK CONTROLLER: POST /webhook                                      │
│  • Verify WhatsApp signature                                            │
│  • Parse message (from, text, messageId)                                │
│  • Return 200 OK immediately (async processing)                         │
└────────────────────────────┬───────────────────────────────────────────┘
                             │
                             ↓
┌────────────────────────────────────────────────────────────────────────┐
│  MESSAGE PROCESSOR SERVICE                                              │
└────────────────────────────┬───────────────────────────────────────────┘
                             │
                             ↓
┌────────────────────────────────────────────────────────────────────────┐
│  STEP 1: DEDUPLICATION CHECK                                            │
│  • Check Redis: dedup:{messageId}                                       │
│  • If exists → SKIP (duplicate)                                         │
│  • Else → Mark as processed (24h TTL)                                   │
└────────────────────────────┬───────────────────────────────────────────┘
                             │
                             ↓
┌────────────────────────────────────────────────────────────────────────┐
│  STEP 2: UPDATE SESSION WINDOW                                          │
│  • Set Redis: window:{phone} = { lastMessageAt } (24h TTL)             │
│  • Tracks WhatsApp 24-hour messaging policy                             │
└────────────────────────────┬───────────────────────────────────────────┘
                             │
                             ↓
┌────────────────────────────────────────────────────────────────────────┐
│  STEP 3: CHECK COMPROMISED STATUS                                       │
│  • Get Redis: compromised:{phone}                                       │
│  • If flagged && currentAgent == "hackerAgent":                         │
│    → Force switch to riskAgent                                          │
│    → Update session                                                     │
└────────────────────────────┬───────────────────────────────────────────┘
                             │
                             ↓
┌────────────────────────────────────────────────────────────────────────┐
│  STEP 4: AGENT ROUTING (Sticky Session)                                │
│  • Get Redis: session:{phone}                                           │
│  • If exists → Use existing agent (NEVER reassign)                      │
│  • If new → Load balance across available agents                        │
│    → Get all agent_load:{agent} counts                                  │
│    → Assign to agent with MINIMUM load                                  │
│    → Create session in Redis                                            │
└────────────────────────────┬───────────────────────────────────────────┘
                             │
                             ↓
┌────────────────────────────────────────────────────────────────────────┐
│  STEP 5: FRAUD DETECTION & CLASSIFICATION                               │
│  • Scan message for sensitive data:                                     │
│    - OTP pattern: /\b\d{4,6}\b/                                         │
│    - Card pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/        │
│    - Link pattern: /https?:\/\/[^\s]+/                                  │
│  • Calculate risk level:                                                │
│    - Card + OTP → CRITICAL                                              │
│    - (Card/OTP) + Link → HIGH                                           │
│    - Card OR OTP → MEDIUM                                               │
│    - Link only → LOW                                                    │
└────────────────────────────┬───────────────────────────────────────────┘
                             │
                             ↓
                    ┌────────┴────────┐
                    │  Fraud Detected? │
                    └────────┬────────┘
                             │
                 ┌───────────┴───────────┐
                 │                       │
                YES                     NO
                 │                       │
                 ↓                       ↓
┌────────────────────────────────┐  ┌─────────────────────────────┐
│  FRAUD HANDLING                │  │  CONTINUE NORMAL FLOW       │
│  • Create fraud report in      │  │  • Skip to STEP 6           │
│    MongoDB (masked data):      │  │                             │
│    - phoneNumber               │  └─────────────────────────────┘
│    - agent                     │
│    - riskLevel                 │
│    - evidence (masked)         │
│    - conversationSnippet       │
│  • Mark user compromised:      │
│    Redis: compromised:{phone}  │
│  • Get protective action:      │
│    - CRITICAL/HIGH:            │
│      → Switch to riskAgent     │
│      → Send security message   │
│      → BLOCK AI generation     │
│    - MEDIUM:                   │
│      → Send warning            │
│      → Continue monitoring     │
│    - LOW:                      │
│      → Log only                │
└────────────────┬───────────────┘
                 │
                 ↓
        ┌────────────────┐
        │ CRITICAL/HIGH? │
        └────────┬───────┘
                 │
       ┌─────────┴──────────┐
       │                    │
      YES                  NO
       │                    │
       ↓                    ↓
  ┌──────────┐       ┌──────────┐
  │  BLOCK   │       │ CONTINUE │
  │  & EXIT  │       │ TO AI    │
  └──────────┘       └─────┬────┘
                           │
                           ↓
┌────────────────────────────────────────────────────────────────────────┐
│  STEP 6: PRODUCTION SAFETY CHECK                                        │
│  • If NODE_ENV === "production" && agent === "hackerAgent":             │
│    → Force switch to benignAgent                                        │
│    → Update session                                                     │
└────────────────────────────┬───────────────────────────────────────────┘
                             │
                             ↓
┌────────────────────────────────────────────────────────────────────────┐
│  STEP 7: AI GENERATION                                                  │
│  • Call AI Service with:                                                │
│    - userId                                                             │
│    - message text                                                       │
│    - assigned agent name                                                │
│  • Get agent-specific response                                          │
└────────────────────────────┬───────────────────────────────────────────┘
                             │
                             ↓
┌────────────────────────────────────────────────────────────────────────┐
│  STEP 8: SEND RESPONSE                                                  │
│  • WhatsApp Cloud API: sendMessage                                      │
│  • Retry logic: 3 attempts, exponential backoff                         │
│  • Log metrics: duration, status                                        │
└────────────────────────────┬───────────────────────────────────────────┘
                             │
                             ↓
┌────────────────────────────────────────────────────────────────────────┐
│                          MESSAGE DELIVERED                              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🚨 Fraud Detection Decision Tree

```
                    ┌──────────────────┐
                    │  Scan Message    │
                    │  for Patterns    │
                    └────────┬─────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
    ┌───────▼───────┐ ┌─────▼─────┐ ┌───────▼───────┐
    │  OTP Found?   │ │Card Found?│ │ Link Found?   │
    │ /\b\d{4,6}\b/ │ │16 digits  │ │http/https     │
    └───────┬───────┘ └─────┬─────┘ └───────┬───────┘
            │               │               │
            └───────────────┼───────────────┘
                            │
                    ┌───────▼────────┐
                    │ Risk Calculator│
                    └───────┬────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼────────┐  ┌───────▼────────┐  ┌──────▼──────┐
│  CRITICAL      │  │     HIGH       │  │   MEDIUM    │
│  Card + OTP    │  │ (Card/OTP)     │  │  Card OR    │
│                │  │   + Link       │  │    OTP      │
│  ACTION:       │  │                │  │             │
│  • Switch to   │  │  ACTION:       │  │  ACTION:    │
│    riskAgent   │  │  • Switch to   │  │  • Send     │
│  • Flag user   │  │    riskAgent   │  │    warning  │
│  • Block AI    │  │    (if hacker) │  │  • Monitor  │
│  • Alert admin │  │  • Flag user   │  │  • Continue │
└────────────────┘  │  • Block AI    │  └─────────────┘
                    │  • Alert admin │
                    └────────────────┘
                            │
                    ┌───────▼────────┐
                    │   LOW          │
                    │   Link only    │
                    │                │
                    │   ACTION:      │
                    │   • Log only   │
                    │   • No action  │
                    └────────────────┘
```

---

## 🔄 Agent Routing Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                    User Sends Message                             │
└─────────────────────────┬────────────────────────────────────────┘
                          │
                          ↓
                ┌─────────────────────┐
                │  Check Redis:       │
                │  session:{phone}    │
                └──────────┬──────────┘
                           │
                  ┌────────┴────────┐
                  │  Session Exists? │
                  └────────┬────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
            YES                        NO
              │                         │
              ↓                         ↓
    ┌───────────────────┐     ┌───────────────────┐
    │  USE EXISTING     │     │  LOAD BALANCING   │
    │  AGENT            │     │                   │
    │  (Sticky session) │     │  Get all loads:   │
    │                   │     │  • agent_load:*   │
    │  agentName =      │     │                   │
    │  session.agent    │     │  Find MIN load:   │
    │                   │     │  • hackerAgent: 5 │
    │  NEVER REASSIGN!  │     │  • benignAgent: 8 │
    └─────────┬─────────┘     │  • policyAgent: 3 ◄── CHOSEN
                               │  • riskAgent: 6   │
                               │                   │
                               │  Assign to MIN    │
                               │  Create session   │
                               │  Increment load   │
                               └─────────┬─────────┘
                                         │
                    ┌────────────────────┴────────────────────┐
                    │                                         │
                    ↓                                         ↓
          ┌───────────────────┐                   ┌──────────────────┐
          │  PRODUCTION MODE? │                   │  COMPROMISED?    │
          │  (NODE_ENV)       │                   │  Redis check     │
          └─────────┬─────────┘                   └────────┬─────────┘
                    │                                      │
          ┌─────────┴─────────┐                  ┌────────┴────────┐
          │                   │                  │                 │
      PRODUCTION         DEVELOPMENT           YES               NO
          │                   │                  │                 │
          ↓                   ↓                  ↓                 ↓
  ┌───────────────┐   ┌──────────────┐  ┌───────────────┐  ┌──────────┐
  │ hackerAgent?  │   │  All agents  │  │ hackerAgent?  │  │  PROCEED │
  │ → benignAgent │   │   available  │  │ → riskAgent   │  │  WITH    │
  └───────────────┘   └──────────────┘  └───────────────┘  │  AGENT   │
                                                            └──────────┘
```

---

## 📊 Redis Data Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         REDIS KEY SPACE                              │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  SESSION MANAGEMENT (Permanent until deleted)                        │
├─────────────────────────────────────────────────────────────────────┤
│  session:+919876543210 = {                                          │
│    agentName: "hackerAgent",                                         │
│    assignedAt: "2026-01-28T10:30:45Z",                              │
│    lastMessageAt: "2026-01-28T10:35:12Z",                           │
│    messageCount: 5                                                   │
│  }                                                                   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  AGENT LOAD BALANCING (Counters)                                    │
├─────────────────────────────────────────────────────────────────────┤
│  agent_load:hackerAgent = 12                                        │
│  agent_load:benignAgent = 25                                        │
│  agent_load:policyAgent = 8                                         │
│  agent_load:riskAgent = 3                                           │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  MESSAGE DEDUPLICATION (24-hour TTL)                                │
├─────────────────────────────────────────────────────────────────────┤
│  dedup:wamid.abc123 = { processedAt: "2026-01-28T10:30:45Z" }      │
│  dedup:wamid.def456 = { processedAt: "2026-01-28T10:31:22Z" }      │
│  TTL: 86400 seconds (auto-delete after 24h)                         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  SESSION WINDOW (24-hour TTL)                                       │
├─────────────────────────────────────────────────────────────────────┤
│  window:+919876543210 = { lastMessageAt: "2026-01-28T10:35:12Z" }  │
│  TTL: 86400 seconds (tracks WhatsApp messaging policy)              │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  COMPROMISED USERS (30-day TTL)                                     │
├─────────────────────────────────────────────────────────────────────┤
│  compromised:+919876543210 = {                                      │
│    flaggedAt: "2026-01-28T10:40:00Z",                              │
│    riskLevel: "CRITICAL",                                           │
│    status: "active"                                                 │
│  }                                                                   │
│  TTL: 2592000 seconds (30 days, admin can clear earlier)            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🗄️ MongoDB Collection Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│  DATABASE: whatsapp_ai                                               │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  COLLECTION: fraud_reports                                           │
├─────────────────────────────────────────────────────────────────────┤
│  {                                                                   │
│    _id: ObjectId("64a1b2c3d4e5f6789abc1234"),                       │
│    phoneNumber: "+919876543210",                                    │
│    agent: "hackerAgent",                                            │
│    riskLevel: "CRITICAL",                                           │
│    evidence: {                                                       │
│      otp: "****56",              ◄── MASKED                         │
│      card: "**************78",   ◄── MASKED                         │
│      clickedLink: true,                                             │
│      linkCount: 1                                                   │
│    },                                                                │
│    conversationSnippet: [                                            │
│      "Please verify: 123456",                                       │
│      "Card: 1234 5678 9012 3456"                                    │
│    ],                                                                │
│    metadata: {                                                       │
│      detectedAt: ISODate("2026-01-28T10:40:00Z"),                   │
│      messageId: "wamid.abc123"                                      │
│    },                                                                │
│    status: "new",                                                    │
│    reviewedAt: null,                                                 │
│    reviewedBy: null,                                                 │
│    notes: null,                                                      │
│    createdAt: ISODate("2026-01-28T10:40:00Z"),                      │
│    updatedAt: ISODate("2026-01-28T10:40:00Z")                       │
│  }                                                                   │
│                                                                      │
│  INDEXES:                                                            │
│  • phoneNumber (1)                                                   │
│  • status (1)                                                        │
│  • riskLevel (1)                                                     │
│  • createdAt (-1)                                                    │
│  • { status: 1, riskLevel: 1 } (compound)                           │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  COLLECTION: sessions                                                │
├─────────────────────────────────────────────────────────────────────┤
│  {                                                                   │
│    userId: "+919876543210",                                         │
│    data: {                                                           │
│      agentName: "hackerAgent",                                      │
│      assignedAt: "2026-01-28T10:30:45Z",                            │
│      lastMessageAt: "2026-01-28T10:35:12Z",                         │
│      messageCount: 5                                                 │
│    },                                                                │
│    updatedAt: ISODate("2026-01-28T10:35:12Z")                       │
│  }                                                                   │
│                                                                      │
│  INDEXES:                                                            │
│  • userId (1) UNIQUE                                                 │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  COLLECTION: message_dedup                                           │
├─────────────────────────────────────────────────────────────────────┤
│  {                                                                   │
│    messageId: "wamid.abc123",                                       │
│    processedAt: ISODate("2026-01-28T10:30:45Z"),                    │
│    expiresAt: ISODate("2026-01-29T10:30:45Z")  ◄── TTL INDEX        │
│  }                                                                   │
│                                                                      │
│  INDEXES:                                                            │
│  • messageId (1) UNIQUE                                              │
│  • expiresAt (1) TTL (expireAfterSeconds: 0)                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Production Safety Flow

```
┌──────────────────────────────────────────────────────────────────┐
│              START: Message Processing                            │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ↓
              ┌─────────────────────────┐
              │  Check NODE_ENV         │
              └──────────┬──────────────┘
                         │
         ┌───────────────┴───────────────┐
         │                               │
    PRODUCTION                      DEVELOPMENT
         │                               │
         ↓                               ↓
┌────────────────────┐          ┌────────────────────┐
│  SAFETY ENFORCED   │          │   ALL AGENTS OK    │
│                    │          │                    │
│  Available agents: │          │  Available agents: │
│  • benignAgent     │          │  • hackerAgent     │
│  • policyAgent     │          │  • benignAgent     │
│  • riskAgent       │          │  • policyAgent     │
│                    │          │  • riskAgent       │
│  hackerAgent       │          │                    │
│  FILTERED OUT      │          │  Full testing      │
│                    │          │  capabilities      │
└─────────┬──────────┘          └─────────┬──────────┘
          │                               │
          └───────────────┬───────────────┘
                          │
                          ↓
            ┌─────────────────────────┐
            │  If agent == hacker     │
            │  in production:         │
            │  → Force benignAgent    │
            └─────────────┬───────────┘
                          │
                          ↓
            ┌─────────────────────────┐
            │  PROCEED WITH SAFE      │
            │  AGENT ASSIGNMENT       │
            └─────────────────────────┘
```

---

## 📈 Scalability Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                        LOAD BALANCER (NGINX/AWS ALB)               │
└────────────────────────────┬───────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ↓                    ↓                    ↓
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  Webhook      │    │  Webhook      │    │  Webhook      │
│  Server 1     │    │  Server 2     │    │  Server 3     │
│  (Stateless)  │    │  (Stateless)  │    │  (Stateless)  │
└───────┬───────┘    └───────┬───────┘    └───────┬───────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ↓                    ↓                    ↓
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  Redis Node 1 │    │  MongoDB      │    │  AI Service   │
│  (Primary)    │◄──►│  Replica Set  │    │  (Separate)   │
│               │    │               │    │               │
│  Redis Node 2 │    │  Primary +    │    │  LLM API      │
│  (Replica)    │    │  2 Secondaries│    │               │
└───────────────┘    └───────────────┘    └───────────────┘

KEY FEATURES:
✅ Horizontal scaling: Add more webhook servers
✅ Stateless design: All state in Redis/MongoDB
✅ High availability: Redis replication + MongoDB replica set
✅ Load balancing: Distribute traffic across servers
✅ Fault tolerance: If one server fails, others continue
```

---

**All flows documented for easy understanding and onboarding!** 🚀
