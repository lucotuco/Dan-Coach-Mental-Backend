// server.js
import express from 'express';
import dotenv from 'dotenv';
import morgan from 'morgan';
import crypto from 'crypto';

import userRoutes from './routes/userRoutes.js';
import chequeoRoutes from './routes/chequeosRoutes.js';
import danRoutes from './routes/danRoutes.js';
import realtimeRoutes from './routes/realtimeRoutes.js';
import didRoutes from './routes/didRoutes.js';
import ttsRoutes from './routes/ttsRoutes.js';

import { connectToDatabase } from './config/mongo.js';
import { authMiddleware } from './middleware/authMiddleware.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI;

// Proxy (Render / reverse proxy)
app.set('trust proxy', 1);

// Evitar 304 por ETag en endpoints JSON (te estaba pasando en /api/realtime/sessions)
app.set('etag', false);

// Body limit: importante si subís audio en base64
app.use(express.json({ limit: process.env.JSON_LIMIT || '15mb' }));

app.use(morgan('dev'));

// --- DEBUG HTTP (opcional) ---
const DEBUG_HTTP = process.env.DEBUG_HTTP === '1';
if (DEBUG_HTTP) {
  app.use((req, res, next) => {
    req.reqId = crypto.randomUUID().slice(0, 8);
    const start = Date.now();

    console.log(
      `[HTTP ${req.reqId}] -> ${req.method} ${req.originalUrl} origin=${req.headers.origin || ''} host=${req.get('host') || ''} xfProto=${req.headers['x-forwarded-proto'] || ''} ua=${req.headers['user-agent'] || ''}`
    );

    res.on('finish', () => {
      const ms = Date.now() - start;
      console.log(
        `[HTTP ${req.reqId}] <- ${res.statusCode} ${req.method} ${req.originalUrl} ${ms}ms ct=${String(res.getHeader('content-type') || '')}`
      );
    });

    next();
  });
}

// --- CORS + preflight ---
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// --- Auth global (con whitelist en middleware) ---
app.use(authMiddleware);

// --- Health ---
app.get('/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Routes ---
app.use('/api/users', userRoutes);
app.use('/api/chequeos', chequeoRoutes);
app.use('/api/dan', danRoutes);
app.use('/api/realtime', realtimeRoutes);
app.use('/api/did', didRoutes);
app.use('/api/tts', ttsRoutes);

// --- Error handler ---
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ message: 'Unexpected error', details: err.message });
});

async function bootstrap() {
  await connectToDatabase(MONGODB_URI);
  app.listen(PORT, () => {
    console.log(`🚀 API listening on http://localhost:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
