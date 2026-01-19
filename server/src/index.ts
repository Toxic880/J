/**
 * JARVIS Server - Minimal Backend
 * 
 * SIMPLIFIED: Only handles what the frontend CAN'T do directly:
 * - OAuth token exchange (Spotify, Google) - needs server-side secrets
 * - TTS proxy (ElevenLabs API key server-side)
 * - Home Assistant proxy (optional)
 * - Authentication (for future multi-user)
 * 
 * The BRAIN lives in the frontend (JarvisCore + Tools.ts + LM Studio)
 * This server is just a helper for OAuth and secure API proxying.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import { logger } from './services/logger';
import { initDatabase } from './db/init';
import { authRouter } from './routes/auth';
import { ttsRouter } from './routes/tts';
import { homeAssistantRouter } from './routes/homeAssistant';
import { oauthRouter } from './routes/oauth';
import { healthRouter } from './routes/health';
import { uiRouter } from './routes/ui';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// =============================================================================
// SECURITY MIDDLEWARE
// =============================================================================

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.http(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// =============================================================================
// ROUTES (Minimal set)
// =============================================================================

// Health check (no auth required)
app.use('/api/v1/health', healthRouter);

// Authentication (for setup/login)
app.use('/api/v1/auth', authRouter);

// OAuth token exchange (Spotify, Google - needs server secrets)
app.use('/api/v1/oauth', oauthRouter);

// TTS proxy (ElevenLabs API key stays server-side)
app.use('/api/v1/tts', ttsRouter);

// Home Assistant proxy (optional)
app.use('/api/v1/home-assistant', homeAssistantRouter);

// UI state (minimal)
app.use('/api/v1/ui', uiRouter);

// =============================================================================
// ERROR HANDLING
// =============================================================================

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error', { error: err.message, path: req.path });
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;
  res.status(500).json({ error: message });
});

// =============================================================================
// STARTUP
// =============================================================================

async function start() {
  try {
    // Initialize database (for OAuth tokens, user settings)
    await initDatabase();
    logger.info('Database initialized');

    // Start server
    app.listen(PORT, () => {
      logger.info(`🚀 JARVIS Server running on port ${PORT}`);
      logger.info(`   Mode: Minimal (OAuth + TTS proxy)`);
      logger.info(`   The brain is in the frontend, this is just a helper.`);
    });

  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason });
  process.exit(1);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  process.exit(0);
});

start();

export { app };
