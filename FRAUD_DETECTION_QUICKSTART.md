# WhatsApp AI Fraud Detection - Quick Start Guide

## 🚀 Setup & Installation

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env

# 3. Update .env with your credentials
# - WhatsApp Cloud API credentials
# - MongoDB URI (optional, falls back to in-memory)
# - Redis credentials (provided in .env.example)
# - AI Service URL

# 4. Start the server
npm start
```

## 🔍 Fraud Detection Features

### Automatic Detection

The system automatically detects:

- **OTP codes**: 4-6 digit numbers (e.g., "123456")
- **Credit cards**: 16-digit card numbers (e.g., "1234 5678 9012 3456")
- **Phishing links**: HTTP/HTTPS URLs

### Risk Levels

| Level    | Triggers          | Action                                   |
| -------- | ----------------- | ---------------------------------------- |
| CRITICAL | Card + OTP        | Switch to riskAgent, block AI generation |
| HIGH     | (Card/OTP) + Link | Switch to riskAgent if on hackerAgent    |
| MEDIUM   | Card OR OTP alone | Send warning, continue monitoring        |
| LOW      | Link only         | Log only                                 |

### Data Security

✅ All sensitive data is **masked** before storage:

- OTP `123456` → stored as `****56`
- Card `1234567890123456` → stored as `**************56`

✅ Compromised users tracked in Redis (30-day expiry)

✅ Full audit trail in MongoDB fraud_reports collection

## 📊 Admin Dashboard

### View Fraud Reports

```bash
# Get all new fraud reports
GET http://localhost:3000/admin/fraud/reports

# Filter by status
GET http://localhost:3000/admin/fraud/reports?status=new
GET http://localhost:3000/admin/fraud/reports?status=reviewed

# Filter by risk level
GET http://localhost:3000/admin/fraud/reports?riskLevel=CRITICAL
GET http://localhost:3000/admin/fraud/reports?riskLevel=HIGH
```

### Review Fraud Report

```bash
# Update report status
PUT http://localhost:3000/admin/fraud/report/{reportId}/status
Content-Type: application/json

{
  "status": "reviewed",
  "reviewedBy": "admin_john",
  "notes": "Confirmed phishing attempt, user account secured"
}
```

Status options: `new`, `reviewed`, `escalated`, `resolved`

### Check User Status

```bash
# Get all fraud reports for a user
GET http://localhost:3000/admin/fraud/user/+919876543210

Response:
{
  "phoneNumber": "+919876543210",
  "compromised": true,
  "compromisedStatus": {
    "flaggedAt": "2026-01-28T10:30:45Z",
    "riskLevel": "CRITICAL",
    "status": "active"
  },
  "reportCount": 3,
  "reports": [...]
}
```

### Clear Compromised Flag

```bash
# After resolving the issue, clear the flag
POST http://localhost:3000/admin/fraud/user/+919876543210/clear

Response:
{
  "success": true,
  "message": "Compromised flag cleared for +919876543210"
}
```

### View Statistics

```bash
# Get fraud detection statistics
GET http://localhost:3000/admin/fraud/stats

Response:
{
  "total": 45,
  "byStatus": {
    "new": 12,
    "reviewed": 20,
    "escalated": 8,
    "resolved": 5
  },
  "byRiskLevel": {
    "LOW": 15,
    "MEDIUM": 18,
    "HIGH": 8,
    "CRITICAL": 4
  },
  "last24Hours": 7,
  "timestamp": "2026-01-28T12:00:00Z"
}
```

## 🔧 System Monitoring

### Health Check

```bash
GET http://localhost:3000/health

Response:
{
  "status": "ok",
  "uptime": 3600,
  "timestamp": "2026-01-28T12:00:00Z"
}
```

### Detailed System Stats

```bash
GET http://localhost:3000/admin/stats

Response:
{
  "status": "ok",
  "timestamp": "2026-01-28T12:00:00Z",
  "routing": {
    "totalUsers": 150,
    "agentDistribution": {
      "benignAgent": 80,
      "hackerAgent": 40,
      "policyAgent": 20,
      "riskAgent": 10
    }
  },
  "fraud": {
    "total": 45,
    "byStatus": {...},
    "byRiskLevel": {...}
  },
  "storage": {
    "mongodb": { "mongodb": true, "fallback": false },
    "redis": { "redis": true, "fallback": false }
  }
}
```

### View Compromised Users

```bash
GET http://localhost:3000/admin/fraud/compromised

Response:
{
  "count": 5,
  "users": [
    {
      "phoneNumber": "+919876543210",
      "flaggedAt": "2026-01-28T10:30:45Z",
      "riskLevel": "CRITICAL",
      "status": "active"
    },
    ...
  ]
}
```

## 📱 WhatsApp 24-Hour Window

### Check Session Window

```bash
# Check if user is within 24h messaging window
GET http://localhost:3000/admin/windows/+919876543210

Response:
{
  "phoneNumber": "+919876543210",
  "active": true,
  "lastMessageAt": "2026-01-28T10:30:45Z",
  "expiresAt": "2026-01-29T10:30:45Z",
  "requiresTemplate": false
}
```

### View All Active Windows

```bash
GET http://localhost:3000/admin/windows

Response:
{
  "count": 85,
  "windows": [
    {
      "phoneNumber": "+919876543210",
      "active": true,
      "lastMessageAt": "2026-01-28T10:30:45Z",
      "expiresAt": "2026-01-29T10:30:45Z"
    },
    ...
  ]
}
```

### Close Session Window (Force Template)

```bash
# Manually close window to require template messages
DELETE http://localhost:3000/admin/windows/+919876543210

