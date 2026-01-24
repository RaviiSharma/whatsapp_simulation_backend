# Proactive Messaging Guide

## 📤 AI-Initiated Conversations

This guide explains how to have your AI agents **initiate conversations** with WhatsApp users (proactive messaging).

---

## 🚨 WhatsApp Business API Limitations

### Critical Constraint

**WhatsApp does NOT allow free-form proactive messages.** You can only:

1. **Reply within 24h** after a user messages you (customer service window)
2. **Send approved Message Templates** for proactive outreach

### Message Templates

To send a proactive message, you MUST:

1. **Create a template** in Meta Business Manager
2. **Get it approved** by Meta (takes 1-3 business days)
3. **Use the template** in API calls

#### Template Example

```
Name: agent_intro
Category: MARKETING
Language: en_US
Body: Hello! I'm {{1}} from SecureBank. Reply to this message to chat with me.
```

#### Template Creation Steps

1. Go to [Meta Business Manager](https://business.facebook.com/wa/manage/message-templates/)
2. Click **Create Template**
3. Choose category: `MARKETING`, `UTILITY`, or `AUTHENTICATION`
4. Write template text with placeholders: `{{1}}`, `{{2}}`, etc.
5. Submit for review (1-3 days)
6. Once approved, use template name in API

---

## 🏗️ Architecture

### Proactive Flow

```
1. Admin/System calls: POST /proactive/start
        ↓
2. Backend assigns agent to user
        ↓
3. Session created in MongoDB
   userId → agentName mapping stored
        ↓
4. Send WhatsApp Template Message
   "Hello! I'm Alex from Security Team..."
        ↓
5. User receives message on WhatsApp
        ↓
6. User replies
        ↓
7. Webhook receives reply
        ↓
8. Backend routes to assigned agent
        ↓
9. AI generates response (using aiMessage from fraud detection)
        ↓
10. Send free-form message (within 24h window)
```

### Session Persistence

```javascript
// Session stored BEFORE sending template
{
  userId: "919102901737",
  agentName: "hackerAgent",
  assignedAt: "2026-01-23T10:00:00.000Z",
  lastMessageAt: "2026-01-23T10:00:00.000Z",
  messageCount: 0,
  proactiveStart: true // Flag for analytics
}
```

---

## 🔧 Implementation

### 1. Configure Template in .env

Add to your `.env` file:

```bash
# WhatsApp Template Configuration
WHATSAPP_TEMPLATE_NAME=agent_intro
WHATSAPP_TEMPLATE_LANGUAGE=en
```

### 2. Start Conversation with Single User

#### API Call

```bash
POST http://localhost:3000/proactive/start
Content-Type: application/json

{
  "phoneNumber": "919102901737",
  "preferredAgent": "hackerAgent",
  "templateParams": {
    "agentName": "Alex from Security Team"
  }
}
```

#### Response

```json
{
  "success": true,
  "agentName": "hackerAgent",
  "phoneNumber": "919102901737",
  "messageId": "wamid.HBgNOTE5MTAyOTAxNzM3...",
  "message": "Proactive conversation initiated successfully",
  "nextSteps": "User can now reply, and AI will respond within 24h window using free-form messages"
}
```

### 3. Batch Start (Multiple Users)

```bash
POST http://localhost:3000/proactive/batch
Content-Type: application/json

{
  "phoneNumbers": [
    "919102901737",
    "919102901738",
    "919102901739"
  ],
  "preferredAgent": "hackerAgent"
}
```

Response:

```json
{
  "success": true,
  "total": 3,
  "successful": 2,
  "failed": 1,
  "results": [
    {
      "phoneNumber": "919102901737",
      "success": true,
      "agentName": "hackerAgent",
      "messageId": "wamid.HBgN..."
    },
    {
      "phoneNumber": "919102901738",
      "success": true,
      "agentName": "hackerAgent",
      "messageId": "wamid.HBgN..."
    },
    {
      "phoneNumber": "919102901739",
      "success": false,
      "error": "TEMPLATE_SEND_FAILED",
      "message": "Template not approved"
    }
  ]
}
```

### 4. Check Eligibility

```bash
GET http://localhost:3000/proactive/check/919102901737
```

Response:

```json
{
  "eligible": true,
  "reason": "User can receive proactive message"
}
```

or

```json
{
  "eligible": false,
  "reason": "User already has active session",
  "agentName": "hackerAgent"
}
```

### 5. Get Proactive Stats

```bash
GET http://localhost:3000/proactive/stats
```

Response:

```json
{
  "success": true,
  "data": {
    "totalProactiveConversations": 45,
    "byAgent": {
      "hackerAgent": 20,
      "benignAgent": 15,
      "policyAgent": 5,
      "riskAgent": 5
    }
  }
}
```

---

## 📝 Code Integration

### Using the Service Directly

```javascript
const proactiveMessaging = require("./services/proactiveMessaging.service");

// Start conversation
async function initiateChat() {
  const result = await proactiveMessaging.startConversation(
    "919102901737",
    "hackerAgent",
  );

  if (result.success) {
    console.log("✅ Conversation started with", result.agentName);
  } else {
    console.error("❌ Failed:", result.error);
  }
}
```

### Scheduled Campaigns

```javascript
const cron = require("node-cron");

// Send proactive messages daily at 10 AM
cron.schedule("0 10 * * *", async () => {
  const phoneNumbers = await getTargetUsers(); // Your logic

  const results =
    await proactiveMessaging.batchStartConversations(phoneNumbers);

  console.log(`✅ Sent ${results.filter((r) => r.success).length} messages`);
});
```

---

## 🛡️ Production Considerations

### 1. Rate Limits

WhatsApp has rate limits:

- **Tier 1:** 1,000 business-initiated conversations per 24h
- **Tier 2:** 10,000 per 24h (after phone number verification)
- **Tier 3:** 100,000 per 24h (after meeting quality criteria)

**Implementation:** Add 1-second delay between batch messages:

```javascript
// Already implemented in batchStartConversations()
await sleep(1000); // 1 second between messages
```

### 2. Error Handling

Common errors:

| Error Code | Meaning                     | Solution                                  |
| ---------- | --------------------------- | ----------------------------------------- |
| 132000     | Template not found          | Create template in Meta Business Manager  |
| 131047     | Template not approved       | Wait for Meta approval                    |
| 131026     | Message undeliverable       | User blocked number or deleted WhatsApp   |
| 131031     | Template parameter mismatch | Check template has correct number of {{}} |
| 470        | Rate limit exceeded         | Implement exponential backoff             |
| 80007      | Phone number not registered | Check PHONE_NUMBER_ID is correct          |

### 3. Security

**CRITICAL:** Protect proactive endpoints in production:

```javascript
// Add to proactive.routes.js
const authenticateAdmin = require("../middleware/auth");

router.post("/start", authenticateAdmin, async (req, res) => {
  // ... existing code
});
```

Example auth middleware:

```javascript
// middleware/auth.js
function authenticateAdmin(req, res, next) {
  const apiKey = req.headers["x-api-key"];

  if (apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}
```

### 4. Monitoring

Track proactive message performance:

```javascript
// Add to MongoDB
const PROACTIVE_LOGS_COLLECTION = "proactive_logs";

await db.collection(PROACTIVE_LOGS_COLLECTION).insertOne({
  phoneNumber,
  agentName,
  templateUsed: templateName,
  sentAt: new Date(),
  status: "sent",
  messageId,
});
```

---

## 🧪 Testing

### Test with WhatsApp Test Numbers

Meta provides test numbers for development:

1. Go to [App Dashboard](https://developers.facebook.com/apps/)
2. Navigate to **WhatsApp** → **API Setup**
3. Add test phone numbers
4. These numbers can receive templates without approval

### Testing Flow

```bash
# 1. Start proactive conversation
curl -X POST http://localhost:3000/proactive/start \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "YOUR_TEST_NUMBER",
    "preferredAgent": "hackerAgent"
  }'

# 2. Check user's session
curl http://localhost:3000/admin/user/YOUR_TEST_NUMBER

# 3. Reply from test number on WhatsApp
# Message: "Hello"

# 4. Verify AI responds with correct agent
# Should see response from hackerAgent
```

---

## 📊 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                   PROACTIVE MESSAGING FLOW                  │
└─────────────────────────────────────────────────────────────┘

Admin/System
    │
    │ POST /proactive/start { phoneNumber, preferredAgent }
    ▼
ProactiveMessaging Service
    │
    ├─ Check eligibility (no existing session)
    ├─ Assign agent (load balancing)
    ├─ Create session in MongoDB
    │   └─ userId → agentName mapping
    │
    └─ Send template message
            │
            ▼
    WhatsApp Business API
            │
            │ Template message delivery
            ▼
    User's WhatsApp
            │
            │ User replies: "Hi"
            ▼
    Webhook POST /webhook
            │
            ▼
    Message Processor
            │
            ├─ Check deduplication
            ├─ Retrieve session (finds existing agentName)
            ├─ Route to hackerAgent
            ├─ Call fraud detection API (get aiMessage)
            └─ Send aiMessage to user
                    │
                    ▼
            User receives AI response ✅
```

---

## ❓ FAQ

### Q: Can I send free-form messages without templates?

**A:** No. WhatsApp requires templates for the first message to users who haven't messaged you. After they reply, you have a 24h window for free-form messages.

### Q: How long does template approval take?

**A:** Typically 1-3 business days. Marketing templates may take longer than utility/authentication templates.

### Q: What if user doesn't reply within 24h?

**A:** You must send another template message to re-open the conversation window.

### Q: Can I customize template per user?

**A:** Yes, using template parameters: `{{1}}`, `{{2}}`, etc. Pass different values via `templateParams`.

### Q: How do I know if message was delivered?

**A:** Check `messageId` in response, then use WhatsApp's status webhooks to track delivery status.

---

## 🔗 Related Documentation

- [ARCHITECTURE.md](../ARCHITECTURE.md) - Overall system architecture
- [FLOWS.md](../FLOWS.md) - Message processing flows
- [TESTING.md](../TESTING.md) - Testing guide
- [Meta Message Templates Docs](https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates)

---

## 📞 Example Use Cases

### 1. Customer Onboarding

Send welcome message after user signs up:

```javascript
// After user registration
await proactiveMessaging.startConversation(user.phoneNumber, "benignAgent", {
  agentName: "Sarah from Customer Success",
});
```

### 2. Security Alerts

Alert users about suspicious activity:

```javascript
// Detection system triggers alert
await proactiveMessaging.startConversation(user.phoneNumber, "riskAgent", {
  agentName: "Security Team",
});
```

### 3. Marketing Campaigns

Reach out to inactive users:

```javascript
const inactiveUsers = await getInactiveUsers(30); // 30 days

await proactiveMessaging.batchStartConversations(
  inactiveUsers.map((u) => u.phoneNumber),
  "benignAgent",
);
```

---

**Remember:** Proactive messaging is powerful but heavily regulated. Always comply with WhatsApp Business Policy and local regulations (GDPR, TCPA, etc.).
