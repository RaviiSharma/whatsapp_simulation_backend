# Testing Redis & MongoDB Integration - Step-by-Step Guide

## 🚀 Prerequisites

1. **Start the server:**

```bash
cd d:/whatsapp_simulation
npm start
```

2. **Check server is running:**

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "status": "ok",
  "uptime": 123,
  "timestamp": "2026-01-28T..."
}
```

---

## ✅ Step 1: Verify Redis & MongoDB Connections

### Check System Health

```bash
curl http://localhost:3000/admin/health
```

**Expected Response:**

```json
{
  "status": "ok",
  "timestamp": "2026-01-28T12:00:00.000Z",
  "uptime": 45.123,
  "mongodb": "connected",      ← Should be "connected"
  "redis": "connected",         ← Should be "connected"
  "totalUsers": 0,
  "memory": {
    "used": "50MB",
    "total": "100MB"
  }
}
```

### Check Detailed Stats

```bash
curl http://localhost:3000/admin/stats
```

**Expected Response:**

```json
{
  "status": "ok",
  "timestamp": "2026-01-28T...",
  "routing": {
    "totalUsers": 0,
    "agentDistribution": {}
  },
  "fraud": {
    "total": 0,
    "byStatus": {},
    "byRiskLevel": {},
    "last24Hours": 0
  },
  "storage": {
    "mongodb": {
      "mongodb": true,         ← Redis working
      "fallback": false
    },
    "redis": {
      "redis": true,           ← MongoDB working
      "fallback": false
    }
  }
}
```

✅ **If you see `"mongodb": true` and `"redis": true`, both are connected!**

❌ **If you see `"fallback": true`, the service is using in-memory fallback**

---

## 🧪 Step 2: Test Complete Fraud Detection Flow

### Test Case 1: Send Message with OTP (MEDIUM Risk)

**Send WhatsApp message via webhook:**

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": {
            "display_phone_number": "15551234567",
            "phone_number_id": "PHONE_NUMBER_ID"
          },
          "contacts": [{
            "profile": {
              "name": "Test User"
            },
            "wa_id": "919876543210"
          }],
          "messages": [{
            "from": "919876543210",
            "id": "wamid.test_otp_001",
            "timestamp": "1643100000",
            "text": {
              "body": "My OTP is 123456"
            },
            "type": "text"
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

**Expected Response:**

```json
{
  "status": "ok"
}
```

---

## 🔍 Step 3: Verify Data in Redis

### Check Redis Directly (if you have redis-cli)

```bash
# Connect to Redis
redis-cli -h redis-12455.c264.ap-south-1-1.ec2.cloud.redislabs.com \
          -p 12455 \
          -a zJmL7flZpYD27SUnMuo74klcp5mFjBhe

# Check all keys
KEYS *

# Expected output:
# 1) "session:919876543210"
# 2) "dedup:wamid.test_otp_001"
# 3) "window:919876543210"
# 4) "compromised:919876543210"
# 5) "agent_load:benignAgent"

# Check specific keys:
GET "session:919876543210"
# Should return: {"agentName":"benignAgent","assignedAt":"...","lastMessageAt":"...","messageCount":1}

GET "compromised:919876543210"
# Should return: {"flaggedAt":"...","riskLevel":"MEDIUM","status":"active"}

GET "window:919876543210"
# Should return: {"lastMessageAt":"..."}

GET "dedup:wamid.test_otp_001"
# Should return: {"processedAt":"..."}

# Check TTL (time to live)
TTL "dedup:wamid.test_otp_001"
# Should return: ~86400 (24 hours in seconds)

