# Complete API Endpoints - cURL Commands for Postman

Base URL: `http://localhost:3000`

---

## 🏥 **Health Check**

### Check System Health

```bash
curl --location 'http://localhost:3000/health'
```

---

## 📊 **Admin Endpoints**

### 1. Get System Stats

```bash
curl --location 'http://localhost:3000/admin/stats'
```

### 2. Get Agent Loads

```bash
curl --location 'http://localhost:3000/admin/agents'
```

### 3. Get User Session Info

```bash
curl --location 'http://localhost:3000/admin/user/919102901737'
```

### 4. Reassign User to Different Agent

```bash
curl --location 'http://localhost:3000/admin/user/919102901737/reassign' \
--header 'Content-Type: application/json' \
--data '{
    "agentName": "hackerAgent"
}'
```

Available agents:

- `hackerAgent`
- `benignAgent`
- `policyAgent`
- `riskAgent`

### 5. Delete User Session (Testing Only)

```bash
curl --location --request DELETE 'http://localhost:3000/admin/user/919102901737'
```

---

## 🚀 **Proactive Messaging**

### 1. Start Single Proactive Conversation

```bash
curl --location 'http://localhost:3000/proactive/start' \
--header 'Content-Type: application/json' \
--data '{
    "phoneNumber": "919102901737",
    "preferredAgent": "hackerAgent",
    "templateParams": {
        "agentName": "Alex"
    }
}'
```

**Without preferred agent (auto-assigns):**

```bash
curl --location 'http://localhost:3000/proactive/start' \
--header 'Content-Type: application/json' \
--data '{
    "phoneNumber": "919102901737"
}'
```

### 2. Batch Proactive Messaging

```bash
curl --location 'http://localhost:3000/proactive/batch' \
--header 'Content-Type: application/json' \
--data '{
    "phoneNumbers": [
        "919102901737",
        "919102901738",
        "919102901739"
    ],
    "preferredAgent": "hackerAgent"
}'
```

### 3. Get Proactive Campaign Stats

```bash
curl --location 'http://localhost:3000/proactive/stats'
```

---

## 📥 **Webhook Endpoints** (Meta WhatsApp)

### 1. Webhook Verification (GET)

```bash
curl --location 'http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=mytoken123&hub.challenge=test123'
```

### 2. Receive Message (POST)

```bash
curl --location 'http://localhost:3000/webhook' \
--header 'Content-Type: application/json' \
--data '{
    "object": "whatsapp_business_account",
    "entry": [
        {
            "id": "123456789",
            "changes": [
                {
                    "value": {
                        "messaging_product": "whatsapp",
                        "metadata": {
                            "display_phone_number": "15550001234",
                            "phone_number_id": "845519308655302"
                        },
                        "contacts": [
                            {
                                "profile": {
                                    "name": "Test User"
                                },
                                "wa_id": "919102901737"
                            }
                        ],
                        "messages": [
                            {
                                "from": "919102901737",
                                "id": "wamid.test123",
                                "timestamp": "1735372800",
                                "text": {
                                    "body": "Hello, I need help"
                                },
                                "type": "text"
                            }
                        ]
                    },
                    "field": "messages"
                }
            ]
        }
    ]
}'
```

---

## 📝 **Testing Scenarios**

### Scenario 1: New User Flow

```bash
# 1. Check health
curl --location 'http://localhost:3000/health'

# 2. Send first message (webhook)
curl --location 'http://localhost:3000/webhook' \
--header 'Content-Type: application/json' \
--data '{
    "object": "whatsapp_business_account",
    "entry": [{
        "id": "123",
        "changes": [{
            "value": {
                "messages": [{
                    "from": "919999999999",
                    "id": "wamid.new001",
                    "text": { "body": "Hello" },
                    "type": "text"
                }]
            }
        }]
    }]
}'

# 3. Check user session
curl --location 'http://localhost:3000/admin/user/919999999999'

# 4. Check agent loads
curl --location 'http://localhost:3000/admin/agents'
```

### Scenario 2: Proactive Campaign

