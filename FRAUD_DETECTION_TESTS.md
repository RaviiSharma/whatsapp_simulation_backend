# Fraud Detection - Test Cases & Validation

## 🧪 Test Scenarios

### Test Case 1: OTP Detection (MEDIUM Risk)

**Input Message:**

```
"My OTP is 123456"
```

**Expected Behavior:**

- ✅ Pattern detected: OTP `123456`
- ✅ Risk level: `MEDIUM`
- ✅ Fraud report created in MongoDB
- ✅ Evidence: `{ otp: "****56", card: null, clickedLink: false }`
- ✅ User receives warning: "⚠️ Please don't share sensitive information like OTPs or card numbers via chat."
- ✅ User marked as compromised in Redis (30-day TTL)
- ✅ Conversation continues (AI response generated)
- ✅ Agent unchanged

**Validation:**

```bash
# Check fraud report
curl http://localhost:3000/admin/fraud/reports?riskLevel=MEDIUM

# Check compromised status
curl http://localhost:3000/admin/fraud/user/+919876543210

# Verify Redis key
redis-cli GET "compromised:+919876543210"
```

---

### Test Case 2: Credit Card Detection (MEDIUM Risk)

**Input Message:**

```
"My card number is 1234 5678 9012 3456"
```

**Expected Behavior:**

- ✅ Pattern detected: Card `1234567890123456`
- ✅ Risk level: `MEDIUM`
- ✅ Fraud report created in MongoDB
- ✅ Evidence: `{ otp: null, card: "**************56", clickedLink: false }`
- ✅ User receives warning
- ✅ User marked as compromised in Redis
- ✅ Conversation continues
- ✅ Agent unchanged

**Variations:**

```
"1234-5678-9012-3456"  ✅ Detected
"1234 5678 9012 3456"  ✅ Detected
"1234567890123456"     ✅ Detected
```

---

### Test Case 3: Link Only (LOW Risk)

**Input Message:**

```
"Check this out: https://example.com/promo"
```

**Expected Behavior:**

- ✅ Pattern detected: Link `https://example.com/promo`
- ✅ Risk level: `LOW`
- ✅ Fraud report created in MongoDB
- ✅ Evidence: `{ otp: null, card: null, clickedLink: true, linkCount: 1 }`
- ✅ No warning sent to user
- ✅ No compromised flag
- ✅ Conversation continues normally
- ✅ Agent unchanged

---

### Test Case 4: CRITICAL Risk (Card + OTP)

**Input Message:**

```
"Please verify. Card: 1234 5678 9012 3456, OTP: 123456"
```

**Expected Behavior:**

- ✅ Patterns detected: Card + OTP
- ✅ Risk level: `CRITICAL`
- ✅ Fraud report created in MongoDB
- ✅ Evidence: `{ otp: "****56", card: "**************56", clickedLink: false }`
- ✅ User marked as compromised in Redis
- ✅ If on `hackerAgent` → switched to `riskAgent`
- ✅ Session updated in Redis
- ✅ Security message sent: "⚠️ For your security, I'm connecting you with our security team."
- ✅ AI generation BLOCKED
- ✅ Admin alert triggered

**Validation:**

```bash
# Check CRITICAL report
curl http://localhost:3000/admin/fraud/reports?riskLevel=CRITICAL

# Verify agent switch
curl http://localhost:3000/admin/user/+919876543210

# Should show agentName: "riskAgent"
```

---

### Test Case 5: HIGH Risk (OTP + Link)

**Input Message:**

```
"Enter OTP 123456 at http://phishing-site.com"
```

**Expected Behavior:**

- ✅ Patterns detected: OTP + Link
- ✅ Risk level: `HIGH`
- ✅ Fraud report created
- ✅ Evidence: `{ otp: "****56", card: null, clickedLink: true, linkCount: 1 }`
- ✅ User marked as compromised
- ✅ If on `hackerAgent` → switched to `riskAgent`
- ✅ Security message sent
- ✅ AI generation BLOCKED

---

### Test Case 6: HIGH Risk (Card + Link)

**Input Message:**

```
"Update card 1234 5678 9012 3456 at https://fake-bank.com"
```

**Expected Behavior:**

- ✅ Patterns detected: Card + Link
- ✅ Risk level: `HIGH`
- ✅ Fraud report created
- ✅ Evidence: `{ otp: null, card: "**************56", clickedLink: true, linkCount: 1 }`
- ✅ User marked as compromised
- ✅ Agent switch if on hackerAgent
- ✅ AI generation BLOCKED

---

### Test Case 7: Compromised User Subsequent Message

**Prerequisite:** User already flagged as compromised (from Test Case 4)

**Input Message:**

```
"Hello, are you there?"
```

**Expected Behavior:**

