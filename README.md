# Finance Tracker Backend Service

Self-hosted backend service for the Personal Finance Tracker application. This service handles:
- **Email Processing**: Fetches and parses HDFC Bank transaction emails
- **Google Sheets Sync**: Automatically updates user Google Sheets with new transactions
- **API Endpoints**: Provides webhook for manual syncs and cache invalidation
- **Automated Cron**: Runs every 5 minutes to process all active users

## Prerequisites

- Docker & Docker Compose installed
- Node.js 18+ (for local development)
- Cloudflared installed (for tunneling)

## Quick Setup

### 1. Clone & Configure

```bash
# Navigate to backend folder
cd FinanceTrackerBackend

# Copy environment file
cp .env.example .env

# Edit .env with your credentials
nano .env
```

### 2. Environment Variables

Configure these in `.env`:

```env
# From your Supabase dashboard
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# From Google Cloud Console
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx

# Must match your main app's encryption key
ENCRYPTION_SECRET_KEY=your-32-char-or-longer-secret

# Backend configuration
PORT=3003
API_SECRET=generate-a-secure-random-string
FRONTEND_URL=https://your-app.vercel.app
```

### 3. Docker Deployment

```bash
# Build and start services
docker-compose up -d

# View logs
docker-compose logs -f

# Check status
docker-compose ps

# Stop services
docker-compose down
```

### 4. Cloudflared Tunnel Setup

```bash
# Login to Cloudflare
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create finance-backend

# Create config file
nano ~/.cloudflared/config.yml
```

Add this configuration:

```yaml
tunnel: <your-tunnel-id>
credentials-file: /home/user/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: finance-api.yourdomain.com
    service: http://localhost:3003
  - service: http_status:404
```

```bash
# Run tunnel
cloudflared tunnel run finance-backend

# Or install as service
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

### 5. Update Vercel Project

Add this environment variable to your Vercel project:

```env
BACKEND_API_URL=https://finance-api.yourdomain.com
BACKEND_API_SECRET=your-api-secret-from-backend-env
```

## API Endpoints

### Health Check
```bash
GET /health
# Response: { status: "healthy", timestamp: "..." }
```

### Trigger Manual Sync
```bash
POST /api/trigger-sync
Authorization: Bearer YOUR_API_SECRET

# Response: { success: true, totalTransactions: 5, ... }
```

## Local Development

```bash
# Install dependencies
npm install

# Start API server
npm run dev

# Run cron service (in another terminal)
npm run cron
```

## Monitoring

```bash
# View real-time logs
docker-compose logs -f finance-backend

# Check health
curl http://localhost:3003/health

# Trigger manual sync
curl -X POST http://localhost:3003/api/trigger-sync \
  -H "Authorization: Bearer YOUR_API_SECRET"
```

## Troubleshooting

**Container won't start:**
- Check `.env` file exists and is complete
- Verify port 3003 isn't in use: `lsof -i :3003`

**Cron not processing:**
- Check Supabase credentials
- Verify users have `is_active = true`
- Check logs: `docker-compose logs -f`

**Google API errors:**
- Verify OAuth credentials
- Check token encryption key matches main app
- Ensure Google Sheets/Gmail APIs are enabled

## Architecture

```
┌─────────────────┐         ┌──────────────────┐
│  Vercel App     │ ◄────── │  User Browser    │
└────────┬────────┘         └──────────────────┘
         │
         │ (API calls)
         │
         ▼
┌─────────────────────────────────────────┐
│  Backend Server (localhost:3003)        │
│  ┌────────────┐    ┌─────────────┐     │
│  │ API Server │    │ Cron Service│     │
│  │  (Express) │    │  (5 min)    │     │
│  └────────────┘    └─────────────┘     │
└───────────┬─────────────────────────────┘
            │
            │ (Cloudflared Tunnel)
            │
            ▼
┌───────────────────────────────┐
│  https://finance-api.domain   │
└───────────────────────────────┘
```

## Security Notes

- Keep `API_SECRET` secure and different from encryption key
- Use HTTPS only (Cloudflared provides this)
- Regularly update dependencies: `npm update`
- Monitor logs for unauthorized access attempts
- Backup `.env` file securely

## Support

For issues, check:
1. Docker logs: `docker-compose logs`
2. Environment variables are set correctly
3. Cloudflare tunnel is active
4. Vercel app has correct `BACKEND_API_URL`