```bash
# 1. Start proactive conversation
curl --location 'http://localhost:3000/proactive/start' \
--header 'Content-Type: application/json' \
--data '{
    "phoneNumber": "918888888888",
    "preferredAgent": "hackerAgent"
}'

# 2. Check user was created
curl --location 'http://localhost:3000/admin/user/918888888888'

# 3. Simulate user reply
curl --location 'http://localhost:3000/webhook' \
--header 'Content-Type: application/json' \
--data '{
    "object": "whatsapp_business_account",
    "entry": [{
        "id": "123",
        "changes": [{
            "value": {
                "messages": [{
                    "from": "918888888888",
                    "id": "wamid.reply001",
                    "text": { "body": "Hi, who are you?" },
                    "type": "text"
                }]
            }
        }]
    }]
}'

# 4. Check stats
curl --location 'http://localhost:3000/proactive/stats'
```

### Scenario 3: Agent Switching

```bash
# 1. Create user with agent
curl --location 'http://localhost:3000/webhook' \
--header 'Content-Type: application/json' \
--data '{
    "object": "whatsapp_business_account",
    "entry": [{
        "changes": [{
            "value": {
                "messages": [{
                    "from": "917777777777",
                    "id": "wamid.switch001",
                    "text": { "body": "Test" },
                    "type": "text"
                }]
            }
        }]
    }]
}'

# 2. Check current agent
curl --location 'http://localhost:3000/admin/user/917777777777'

# 3. Switch to different agent
curl --location 'http://localhost:3000/admin/user/917777777777/reassign' \
--header 'Content-Type: application/json' \
--data '{
    "agentName": "riskAgent"
}'

# 4. Verify switch
curl --location 'http://localhost:3000/admin/user/917777777777'
```

### Scenario 4: Multi-User Concurrent

```bash
# Send 3 messages simultaneously (use & in bash or run in separate terminals)
curl --location 'http://localhost:3000/webhook' \
--header 'Content-Type: application/json' \
--data '{"object":"whatsapp_business_account","entry":[{"changes":[{"value":{"messages":[{"from":"911111111111","id":"wamid.user1","text":{"body":"Hi from user 1"},"type":"text"}]}}]}]}'

curl --location 'http://localhost:3000/webhook' \
--header 'Content-Type: application/json' \
--data '{"object":"whatsapp_business_account","entry":[{"changes":[{"value":{"messages":[{"from":"912222222222","id":"wamid.user2","text":{"body":"Hi from user 2"},"type":"text"}]}}]}]}'

curl --location 'http://localhost:3000/webhook' \
--header 'Content-Type: application/json' \
--data '{"object":"whatsapp_business_account","entry":[{"changes":[{"value":{"messages":[{"from":"913333333333","id":"wamid.user3","text":{"body":"Hi from user 3"},"type":"text"}]}}]}]}'

# Check all were assigned
curl --location 'http://localhost:3000/admin/agents'
```

---

## 🔧 **Configuration**

Current setup (from .env):

- **Port:** 3000
- **Verify Token:** mytoken123
- **Phone Number ID:** 845519308655302
- **AI Service:** http://localhost:4000/chat
- **MongoDB:** mongodb://localhost:27017
- **Template Name:** hello_world

---

## 📱 **Phone Number Format**

✅ **Correct:** `919102901737` (country code + number, no +, no spaces)
❌ **Wrong:** `+91 9102901737`, `+919102901737`, `9102901737`

---

## 🎯 **Import to Postman**

1. **Import as Collection:**
   - Open Postman
   - Click "Import"
   - Select "Raw text"
   - Paste the cURL commands
   - Click "Continue" → "Import"

2. **Create Environment:**
   - Create new environment "WhatsApp AI"
   - Add variables:
     - `BASE_URL` = `http://localhost:3000`
     - `TEST_PHONE` = `919102901737`

3. **Replace in cURLs:**
   - Change `http://localhost:3000` to `{{BASE_URL}}`
   - Change `919102901737` to `{{TEST_PHONE}}`