- ✅ Check Redis: `compromised:+919876543210` exists
- ✅ Current agent: `hackerAgent` → Force switch to `riskAgent`
- ✅ Current agent: NOT hackerAgent → Continue with current agent
- ✅ Session updated if switched
- ✅ No new fraud report (no sensitive data)
- ✅ AI response generated with risk awareness

---

### Test Case 8: Production Mode Safety

**Setup:**

```bash
NODE_ENV=production
```

**Input Message:**

```
"Hello, I need help"
```

**Expected Behavior:**

- ✅ Agent routing: `hackerAgent` NOT available
- ✅ Available agents: `benignAgent`, `policyAgent`, `riskAgent`
- ✅ New user assigned to: `benignAgent` (production safety)
- ✅ Existing `hackerAgent` users → forced to `benignAgent`
- ✅ Log message: "🛡️ PRODUCTION MODE: hackerAgent disabled"

---

### Test Case 9: Deduplication

**Scenario:** WhatsApp retries same message twice

**First Message:**

```
Message ID: wamid.abc123
Text: "Hello"
```

**Second Message (duplicate):**

```
Message ID: wamid.abc123
Text: "Hello"
```

**Expected Behavior:**

- ✅ First message: Processed normally
- ✅ Redis key created: `dedup:wamid.abc123` (24h TTL)
- ✅ Second message: Detected as duplicate
- ✅ Log: "⏭️ Skipping duplicate message: wamid.abc123"
- ✅ No processing, no AI call, no response

---

### Test Case 10: Session Window Tracking

**Initial Message:**

```
User: "Hello"
Time: 2026-01-28 10:00:00
```

**Expected Behavior:**

- ✅ Redis key created: `window:+919876543210` (24h TTL)
- ✅ Value: `{ lastMessageAt: "2026-01-28T10:00:00Z" }`
- ✅ Window expires: 2026-01-29 10:00:00

**Check Status:**

```bash
curl http://localhost:3000/admin/windows/+919876543210

Response:
{
  "phoneNumber": "+919876543210",
  "active": true,
  "lastMessageAt": "2026-01-28T10:00:00Z",
  "expiresAt": "2026-01-29T10:00:00Z",
  "requiresTemplate": false
}
```

**After 24 Hours:**

- ✅ Redis key expired (auto-delete)
- ✅ Window status: `{ active: false, requiresTemplate: true }`
- ✅ Business must use template messages

---

### Test Case 11: Agent Stickiness

**First Message:**

```
User: "Hello"
Assigned: benignAgent
```

**Second Message:**

```
User: "How are you?"
```

**Expected Behavior:**

- ✅ Check Redis: `session:+919876543210` exists
- ✅ Agent: `benignAgent` (from session)
- ✅ NO load balancing (sticky session)
- ✅ Agent unchanged: `benignAgent`
- ✅ Log: "✅ Using existing agent: benignAgent (PRESERVED)"

---

### Test Case 12: Load Balancing (New User)

**Setup:**

```
agent_load:hackerAgent = 5
agent_load:benignAgent = 12
agent_load:policyAgent = 3  ← MIN
agent_load:riskAgent = 8
```

**First Message from New User:**

```
User: +919999999999 (NEW)
Message: "Hello"
```

**Expected Behavior:**

- ✅ No session exists for user
- ✅ Load balancing: Find MIN load
- ✅ MIN load agent: `policyAgent` (3)
- ✅ Assign user to `policyAgent`
- ✅ Create session: `session:+919999999999`
- ✅ Increment load: `agent_load:policyAgent = 4`
- ✅ Log: "🆕 New user +919999999999 assigned to policyAgent"

---

### Test Case 13: Admin Workflow - Review Fraud Report

**Step 1: Get New Reports**

```bash
curl http://localhost:3000/admin/fraud/reports?status=new

Response:
{
  "count": 3,
  "reports": [
    {
      "_id": "64a1b2c3d4e5f6789abc1234",
      "phoneNumber": "+919876543210",
      "riskLevel": "CRITICAL",
      "status": "new",
      ...
    }
  ]
}
```

**Step 2: Review Report**

```bash
curl -X PUT http://localhost:3000/admin/fraud/report/64a1b2c3d4e5f6789abc1234/status \
  -H "Content-Type: application/json" \
  -d '{
    "status": "reviewed",
    "reviewedBy": "admin_john",
    "notes": "Confirmed phishing attempt. User contacted via phone."
  }'

Response:
{
  "success": true,
  "message": "Report 64a1b2c3d4e5f6789abc1234 updated to reviewed"
}
```

**Step 3: Verify Update**

```bash
curl http://localhost:3000/admin/fraud/report/64a1b2c3d4e5f6789abc1234

Response:
{
  "_id": "64a1b2c3d4e5f6789abc1234",
  "status": "reviewed",
  "reviewedBy": "admin_john",
  "reviewedAt": "2026-01-28T11:00:00Z",
  "notes": "Confirmed phishing attempt. User contacted via phone.",
  ...
}
```

