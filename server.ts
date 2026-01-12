/**
 * Finance Tracker Backend API Server
 * Provides webhook endpoint for triggering transaction syncs
 */

import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { runCron } from './cron-service';

// Load .env file if it exists (local development)
// In Docker, environment variables are injected by docker-compose
config({ path: '.env' });

const app = express();
const PORT = process.env.PORT || 3003;
const API_SECRET = process.env.API_SECRET || 'your-secret-key-here';

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json());

// Authentication middleware
const authenticateRequest = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.substring(7);

  if (token !== API_SECRET) {
    return res.status(403).json({ error: 'Forbidden: Invalid API secret' });
  }

  next();
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'finance-tracker-backend',
    timestamp: new Date().toISOString(),
  });
});

// Webhook endpoint to trigger cron manually
app.post('/api/trigger-sync', authenticateRequest, async (req, res) => {
  console.log('📨 Manual sync triggered via API');

  try {
    const result = await runCron();

    res.json({
      success: result.success,
      message: result.success ? 'Sync completed successfully' : 'Sync failed',
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error during manual sync:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: (error as Error).message,
    });
  }
});

// Webhook endpoint to notify frontend cache to refresh
app.post('/api/notify-update', authenticateRequest, async (req, res) => {
  const { userId, transactionCount } = req.body;

  console.log(`📢 Update notification - User: ${userId}, Transactions: ${transactionCount}`);

  // This endpoint is called by cron service after processing
  // Frontend can poll this or use WebSockets in future
  res.json({
    success: true,
    message: 'Notification received',
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Finance Tracker Backend API`);
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log(`🔐 API Secret: ${API_SECRET.substring(0, 10)}...`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'Not configured'}`);
  console.log(`✅ Ready to accept requests\n`);
});

export default app;
