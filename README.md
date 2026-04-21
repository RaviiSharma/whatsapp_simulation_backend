# WhatsApp AI Multi-Agent System

A production-grade WhatsApp Business API integration with intelligent multi-agent AI system, fraud detection, campaign management, and proactive messaging capabilities.

## 🚀 Features

### Core Functionality

- **Multi-Agent AI System**: Dynamic agent routing with support for multiple specialized agents (hacker, benign, policy, risk)
- **Fraud Detection**: Real-time fraud detection with confidence scoring and risk-based response
- **Campaign Management**: Comprehensive campaign creation, user assignment, and conversation tracking
- **Proactive Messaging**: AI-initiated conversations with scheduled delivery
- **Session Management**: MongoDB-based persistent session storage with chat history
- **Message Queuing**: BullMQ-powered asynchronous message processing
- **Webhook Handling**: WhatsApp Business API webhook integration

### Advanced Features

- **Context-Aware Fraud Detection**: Multi-pattern detection with confidence scoring (LOW/MEDIUM/HIGH risk levels)
- **Automatic Agent Switching**: Dynamic agent routing based on fraud risk and conversation context
- **Deduplication**: Redis-based message deduplication to prevent double processing
- **Session Windows**: 24-hour session window management per WhatsApp Business API
- **Assignment Queue**: Bulk user assignment with queue-based processing
- **Chat History Tracking**: Complete conversation history with aggregation pipelines

## 📋 Prerequisites

- **Node.js** >= 16.0.0
- **MongoDB** (local or cloud instance)
- **Redis** (for caching, queuing, and fraud tracking)
- **WhatsApp Business API** account with valid credentials

## 🛠️ Installation

### 1. Clone the repository

```bash
git clone https://github.com/RaviiSharma/whatsapp_simulation_backend.git
cd whatsapp_simulation
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Server
PORT=3000
NODE_ENV=development

# WhatsApp Business API
WHATSAPP_TOKEN=your_whatsapp_business_api_token
PHONE_NUMBER_ID=your_phone_number_id
VERIFY_TOKEN=your_webhook_verify_token

# AI Service
AI_SERVICE_URL=http://localhost:4000

# MongoDB
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=whatsapp_ai

# Redis
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_USERNAME=default
REDIS_PASSWORD=your-redis-password
```

### 4. Set up MongoDB indexes

```bash
node scripts/setup-production-indexes.js
```

## 🚦 Running the Application

### Development mode (with auto-reload)

```bash
npm run dev
```

### Production mode

```bash
npm start
```

The server will start on `http://localhost:3000` (or your configured PORT).

## 📚 API Endpoints

### Webhook Endpoints

- `GET /webhook` - WhatsApp webhook verification
- `POST /webhook` - WhatsApp message webhook handler

### Admin Endpoints

- `GET /admin/stats` - System statistics and metrics
- `GET /admin/users` - List all users with session data
- `GET /admin/user/:userId` - Get specific user details
- `POST /admin/user/:userId/reset` - Reset user session
- `GET /admin/redis/status` - Redis connection status

### Campaign Endpoints

- `POST /api/campaign` - Create new campaign
- `GET /api/campaign/:campaignId` - Get campaign details
- `GET /api/campaign/:campaignId/users` - Get campaign users with conversation data
- `POST /api/campaign/:campaignId/assign` - Assign users to campaign
- `GET /api/campaign/:campaignId/stats` - Campaign statistics

### Proactive Messaging Endpoints

- `POST /proactive/send` - Send proactive message to user
- `POST /proactive/schedule` - Schedule proactive message
- `GET /proactive/pending` - Get pending proactive messages

### User Endpoints

- `GET /api/user/:userId/history` - Get user chat history
- `GET /api/user/:userId/conversations` - Get user conversations

## 🏗️ Project Structure

```
whatsapp_simulation/
├── project/
│   └── src/
│       ├── app.js                 # Express app configuration
│       ├── server.js              # Server entry point
│       ├── config/                # Configuration files
│       │   ├── env.js             # Environment variables
│       │   ├── mongodb.js         # MongoDB connection
│       │   ├── redis.js           # Redis connection
│       │   └── indexes.js         # Database indexes
│       ├── controllers/           # Request handlers
│       │   └── webhook.controller.js
│       ├── models/                # Data models
│       │   ├── message.model.js
│       │   └── fraudReport.model.js
│       ├── routes/                # API routes
│       │   ├── webhook.routes.js
│       │   ├── admin.routes.js
│       │   ├── campaign.routes.js
│       │   └── proactive.routes.js
│       ├── services/              # Business logic
│       │   ├── ai.service.js              # AI integration
│       │   ├── fraud.service.PRODUCTION.js # Fraud detection
│       │   ├── campaign.service.js        # Campaign management
│       │   ├── proactiveMessaging.service.js
│       │   ├── sessionStore.service.js    # Session management
│       │   ├── whatsapp.service.js        # WhatsApp API
│       │   ├── agentRouter.service.js     # Agent routing
│       │   ├── aiReply.worker.js          # Background AI worker
│       │   ├── campaign.worker.js         # Campaign worker
│       │   └── proactive.worker.js        # Proactive worker
│       └── utils/                 # Utility functions
│           ├── deduplication.js
│           ├── messageParser.js
│           └── security.js
├── scripts/                       # Utility scripts
│   ├── setup-production-indexes.js
│   ├── test-campaign.js
│   └── clear-test-data.js
└── package.json
```

