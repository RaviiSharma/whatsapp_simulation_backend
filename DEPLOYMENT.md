# WhatsApp Multi-Agent AI System - Deployment Guide

## 📦 Installation

### 1. Install Dependencies

```bash
cd d:/whatsapp_simulation
npm install
```

This will install:

- `express` - Web server
- `axios` - HTTP client
- `redis` - Redis client (v4)
- `morgan` - Request logging
- `dotenv` - Environment variables

### 2. Setup Redis (Optional but Recommended)

#### Option A: Local Redis (Windows)

**Using WSL (Recommended):**

```bash
# In WSL terminal
sudo apt update
sudo apt install redis-server
sudo service redis-server start

# Test connection
redis-cli ping
# Should return: PONG
```

**Using Windows Redis Port:**

```bash
# Download from: https://github.com/microsoftarchive/redis/releases
# Run redis-server.exe
```

#### Option B: Docker

```bash
docker run -d -p 6379:6379 --name redis redis:7-alpine
```

#### Option C: Cloud Redis

- **Redis Cloud:** https://redis.com/cloud
- **AWS ElastiCache**
- **Azure Cache for Redis**

**If Redis is unavailable, the system will automatically use in-memory fallback.**

---

## 🔧 Configuration

### 1. Create .env file

```bash
cp .env.example .env
```

### 2. Edit .env

```env
PORT=3000
NODE_ENV=production

# WhatsApp Business API (from Meta Developer Portal)
WHATSAPP_TOKEN=EAAxxxxxxxxxxxxx
PHONE_NUMBER_ID=1234567890
VERIFY_TOKEN=my_secure_verify_token_123

# AI Service
AI_SERVICE_URL=http://localhost:4000

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

**Get WhatsApp credentials:**

1. Go to: https://developers.facebook.com
2. Create app → WhatsApp Business
3. Get Access Token & Phone Number ID
4. Set Verify Token (any random string)

---

## 🚀 Running the System

### Development Mode

```bash
cd project
npm run dev
```

This uses `nodemon` for auto-reload on file changes.

### Production Mode

```bash
cd project
npm start
```

---

## 🔗 Webhook Setup

### 1. Local Testing with ngrok

```bash
# Install ngrok
# Download from: https://ngrok.com

# Expose local server
ngrok http 3000
```

You'll get a URL like: `https://abc123.ngrok.io`

### 2. Configure Meta Webhook

1. Go to Meta Developer Console
2. WhatsApp → Configuration
3. Webhook URL: `https://abc123.ngrok.io/webhook`
4. Verify Token: (same as in .env)
5. Subscribe to: `messages`

### 3. Test Webhook

Meta will send GET request to verify:

```
GET https://your-domain.com/webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=1234
```

Your server should return the challenge value.

---

## 📊 Verify Installation

### 1. Check Server Status

```bash
# Health check
curl http://localhost:3000/health
```

**Expected:**

```json
{
  "status": "ok",
  "uptime": 10,
  "timestamp": "2026-01-23T10:30:00.000Z"
}
```

### 2. Check Admin Panel

```bash
# System stats
curl http://localhost:3000/admin/stats

# Agent status
curl http://localhost:3000/admin/agents
```

### 3. Check Redis Connection

Look for log message:

```
✅ Redis connected
🟢 Redis ready
```

If Redis unavailable:

```
⚠️ Redis initialization failed, using in-memory store
```

---

## 🧪 Test First Message Flow

### Simulate WhatsApp Message

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "1234567890",
            "id": "test_msg_001",
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

### Check Logs

You should see:

```
🔥 Webhook received from Meta
⚡ Webhook responded in 15ms
📨 Parsed message from 1234567890: "Hello"
✅ Message queued for processing
🆕 New user detected: 1234567890 → hackerAgent
📤 Sending intro message: "🔓 Hey there!..."
✅ Intro message sent to new user
🤖 Generating AI reply for 1234567890 using hackerAgent
📤 Message sent to 1234567890
✅ Message processed successfully in 2500ms
```

### Verify User Assignment

```bash
curl http://localhost:3000/admin/user/1234567890
```

**Expected:**

```json
{
  "userId": "1234567890",
  "session": {
    "agentName": "hackerAgent",
    "assignedAt": "2026-01-23T10:30:00.000Z",
    "lastMessageAt": "2026-01-23T10:30:05.000Z",
    "messageCount": 1,
    "isNewUser": false
  }
}
```

---

## 🔄 Production Deployment

### Option 1: Traditional Server