Response:
{
  "success": true,
  "message": "Session window closed for +919876543210"
}
```

## 🛡️ Production vs Development Mode

### Development Mode (Default)

```bash
NODE_ENV=development
```

- ✅ All agents active (including hackerAgent)
- ✅ Full fraud detection
- ✅ Verbose logging

### Production Mode

```bash
NODE_ENV=production
```

- 🚫 **hackerAgent DISABLED** (automatically filtered out)
- ✅ Users forced to benignAgent
- ✅ Enhanced security checks
- ✅ Data masking enforced

## 🔍 Testing Fraud Detection

### Test OTP Detection (MEDIUM risk)

```
User message: "My OTP is 123456"
```

**Expected behavior:**

- Fraud report created with riskLevel: "MEDIUM"
- Evidence: `{ otp: "****56", card: null, clickedLink: false }`
- User receives warning message
- Conversation continues

### Test Card Detection (MEDIUM risk)

```
User message: "My card number is 1234 5678 9012 3456"
```

**Expected behavior:**

- Fraud report created with riskLevel: "MEDIUM"
- Evidence: `{ otp: null, card: "**************56", clickedLink: false }`
- User receives warning message
- Conversation continues

### Test CRITICAL Risk (Card + OTP)

```
User message: "Card: 1234 5678 9012 3456, OTP: 123456"
```

**Expected behavior:**

- Fraud report created with riskLevel: "CRITICAL"
- User marked as compromised in Redis
- If on hackerAgent → switched to riskAgent
- Security message sent
- AI generation blocked

### Test HIGH Risk (Card + Link)

```
User message: "Enter card 1234 5678 9012 3456 at http://phishing.site"
```

**Expected behavior:**

- Fraud report created with riskLevel: "HIGH"
- User marked as compromised
- If on hackerAgent → switched to riskAgent
- Security message sent
- AI generation blocked

## 🔑 Redis Keys Reference

```bash
# Session management
session:{phoneNumber}         # User's assigned agent

# Agent load balancing
agent_load:{agentName}        # Count of users per agent

# Message deduplication (24h TTL)
dedup:{messageId}             # Processed message IDs

# Session window tracking (24h TTL)
window:{phoneNumber}          # Last message timestamp

# Compromised users (30-day TTL)
compromised:{phoneNumber}     # Fraud flag status
```

View Redis keys:

```bash
redis-cli -h redis-12455.c264.ap-south-1-1.ec2.cloud.redislabs.com \
          -p 12455 \
          -a zJmL7flZpYD27SUnMuo74klcp5mFjBhe \
          KEYS "compromised:*"
```

## 📋 Common Tasks

### 1. Review New Fraud Reports

```bash
# Get all new reports
curl http://localhost:3000/admin/fraud/reports?status=new

# Review each report
curl -X PUT http://localhost:3000/admin/fraud/report/{id}/status \
  -H "Content-Type: application/json" \
  -d '{"status": "reviewed", "reviewedBy": "admin", "notes": "Legitimate OTP"}'
```

### 2. Handle Compromised User

```bash
# 1. Check user's reports
curl http://localhost:3000/admin/fraud/user/+919876543210

# 2. Contact user via secure channel
# 3. Resolve issue
# 4. Clear compromised flag
curl -X POST http://localhost:3000/admin/fraud/user/+919876543210/clear

# 5. Update fraud report
curl -X PUT http://localhost:3000/admin/fraud/report/{id}/status \
  -H "Content-Type: application/json" \
  -d '{"status": "resolved", "reviewedBy": "admin", "notes": "Issue resolved"}'
```

### 3. Monitor System Health

```bash
# Quick health check
curl http://localhost:3000/health

# Detailed stats
curl http://localhost:3000/admin/stats

# Fraud stats
curl http://localhost:3000/admin/fraud/stats
```

## 🚨 Alert Thresholds (Recommended)

Set up monitoring alerts for:

- **CRITICAL fraud reports** → Immediate notification
- **> 5 HIGH risk reports in 1 hour** → Alert admin
- **> 10 compromised users** → System review
- **Redis connection failure** → Emergency fallback mode
- **MongoDB connection failure** → Data persistence warning

## 📞 Support & Troubleshooting

### Fraud detection not working

1. Check Redis connection: `GET /admin/health`
2. Verify pattern matching in logs
3. Test with known patterns: "OTP: 123456"

### Reports not saving to MongoDB

1. Check MongoDB connection: `GET /admin/health`
2. Verify collection indexes initialized
3. Check error logs for insert failures

### Agent not switching on fraud

1. Verify production mode: `echo $NODE_ENV`
2. Check compromised user status
3. Review fraud classification logic in logs

## 🎯 Best Practices

1. **Review fraud reports daily** (especially CRITICAL/HIGH)
2. **Clear compromised flags** after resolution
3. **Monitor fraud statistics** for patterns
4. **Test fraud detection** regularly with known patterns
5. **Backup MongoDB** fraud_reports collection
6. **Rotate Redis password** every 90 days
7. **Enable alerts** for CRITICAL risk level
8. **Audit admin actions** (who cleared flags, when)

---

**System is ready for production use!** 🚀

For detailed architecture, see: [FRAUD_DETECTION_ARCHITECTURE.md](FRAUD_DETECTION_ARCHITECTURE.md)