## 🔐 Fraud Detection System

The fraud detection system uses a confidence-based scoring approach with three risk levels:

### Risk Levels

- **LOW** (0 - 0.39): Continue normal conversation
- **MEDIUM** (0.4 - 0.69): Switch to risk assessment agent
- **HIGH** (0.7+): Block user and notify admin

### Detection Patterns

- OTP/Code sharing
- Credit card numbers
- CVV/CVC codes
- Bank account numbers
- PIN numbers
- Password sharing
- Phishing URLs

### Context-Aware Detection

The system analyzes conversation context to reduce false positives. Some patterns require contextual keywords to trigger detection.

## 🤖 Agent System

### Available Agents

- **benignAgent**: Handles normal customer conversations
- **hackerAgent**: Simulates security testing scenarios
- **riskAgent**: Handles potentially risky conversations
- **policyAgent**: Enforces policies and guidelines

### Agent Switching

Agents automatically switch based on:

- Fraud detection risk levels
- User behavior patterns
- Conversation context
- Admin overrides

## 📊 Campaign Management

### Features

- Create campaigns with custom agents
- Bulk user assignment via queue processing
- Track conversation status per user
- Monitor message counts and engagement
- Filter by status and agent
- Aggregated statistics

### Campaign Workflow

1. Create campaign with agent configuration
2. Assign users (processed via queue)
3. Send proactive messages
4. Track conversations and responses
5. Monitor statistics and performance

## 🧪 Testing

### Utility Scripts

```bash
# Test webhook functionality
node test-webhook.js

# Test AI fraud detection
node test-ai-fraud-server.js

# Test campaign creation
node scripts/test-campaign.js

# Check BullMQ queue status
node check-queue-status.js

# Clear test data
node scripts/clear-test-data.js

# Reset specific user
node reset-test-user.js <userId>
```

## 🔧 Maintenance Scripts

### Database Management

```bash
# Setup MongoDB indexes
node scripts/setup-production-indexes.js

# Check campaign database
node scripts/check-campaign-db.js
```

### Redis Management

```bash
# Inspect Redis data
node inspect-redis.js

# Clear Redis cache
node clear-redis.js

# Clear compromised user flags
node clear-compromised-flags.js
```

## 🐛 Debugging

### Check Queue Status

```bash
node check-queue-status.js
```

### Monitor Logs

The application uses Morgan for HTTP logging and custom logging service for application events.

### Common Issues

1. **Redis Connection Failed**: Check Redis credentials and network connectivity
2. **MongoDB Connection Failed**: Verify MongoDB URI and database permissions
3. **WhatsApp API Errors**: Validate token and phone number ID
4. **Queue Processing Stuck**: Check BullMQ worker status and Redis connection

## 📦 Dependencies

### Core Dependencies

- **express**: Web framework
- **mongodb**: Database driver
- **redis**: Caching and session store
- **bullmq**: Queue processing
- **axios**: HTTP client
- **dotenv**: Environment configuration
- **morgan**: HTTP request logger

### Development Dependencies

- **nodemon**: Auto-reload during development

## 🔒 Security Considerations

- Store sensitive credentials in environment variables
- Use HTTPS in production
- Validate webhook signatures from WhatsApp
- Implement rate limiting on public endpoints
- Regularly update dependencies
- Monitor fraud detection alerts
- Rotate API tokens periodically

## 📝 Environment Variables

| Variable          | Description                          | Required                   |
| ----------------- | ------------------------------------ | -------------------------- |
| `PORT`            | Server port                          | No (default: 3000)         |
| `NODE_ENV`        | Environment (development/production) | No                         |
| `WHATSAPP_TOKEN`  | WhatsApp Business API token          | Yes                        |
| `PHONE_NUMBER_ID` | WhatsApp phone number ID             | Yes                        |
| `VERIFY_TOKEN`    | Webhook verification token           | Yes                        |
| `AI_SERVICE_URL`  | AI service endpoint                  | Yes                        |
| `MONGODB_URI`     | MongoDB connection string            | No (fallback to in-memory) |
| `MONGODB_DB`      | MongoDB database name                | No                         |
| `REDIS_HOST`      | Redis host                           | Yes                        |
| `REDIS_PORT`      | Redis port                           | Yes                        |
| `REDIS_USERNAME`  | Redis username                       | No                         |
| `REDIS_PASSWORD`  | Redis password                       | Yes                        |

## 🚀 Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure production MongoDB instance
- [ ] Configure production Redis instance
- [ ] Set up proper logging
- [ ] Configure monitoring and alerting
- [ ] Set up database backups
- [ ] Enable HTTPS
- [ ] Configure firewall rules
- [ ] Set up process manager (PM2, systemd)
- [ ] Configure auto-scaling if needed

### Example PM2 Configuration

```bash
pm2 start project/src/server.js --name whatsapp-ai -i max
pm2 save
pm2 startup
```

## 📄 License

[Add your license here]

## 🤝 Contributing

[Add contribution guidelines here]

## 📧 Support

[Add support contact information here]

## 🔄 Version History

### v2.0.0

- Multi-agent AI system
- Production-grade fraud detection
- Campaign management with bulk assignment
- Proactive messaging with scheduling
- MongoDB session persistence
- BullMQ queue processing

---

**Note**: This is a simulation/testing environment. Ensure proper testing before deploying to production with real users.
