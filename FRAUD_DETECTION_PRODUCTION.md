# Production-Grade Fraud Detection Architecture

## Critical Fix Applied

**Bug**: System detected fraud but still generated hackerAgent replies  
**Root Cause**: MEDIUM risk bypassed the blocking logic  
**Fix**: Added early return for ALL fraud detection (MEDIUM/HIGH/CRITICAL) + explicit hackerAgent blocking

---

## Corrected Processing Flow

```
MESSAGE RECEIVED
    ↓
[1] Deduplication (Redis) ✓
    ↓
[2] Session Lookup (Redis) ✓
    ↓
[3] Already Compromised Check ✓
    ├─ YES + hackerAgent → STOP & SWITCH
    └─ NO → Continue
    ↓
[4] FRAUD DETECTION ◄───── CRITICAL GATE
    ├─ Sensitive Data Found?
    │   ├─ YES → Mark Compromised (Redis)
    │   │       → Save Report (MongoDB)
    │   │       → Switch Agent
    │   │       → Send Alert
    │   │       → RETURN EARLY ✓✓✓
    │   └─ NO → Continue
    ↓
[5] Generate AI Reply (only if no fraud)
    ↓
[6] Send Reply
```

---

## Risk Scoring System

| Evidence         | Points | Risk Level | Action             |
| ---------------- | ------ | ---------- | ------------------ |
| Card + OTP/CVV   | 90-100 | CRITICAL   | Block + Switch     |
| Card OR OTP+Link | 60-70  | HIGH       | Block + Switch     |
| Card OR OTP      | 40-50  | MEDIUM     | Block + Switch     |
| Link only        | 20     | LOW        | Warning (continue) |

---

## MongoDB Schema (Production)

```json
{
  "caseId": "FRAUD-2026-001234",
  "phoneNumberHash": "sha256(...)",
  "phoneNumberLast4": "1737",
  "eventType": ["otp_shared"],
  "eventCategory": "credential_theft",
  "riskScore": 40,
  "riskLevel": "MEDIUM",
  "compromised": true,
  "maskedEvidence": {
    "otp": "**45",
    "card": "****6789",
    "cvv": "***",
    "link": null,
    "password": "****"
  },
  "detectedAgent": "hackerAgent",
  "agentSwitched": true,
  "previousAgent": "hackerAgent",
  "newAgent": "riskAgent",
  "escalationStatus": "pending",
  "actionsTaken": [
    {
      "action": "switch_agent",
      "from": "hackerAgent",
      "to": "riskAgent",
      "timestamp": "2026-01-28T10:15:31Z"
    }
  ],
  "complianceFlags": {
    "gdprApplies": true,
    "dataRetentionDays": 90
  },
  "auditLog": [...],
  "status": "active"
}
```

---

## Security Best Practices

### Data Masking

```javascript
// ✅ CORRECT
maskedEvidence: {
  otp: "**45",        // Last 2 digits only
  card: "****6789",   // Last 4 digits only
  cvv: "***",         // Never store
  password: "****"    // Never store
}
```

### PII Hashing

```javascript
const crypto = require("crypto");

function hashPII(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
```

### Production Safety

```javascript
if (isProduction() && agentName === "hackerAgent") {
  agentName = "benignAgent";
}
```

---

## Critical Rules

### ✅ DO

1. Detect fraud BEFORE AI reply
2. Return early after fraud detection
3. Mask all sensitive data
4. Hash phone numbers
5. Block hackerAgent for compromised users
6. Disable hackerAgent in production

### ❌ DON'T

1. Never generate AI reply after fraud
2. Never store full OTP/card/CVV
3. Never allow hackerAgent for compromised users
4. Never skip fraud detection

---

## Testing

### Test Case: OTP Shared

```bash
# Input
User: "my otp is 12345"

# Expected Output
✅ Fraud detected: MEDIUM
✅ User marked as compromised
✅ Switched hackerAgent → riskAgent
✅ Safety message sent
✅ NO hackerAgent reply generated
```

---

**Status**: Production Ready  
**Version**: 2.0.0