```bash
# Install Node.js on server
# Clone repository
git clone <your-repo>
cd whatsapp_simulation

# Install dependencies
npm install --production

# Setup PM2 (process manager)
npm install -g pm2

# Start with PM2
pm2 start project/src/server.js --name whatsapp-ai

# Save PM2 config
pm2 save

# Auto-start on reboot
pm2 startup
```

### Option 2: Docker

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["node", "project/src/server.js"]
```

```bash
# Build
docker build -t whatsapp-ai .

# Run
docker run -d -p 3000:3000 \
  --env-file .env \
  --name whatsapp-ai \
  whatsapp-ai
```

### Option 3: Cloud Platforms

**Heroku:**

```bash
heroku create whatsapp-ai-app
heroku addons:create heroku-redis:hobby-dev
git push heroku main
```

**Railway:**

```bash
railway login
railway init
railway up
```

**AWS EC2:**

- Launch Ubuntu instance
- Install Node.js
- Use PM2 for process management
- Configure security groups (port 3000)

---

## 🔒 Security Checklist

### Production Requirements

- [ ] Use HTTPS (not HTTP)
- [ ] Set strong `VERIFY_TOKEN`
- [ ] Rotate `WHATSAPP_TOKEN` regularly
- [ ] Use Redis password
- [ ] Rate limit webhook endpoint
- [ ] Validate webhook signature (implement X-Hub-Signature)
- [ ] Use environment variables (never commit .env)
- [ ] Implement CORS properly
- [ ] Use helmet.js for security headers
- [ ] Monitor for unusual patterns

---

## 📈 Monitoring Setup

### 1. Logging

**Add Winston:**

```bash
npm install winston
```

**Configure structured logging:**

```javascript
const winston = require("winston");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});
```

### 2. Metrics

**Add Prometheus:**

```bash
npm install prom-client
```

**Track:**

- Webhook response time
- Message processing duration
- Agent assignment distribution
- Error rates
- Redis connection status

### 3. Alerts

**Setup alerts for:**

- Webhook response > 1.5s
- Error rate > 5%
- Redis connection lost
- AI service unavailable
- High memory usage

---

## 🐛 Troubleshooting

### Redis Connection Failed

**Issue:** `❌ Redis connection refused`

**Solutions:**

1. Check Redis is running: `redis-cli ping`
2. Check host/port in .env
3. Check firewall rules
4. System will fallback to in-memory (check logs)

---

### AI Service Timeout

**Issue:** `⏱ AI service timeout`

**Solutions:**

1. Check AI service is running on port 4000
2. Increase timeout in ai.service.js
3. Check network connectivity
4. System will use fallback messages

---

### Webhook Not Responding

**Issue:** Meta retries webhook

**Checks:**

1. Server is running: `curl http://localhost:3000/health`
2. ngrok tunnel active
3. Webhook URL correct in Meta console
4. No crashes in logs

---

### Agent Not Sticky

**Issue:** User gets different agent on restart

**Solutions:**

1. Check Redis is connected (not fallback)
2. Redis persistence enabled
3. Check session retrieval logs

---

### Memory Leak

**Issue:** Memory usage keeps growing

**Checks:**

1. Redis deduplication keys expiring (24h TTL)
2. No infinite loops in message processing
3. Check for unclosed connections
4. Use `node --inspect` for profiling

---

## 📋 Maintenance

### Regular Tasks

**Daily:**

- Check error logs
- Monitor webhook response times
- Verify Redis connection

**Weekly:**

- Review agent load distribution
- Check deduplication stats
- Update dependencies

**Monthly:**

- Rotate access tokens
- Review security logs
- Backup Redis data
- Performance optimization

---

## 🆘 Support

### Debug Endpoints

```bash
# Health
GET /health

# Admin stats
GET /admin/stats

# Agent loads
GET /admin/agents

# User session
GET /admin/user/:userId

# Clear user (testing)
DELETE /admin/user/:userId
```

### Logs Location

- Development: Console output
- Production: Use PM2 logs or Docker logs

```bash
# PM2 logs
pm2 logs whatsapp-ai

# Docker logs
docker logs whatsapp-ai
```

---

## ✅ Post-Deployment Checklist

- [ ] Server running and accessible
- [ ] Redis connected or fallback working
- [ ] Webhook verified by Meta
- [ ] Test message flow works
- [ ] Admin endpoints accessible
- [ ] Logs being written
- [ ] Monitoring configured
- [ ] Backups scheduled
- [ ] Security measures active
- [ ] Documentation updated