TTL "compromised:919876543210"
# Should return: ~2592000 (30 days in seconds)
```

### Check via Admin API (No redis-cli needed)

**Check session windows:**

```bash
curl http://localhost:3000/admin/windows
```

**Expected Response:**

```json
{
  "count": 1,
  "windows": [
    {
      "phoneNumber": "919876543210",
      "active": true,
      "lastMessageAt": "2026-01-28T12:00:00Z",
      "expiresAt": "2026-01-29T12:00:00Z",
      "requiresTemplate": false
    }
  ]
}
```

**Check compromised users:**

```bash
curl http://localhost:3000/admin/fraud/compromised
```

**Expected Response:**

```json
{
  "count": 1,
  "users": [
    {
      "phoneNumber": "919876543210",
      "flaggedAt": "2026-01-28T12:00:00Z",
      "riskLevel": "MEDIUM",
      "status": "active"
    }
  ]
}
```

**Check user session:**

```bash
curl http://localhost:3000/admin/user/919876543210
```

**Expected Response:**

```json
{
  "userId": "919876543210",
  "session": {
    "agentName": "benignAgent",
    "assignedAt": "2026-01-28T12:00:00Z",
    "lastMessageAt": "2026-01-28T12:00:00Z",
    "messageCount": 1,
    "isNewUser": true
  }
}
```

✅ **If you get valid responses, Redis is working!**

---

## 🗄️ Step 4: Verify Data in MongoDB

### Check via Admin API

**Check fraud reports:**

```bash
curl http://localhost:3000/admin/fraud/reports
```

**Expected Response:**

```json
{
  "count": 1,
  "reports": [
    {
      "_id": "65b1234567890abcdef12345",
      "phoneNumber": "919876543210",
      "agent": "benignAgent",
      "riskLevel": "MEDIUM",
      "evidence": {
        "otp": "****56",
        "card": null,
        "clickedLink": false,
        "linkCount": 0
      },
      "conversationSnippet": ["My OTP is 123456"],
      "metadata": {
        "detectedAt": "2026-01-28T12:00:00Z",
        "messageId": "wamid.test_otp_001"
      },
      "status": "new",
      "reviewedAt": null,
      "reviewedBy": null,
      "notes": null,
      "createdAt": "2026-01-28T12:00:00Z",
      "updatedAt": "2026-01-28T12:00:00Z"
    }
  ]
}
```

**Check fraud statistics:**

```bash
curl http://localhost:3000/admin/fraud/stats
```

**Expected Response:**

```json
{
  "total": 1,
  "byStatus": {
    "new": 1
  },
  "byRiskLevel": {
    "MEDIUM": 1
  },
  "last24Hours": 1,
  "timestamp": "2026-01-28T12:00:00Z"
}
```

**Check user's fraud reports:**

```bash
curl http://localhost:3000/admin/fraud/user/919876543210
```

**Expected Response:**

```json
{
  "phoneNumber": "919876543210",
  "compromised": true,
  "compromisedStatus": {
    "flaggedAt": "2026-01-28T12:00:00Z",
    "riskLevel": "MEDIUM",
    "status": "active"
  },
  "reportCount": 1,
  "reports": [
    {
      "_id": "65b1234567890abcdef12345",
      "phoneNumber": "919876543210",
      "riskLevel": "MEDIUM",
      ...
    }
  ]
}
```

✅ **If you get fraud reports with data, MongoDB is working!**

---

## 🔥 Step 5: Test CRITICAL Risk (Full Flow Test)

### Send message with Card + OTP

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": {
            "display_phone_number": "15551234567",
            "phone_number_id": "PHONE_NUMBER_ID"
          },
          "contacts": [{
            "profile": {
              "name": "Test User 2"
            },
            "wa_id": "919999999999"
          }],
          "messages": [{
            "from": "919999999999",
            "id": "wamid.test_critical_001",
            "timestamp": "1643100000",
            "text": {
              "body": "Card: 1234 5678 9012 3456, OTP: 654321"
            },
            "type": "text"
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

### Verify CRITICAL fraud report created

```bash
curl http://localhost:3000/admin/fraud/reports?riskLevel=CRITICAL
```

**Expected Response:**

```json
{
  "count": 1,
  "reports": [
    {
      "_id": "...",
      "phoneNumber": "919999999999",
      "agent": "benignAgent",
      "riskLevel": "CRITICAL",
      "evidence": {
        "otp": "****21",
        "card": "**************56",
        "clickedLink": false,
        "linkCount": 0
      },
      "conversationSnippet": [
        "Card: 1234 5678 9012 3456, OTP: 654321"
      ],
      "status": "new",
      ...
    }
  ]
}
```

### Verify user is compromised in Redis

```bash
curl http://localhost:3000/admin/fraud/compromised
```

**Expected Response:**

```json
{
  "count": 2,
  "users": [
    {
      "phoneNumber": "919876543210",
      "riskLevel": "MEDIUM",
      ...
    },
    {
      "phoneNumber": "919999999999",
      "riskLevel": "CRITICAL",
      "status": "active",
      ...
    }
  ]
}
```

✅ **If you see both users in compromised list, Redis + MongoDB integration is working!**

---

## 📊 Step 6: Test Agent Load Balancing (Redis)

### Send messages from multiple users

```bash
# User 1
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "911111111111",
            "id": "wamid.user1_msg1",
            "text": { "body": "Hello" },
            "type": "text"
          }]
        }
      }]
    }]
  }'

# User 2
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "912222222222",
            "id": "wamid.user2_msg1",
            "text": { "body": "Hi there" },
            "type": "text"
          }]
        }
      }]
    }]
  }'

# User 3
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "913333333333",
            "id": "wamid.user3_msg1",
            "text": { "body": "Good morning" },
            "type": "text"
          }]
        }
      }]
    }]
  }'
