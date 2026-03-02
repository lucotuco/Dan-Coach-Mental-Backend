import express from 'express';
import dotenv from 'dotenv';
import morgan from 'morgan';

import userRoutes from './routes/userRoutes.js';
import checkinRoutes from './routes/checkinRoutes.js';
import plansRoutes from './routes/planRoutes.js'
//import danRoutes from './routes/danRoutes.js';
//import realtimeRoutes from './routes/realtimeRoutes.js';
//import didRoutes from './routes/didRoutes.js';
//import ttsRoutes from './routes/ttsRoutes.js';
import authRoutes from './routes/authRoutes.js'
import teamRoutes from './routes/teamRoutes.js'

import { connectToDatabase } from './config/mongo.js';
import { authMiddleware } from './middleware/authMiddleware.js';

import { runPendingTextFlushes } from './services/textMemoryScheduler.js';
import { runPendingRealtimeFinalizations } from './services/realtimeReconciler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI;

app.use(express.json({ limit: '20mb' }));
app.use(morgan('dev'));

/**
 * ✅ CORS robusto (NO wildcard con credenciales)
 */
function parseAllowedOrigins() {
  const raw = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const ALLOWED_ORIGINS = parseAllowedOrigins();
const ALLOW_CREDENTIALS = String(process.env.CORS_ALLOW_CREDENTIALS || 'true').toLowerCase() === 'true';

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin) return next();

  let allowOrigin = null;

  if (ALLOWED_ORIGINS.length > 0) {
    if (ALLOWED_ORIGINS.includes(origin)) allowOrigin = origin;
  } else {
    if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      allowOrigin = origin;
    }
  }

  if (allowOrigin) {
    res.header('Access-Control-Allow-Origin', allowOrigin);
    res.header('Vary', 'Origin');

    if (ALLOW_CREDENTIALS) {
      res.header('Access-Control-Allow-Credentials', 'true');
    }

    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
  }

  if (req.method === 'OPTIONS') {
    if (!allowOrigin) return res.sendStatus(403);
    return res.sendStatus(204);
  }

  return next();
});

// Auth global (con whitelist dentro de authMiddleware)
app.use(authMiddleware);

app.get('/', (req, res) => {
  res.type('text/plain').send('ok');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.use('/api/teams', teamRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/checkins', checkinRoutes);
app.use('/api/plans', plansRoutes);
//app.use('/api/dan', danRoutes);
//app.use('/api/realtime', realtimeRoutes);
//app.use('/api/did', didRoutes);
//app.use('/api/tts', ttsRoutes);

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ message: 'Unexpected error', details: err.message });
});

async function bootstrap() {
  await connectToDatabase(MONGODB_URI);

  // -------- TEXT reconciler (ya lo tenías) --------
  try {
    const idleMs = parseInt(process.env.DAN_TEXT_IDLE_FLUSH_MS || '90000', 10);
    const batchUserTurns = parseInt(process.env.DAN_TEXT_SUMMARY_EVERY_N_TURNS || '6', 10);
    const minUserTurns = parseInt(process.env.DAN_TEXT_IDLE_MIN_USER_TURNS || '2', 10);

    const result = await runPendingTextFlushes({
      idleMs,
      batchUserTurns,
      minUserTurns,
      limit: parseInt(process.env.DAN_TEXT_RECONCILER_LIMIT || '25', 10),
    });
    console.log('[TEXT reconciler] boot:', result);
  } catch (e) {
    console.error('[TEXT reconciler] boot error:', e);
  }

  const textIntervalMs = parseInt(process.env.DAN_TEXT_RECONCILER_INTERVAL_MS || '60000', 10);
  if (textIntervalMs > 0) {
    setInterval(async () => {
      try {
        const idleMs = parseInt(process.env.DAN_TEXT_IDLE_FLUSH_MS || '90000', 10);
        const batchUserTurns = parseInt(process.env.DAN_TEXT_SUMMARY_EVERY_N_TURNS || '6', 10);
        const minUserTurns = parseInt(process.env.DAN_TEXT_IDLE_MIN_USER_TURNS || '2', 10);

        const result = await runPendingTextFlushes({
          idleMs,
          batchUserTurns,
          minUserTurns,
          limit: parseInt(process.env.DAN_TEXT_RECONCILER_LIMIT || '25', 10),
        });
        if (result.ran > 0) console.log('[TEXT reconciler] ran:', result);
      } catch (e) {
        console.error('[TEXT reconciler] periodic error:', e);
      }
    }, textIntervalMs);
  }

  // -------- REALTIME reconciler (NUEVO) --------
  try {
    const idleMs = parseInt(process.env.DAN_REALTIME_IDLE_FINALIZE_MS || '90000', 10);
    const limit = parseInt(process.env.DAN_REALTIME_RECONCILER_LIMIT || '25', 10);
    const forceLongTerm = String(process.env.DAN_REALTIME_RECONCILER_FORCE_LONGTERM || 'false').toLowerCase() === 'true';

    const result = await runPendingRealtimeFinalizations({ idleMs, limit, forceLongTerm });
    console.log('[REALTIME reconciler] boot:', result);
  } catch (e) {
    console.error('[REALTIME reconciler] boot error:', e);
  }

  const rtIntervalMs = parseInt(process.env.DAN_REALTIME_RECONCILER_INTERVAL_MS || '60000', 10);
  if (rtIntervalMs > 0) {
    setInterval(async () => {
      try {
        const idleMs = parseInt(process.env.DAN_REALTIME_IDLE_FINALIZE_MS || '90000', 10);
        const limit = parseInt(process.env.DAN_REALTIME_RECONCILER_LIMIT || '25', 10);
        const forceLongTerm = String(process.env.DAN_REALTIME_RECONCILER_FORCE_LONGTERM || 'false').toLowerCase() === 'true';

        const result = await runPendingRealtimeFinalizations({ idleMs, limit, forceLongTerm });
        if (result.finalized > 0 || result.errors > 0) {
          console.log('[REALTIME reconciler] tick:', result);
        }
      } catch (e) {
        console.error('[REALTIME reconciler] periodic error:', e);
      }
    }, rtIntervalMs);
  }

  app.listen(PORT, () => {
    console.log(`🚀 API listening on http://localhost:${PORT}`);
    console.log('[CORS] allowed origins:', ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : '(dev-local only)');
    console.log('[CORS] allow credentials:', ALLOW_CREDENTIALS);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
