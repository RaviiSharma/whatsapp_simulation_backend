# MongoDB Migration Summary

## ✅ Successfully Migrated from Redis to MongoDB

### Changes Made:

1. **Created `config/mongodb.js`**
   - MongoDB client with automatic reconnection
   - In-memory fallback when MongoDB unavailable
   - Optimized with indexes for performance
   - TTL indexes for automatic message deduplication cleanup

2. **Updated `services/sessionStore.service.js`**
   - Replaced all Redis calls with MongoDB operations
   - Uses MongoDB collections instead of Redis keys
   - Maintains same API interface (no breaking changes)

3. **Updated `utils/deduplication.js`**
   - Message deduplication now uses MongoDB with TTL indexes
   - Automatic cleanup after 24 hours
   - Same functionality as before

4. **Updated `routes/admin.routes.js`**
   - Admin endpoints now report MongoDB status
   - Health checks show MongoDB connection state

5. **Updated `server.js`**
   - Initializes MongoDB instead of Redis
   - Graceful shutdown closes MongoDB connection

6. **Updated `package.json`**
   - Replaced `redis` package with `mongodb`
   - Version: mongodb@^6.3.0

7. **Updated `.env.example`**
   - New MongoDB configuration variables:
     - `MONGODB_URI` (default: mongodb://localhost:27017)
     - `MONGODB_DB` (default: whatsapp_ai)

---

## 📊 MongoDB Collections

### 1. `sessions` Collection

Stores user-agent assignments (permanent)

```javascript
{
  _id: ObjectId,
  userId: "1234567890",  // Indexed (unique)
  data: {
    agentName: "hackerAgent",
    assignedAt: "2026-01-23T...",
    lastMessageAt: "2026-01-23T...",
    messageCount: 5,
    isNewUser: false
  },
  updatedAt: Date
}
```

### 2. `message_dedup` Collection

Message ID deduplication (24h TTL)

```javascript
{
  _id: ObjectId,
  messageId: "wamid.ABC123",  // Indexed (unique)
  processedAt: Date,
  expiresAt: Date  // TTL index - auto-deletes after 24h
}
```

### 3. `agent_loads` Collection

Agent load counters

```javascript
{
  _id: ObjectId,
  agentName: "hackerAgent",  // Indexed (unique)
  count: 42,
  updatedAt: Date
}
```

---

## 🚀 Running the System

### 1. Start MongoDB

**Option A: Local MongoDB**

```bash
# Ubuntu/WSL
sudo systemctl start mongodb
# or
mongod --dbpath /path/to/data
```

**Option B: Docker**

```bash
docker run -d -p 27017:27017 --name mongodb mongo:7
```

**Option C: MongoDB Atlas (Cloud)**

- Free tier available at https://www.mongodb.com/atlas
- Update `MONGODB_URI` in `.env`

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env
```

```env
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=whatsapp_ai
```

### 3. Start Server

```bash
cd project
npm run dev
```

### 4. Verify

```bash
# Health check
curl http://localhost:3000/admin/health

# Expected output:
{
  "status": "ok",
  "mongodb": "connected",
  "totalUsers": 0
}
```

---

## ⚙️ MongoDB Connection States

### Connected

```
✅ MongoDB connected
📊 Database: whatsapp_ai
📊 Storage: MongoDB
```

### Fallback (MongoDB unavailable)

```
⚠️ MongoDB initialization failed, using in-memory store
📊 Storage: In-Memory (fallback)
```

**System continues to work with in-memory storage if MongoDB is unavailable.**

---

## 🔍 Testing

### Test User Session

```bash
# Create test session by sending webhook
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d @test-webhook.json

# Check MongoDB
mongo whatsapp_ai
> db.sessions.find().pretty()

# Or via admin API
curl http://localhost:3000/admin/user/1234567890
```

### Test Deduplication

```bash
# Send same message twice
curl -X POST http://localhost:3000/webhook -d @test-webhook.json
curl -X POST http://localhost:3000/webhook -d @test-webhook.json

# Second one should be skipped (check logs)
# Verify in MongoDB
> db.message_dedup.find().pretty()
```

### Check Agent Loads

```bash
curl http://localhost:3000/admin/agents

# Expected:
{
  "availableAgents": ["hackerAgent", "benignAgent", "policyAgent", "riskAgent"],
  "loads": {
    "hackerAgent": 1
  }
}
```

---

## 📈 Performance

### MongoDB Advantages over Redis:

- ✅ Rich queries (filter, aggregate)
- ✅ TTL indexes (automatic cleanup)
- ✅ Document-based (flexible schema)
- ✅ Widely available (cloud, local, docker)
- ✅ No special setup needed

### Indexes Created:

- `sessions.userId` - Unique index for fast lookups
- `message_dedup.messageId` - Unique index
- `message_dedup.expiresAt` - TTL index (auto-delete after 24h)
- `agent_loads.agentName` - Unique index

---

## 🛠️ MongoDB Administration

### View Collections

```bash
mongo whatsapp_ai

> show collections
agent_loads
message_dedup
sessions

> db.sessions.count()
> db.message_dedup.count()
> db.agent_loads.find()
```

### Clear All Data (Testing)

```bash
> db.sessions.deleteMany({})
> db.message_dedup.deleteMany({})
> db.agent_loads.deleteMany({})
```

### Backup

```bash
mongodump --db=whatsapp_ai --out=/backup/path
```

### Restore

```bash
mongorestore --db=whatsapp_ai /backup/path/whatsapp_ai
```

---

## 🎯 Migration Benefits

1. **No Redis dependency** - One less service to manage
2. **Richer data model** - Documents instead of key-value
3. **Better queries** - Can aggregate, filter, sort
4. **Automatic cleanup** - TTL indexes handle expiration
5. **Cloud-ready** - MongoDB Atlas free tier available
6. **Same reliability** - In-memory fallback still works

---

## ✅ System Status

**Current Status:** ✅ Running successfully with MongoDB

```
🚀 Initializing WhatsApp AI Webhook System...
✅ MongoDB connected
📊 Database: whatsapp_ai
✅ Server running on port 3000
📊 Storage: MongoDB
🎯 Agents: hackerAgent, benignAgent, policyAgent, riskAgent

🔗 Webhook endpoint: POST http://localhost:3000/webhook
```

---

## 🔄 Rollback (if needed)

If you need to go back to Redis:

1. `npm install redis@^4.6.0`
2. Restore backup files from git
3. Update `.env` with Redis config
4. Restart server

But MongoDB is working perfectly, so no need! 🎉