```

### Check agent distribution

```bash
curl http://localhost:3000/admin/agents
```

**Expected Response:**

```json
{
  "availableAgents": ["hackerAgent", "benignAgent", "policyAgent", "riskAgent"],
  "loads": {
    "hackerAgent": 1,
    "benignAgent": 2,
    "policyAgent": 1,
    "riskAgent": 1
  }
}
```

✅ **If agent loads are distributed, Redis agent_load counters are working!**

---

## 🔄 Step 7: Test Deduplication (Redis)

### Send same message twice

```bash
# First time
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "914444444444",
            "id": "wamid.duplicate_test",
            "text": { "body": "Test message" },
            "type": "text"
          }]
        }
      }]
    }]
  }'

# Wait 2 seconds, then send again with SAME message ID
sleep 2

curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "914444444444",
            "id": "wamid.duplicate_test",
            "text": { "body": "Test message" },
            "type": "text"
          }]
        }
      }]
    }]
  }'
```

### Check server logs

**Expected in console:**

```
🔄 Processing message from 914444444444: "Test message"
✅ Message processed successfully

⏭️ Skipping duplicate message: wamid.duplicate_test
```

✅ **If second message is skipped, Redis deduplication is working!**

---

## 🕐 Step 8: Test Session Window (Redis TTL)

### Check window status

```bash
curl http://localhost:3000/admin/windows/919876543210
```

**Expected Response:**

```json
{
  "phoneNumber": "919876543210",
  "active": true,
  "lastMessageAt": "2026-01-28T12:00:00Z",
  "expiresAt": "2026-01-29T12:00:00Z",
  "requiresTemplate": false
}
```

### Manually close window

```bash
curl -X DELETE http://localhost:3000/admin/windows/919876543210
```

**Expected Response:**

```json
{
  "success": true,
  "message": "Session window closed for 919876543210"
}
```

### Verify window is closed

```bash
curl http://localhost:3000/admin/windows/919876543210
```

**Expected Response:**

```json
{
  "phoneNumber": "919876543210",
  "active": false,
  "lastMessageAt": null,
  "expiresAt": null,
  "requiresTemplate": true
}
```

✅ **If window status changes, Redis TTL and window tracking is working!**

---

## 🧹 Step 9: Test Admin Operations

### Update fraud report status (MongoDB)

```bash
# First, get a report ID
curl http://localhost:3000/admin/fraud/reports | grep "_id"

# Use the ID to update status
curl -X PUT http://localhost:3000/admin/fraud/report/65b1234567890abcdef12345/status \
  -H "Content-Type: application/json" \
  -d '{
    "status": "reviewed",
    "reviewedBy": "admin_test",
    "notes": "Testing MongoDB update"
  }'
```

**Expected Response:**

```json
{
  "success": true,
  "message": "Report 65b1234567890abcdef12345 updated to reviewed"
}
```

### Verify update

```bash
curl http://localhost:3000/admin/fraud/report/65b1234567890abcdef12345
```

**Expected Response:**

```json
{
  "_id": "65b1234567890abcdef12345",
  "status": "reviewed",
  "reviewedBy": "admin_test",
  "reviewedAt": "2026-01-28T12:05:00Z",
  "notes": "Testing MongoDB update",
  ...
}
```

✅ **If status updated, MongoDB write operations are working!**

### Clear compromised flag (Redis)

```bash
curl -X POST http://localhost:3000/admin/fraud/user/919876543210/clear
```

**Expected Response:**

```json
{
  "success": true,
  "message": "Compromised flag cleared for 919876543210"
}
```

### Verify flag cleared

```bash
curl http://localhost:3000/admin/fraud/user/919876543210
```

**Expected Response:**

```json
{
  "phoneNumber": "919876543210",
  "compromised": false,
  "compromisedStatus": null,
  "reportCount": 1
}
```

✅ **If flag cleared, Redis delete operations are working!**

---

## ✅ Final Verification Checklist

Run this comprehensive check:

```bash
# 1. Health check
echo "=== Health Check ==="
curl -s http://localhost:3000/admin/health | grep -E "redis|mongodb"

# 2. Fraud stats
echo -e "\n=== Fraud Stats ==="
curl -s http://localhost:3000/admin/fraud/stats | grep -E "total|MEDIUM|CRITICAL"

# 3. Compromised users
echo -e "\n=== Compromised Users ==="
curl -s http://localhost:3000/admin/fraud/compromised | grep "count"

# 4. Active windows
echo -e "\n=== Active Windows ==="
curl -s http://localhost:3000/admin/windows | grep "count"

# 5. Agent distribution
echo -e "\n=== Agent Distribution ==="
curl -s http://localhost:3000/admin/agents | grep -E "hackerAgent|benignAgent"
```

**Expected Output:**

```
=== Health Check ===
"mongodb": "connected",
"redis": "connected",