---

### Test Case 14: Clear Compromised Flag

**Scenario:** User's issue resolved, clear flag

**Step 1: Check Status**

```bash
curl http://localhost:3000/admin/fraud/user/+919876543210

Response:
{
  "phoneNumber": "+919876543210",
  "compromised": true,
  "compromisedStatus": {
    "flaggedAt": "2026-01-28T10:40:00Z",
    "riskLevel": "CRITICAL",
    "status": "active"
  },
  "reportCount": 2
}
```

**Step 2: Clear Flag**

```bash
curl -X POST http://localhost:3000/admin/fraud/user/+919876543210/clear

Response:
{
  "success": true,
  "message": "Compromised flag cleared for +919876543210"
}
```

**Step 3: Verify Cleared**

```bash
curl http://localhost:3000/admin/fraud/user/+919876543210

Response:
{
  "phoneNumber": "+919876543210",
  "compromised": false,
  "compromisedStatus": null,
  "reportCount": 2  // Reports still exist for audit
}
```

---

### Test Case 15: Multiple Patterns in One Message

**Input Message:**

```
"Card: 1234 5678 9012 3456, OTP: 123456, Link: http://phish.com"
```

**Expected Behavior:**

- ✅ All patterns detected: Card + OTP + Link
- ✅ Risk level: `CRITICAL` (highest match)
- ✅ Evidence: `{ otp: "****56", card: "**************56", clickedLink: true, linkCount: 1 }`
- ✅ User marked compromised
- ✅ Agent switch to riskAgent
- ✅ AI generation BLOCKED
- ✅ Admin alert for CRITICAL

---

## 📊 Validation Checklist

### Fraud Detection

- [ ] OTP pattern detected (4-6 digits)
- [ ] Card pattern detected (16 digits)
- [ ] Link pattern detected (http/https)
- [ ] Risk level calculated correctly
- [ ] Data masked in storage (last 2 digits)
- [ ] Fraud reports created in MongoDB
- [ ] Compromised flags set in Redis

### Agent Routing

- [ ] Session stickiness maintained
- [ ] Load balancing on new users
- [ ] Agent switch on CRITICAL/HIGH fraud
- [ ] Production mode disables hackerAgent
- [ ] Compromised users forced to riskAgent

### Redis Operations

- [ ] Session keys created/read correctly
- [ ] Deduplication prevents duplicates
- [ ] Session windows track 24h TTL
- [ ] Compromised flags expire after 30 days
- [ ] Agent load counters accurate

### MongoDB Operations

- [ ] Fraud reports inserted successfully
- [ ] Indexes created (phoneNumber, status, riskLevel)
- [ ] Reports queryable by filters
- [ ] Status updates work correctly
- [ ] Statistics aggregated properly

### Admin API

- [ ] GET /admin/fraud/reports works
- [ ] Filtering by status works
- [ ] Filtering by riskLevel works
- [ ] PUT /admin/fraud/report/:id/status updates
- [ ] POST /admin/fraud/user/:phone/clear removes flag
- [ ] GET /admin/fraud/stats returns counts
- [ ] GET /admin/fraud/compromised lists flagged users

### Production Safety

- [ ] hackerAgent disabled in production
- [ ] Sensitive data never logged
- [ ] All data masked in storage
- [ ] Environment check works
- [ ] Graceful fallback on errors

---

## 🔧 Testing Commands

### Start Server

```bash
npm start
```

### Send Test Messages via Webhook (Postman/cURL)

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "+919876543210",
            "text": { "body": "My OTP is 123456" },
            "id": "wamid.test123"
          }]
        }
      }]
    }]
  }'
```

### Check Fraud Reports

```bash
curl http://localhost:3000/admin/fraud/reports
```

### Check User Status

```bash
curl http://localhost:3000/admin/fraud/user/+919876543210
```

### View Statistics

```bash
curl http://localhost:3000/admin/fraud/stats
```

### Check Redis Keys

```bash
redis-cli -h redis-12455.c264.ap-south-1-1.ec2.cloud.redislabs.com \
          -p 12455 \
          -a zJmL7flZpYD27SUnMuo74klcp5mFjBhe \
          KEYS "*"
```

---

## 🎯 Expected Results Summary

| Test Case   | Risk Level | Agent Switch  | AI Blocked | Flag User |
| ----------- | ---------- | ------------- | ---------- | --------- |
| OTP only    | MEDIUM     | No            | No         | Yes       |
| Card only   | MEDIUM     | No            | No         | Yes       |
| Link only   | LOW        | No            | No         | No        |
| Card + OTP  | CRITICAL   | Yes (to risk) | Yes        | Yes       |
| OTP + Link  | HIGH       | Yes (to risk) | Yes        | Yes       |
| Card + Link | HIGH       | Yes (to risk) | Yes        | Yes       |

---

**All test cases documented for QA validation!** ✅