=== Fraud Stats ===
"total": 2,
"MEDIUM": 1,
"CRITICAL": 1,

=== Compromised Users ===
"count": 1,

=== Active Windows ===
"count": 3,

=== Agent Distribution ===
"hackerAgent": 1,
"benignAgent": 2,
```

---

## 🚨 Troubleshooting

### If Redis shows "fallback: true"

**Check:**

1. Redis credentials in `.env`:

   ```
   REDIS_HOST=redis-12455.c264.ap-south-1-1.ec2.cloud.redislabs.com
   REDIS_PORT=12455
   REDIS_USERNAME=default
   REDIS_PASSWORD=zJmL7flZpYD27SUnMuo74klcp5mFjBhe
   ```

2. Server logs for Redis errors:

   ```
   Look for: "❌ Redis Client Error" or "🔴 Redis error"
   ```

3. Test Redis connection manually:

   ```bash
   redis-cli -h redis-12455.c264.ap-south-1-1.ec2.cloud.redislabs.com \
             -p 12455 \
             -a zJmL7flZpYD27SUnMuo74klcp5mFjBhe \
             PING

   # Should return: PONG
   ```

### If MongoDB shows "fallback: true"

**Check:**

1. MongoDB URI in `.env`:

   ```
   MONGODB_URI=mongodb://localhost:27017
   MONGODB_DB=whatsapp_ai
   ```

2. MongoDB is running:

   ```bash
   # If local MongoDB
   mongosh mongodb://localhost:27017
   ```

3. Server logs for MongoDB errors:
   ```
   Look for: "❌ MongoDB initialization failed"
   ```

### If fraud reports not created

**Check:**

1. Message format is correct (see cURL examples above)
2. Server logs for fraud detection:
   ```
   Look for: "🚨 FRAUD DETECTED" or "📄 Fraud report created"
   ```
3. Pattern matching working:
   ```
   OTP must be 4-6 digits: "123456" ✅, "12345678" ❌
   Card must be 16 digits: "1234567890123456" ✅
   ```

---

## 📝 Quick Test Script

Save this as `test_fraud_system.sh`:

```bash
#!/bin/bash

BASE_URL="http://localhost:3000"

echo "🧪 Testing WhatsApp AI Fraud Detection System"
echo "=============================================="

# 1. Health check
echo -e "\n1️⃣ Testing Health..."
curl -s $BASE_URL/admin/health | grep -q "connected" && echo "✅ System healthy" || echo "❌ System unhealthy"

# 2. Send test message with OTP
echo -e "\n2️⃣ Sending test message with OTP..."
curl -s -X POST $BASE_URL/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "915555555555",
            "id": "wamid.test_'$(date +%s)'",
            "text": { "body": "My verification code is 654321" },
            "type": "text"
          }]
        }
      }]
    }]
  }' > /dev/null && echo "✅ Message sent"

# Wait for processing
sleep 2

# 3. Check fraud report created
echo -e "\n3️⃣ Checking fraud reports..."
REPORT_COUNT=$(curl -s $BASE_URL/admin/fraud/reports | grep -o '"count":[0-9]*' | grep -o '[0-9]*')
echo "📊 Total fraud reports: $REPORT_COUNT"

# 4. Check compromised users
echo -e "\n4️⃣ Checking compromised users..."
COMPROMISED_COUNT=$(curl -s $BASE_URL/admin/fraud/compromised | grep -o '"count":[0-9]*' | grep -o '[0-9]*')
echo "🚨 Compromised users: $COMPROMISED_COUNT"

# 5. Check Redis (windows)
echo -e "\n5️⃣ Checking Redis session windows..."
WINDOW_COUNT=$(curl -s $BASE_URL/admin/windows | grep -o '"count":[0-9]*' | grep -o '[0-9]*')
echo "🕐 Active windows: $WINDOW_COUNT"

echo -e "\n=============================================="
echo "✅ Test completed!"
```

Run it:

```bash
chmod +x test_fraud_system.sh
./test_fraud_system.sh
```

---

## 🎯 Success Criteria

Your Redis + MongoDB integration is working correctly if:

✅ Health endpoint shows `"mongodb": "connected"` and `"redis": "connected"`  
✅ Fraud reports appear in `/admin/fraud/reports`  
✅ Compromised users appear in `/admin/fraud/compromised`  
✅ Session windows appear in `/admin/windows`  
✅ Agent loads update in `/admin/agents`  
✅ Duplicate messages are skipped (check logs)  
✅ Fraud report status can be updated  
✅ Compromised flags can be cleared

**If all checkmarks pass, your system is production-ready!** 🚀
