import express from 'express';
import dotenv from 'dotenv';
import morgan from 'morgan';

import userRoutes from './routes/userRoutes.js';
import chequeoRoutes from './routes/chequeosRoutes.js';
import danRoutes from './routes/danRoutes.js';
import realtimeRoutes from './routes/realtimeRoutes.js';
import didRoutes from './routes/didRoutes.js';
import ttsRoutes from './routes/ttsRoutes.js';

import { connectToDatabase } from './config/mongo.js';
import { authMiddleware } from './middleware/authMiddleware.js';

import { runPendingTextFlushes } from './services/textMemoryScheduler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI;

app.use(express.json({ limit: '20mb' }));
app.use(morgan('dev'));

/**
 * ✅ CORS robusto (NO wildcard con credenciales)
 *
 * Env recomendado:
 * - CORS_ORIGINS="http://localhost:8081,https://tu-frontend.com"
 * - CORS_ALLOW_CREDENTIALS="true"
 */
function parseAllowedOrigins() {
  const raw = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '').trim();
  if (!raw) return []; // si no seteas nada, no permitimos cross-origin (más seguro)
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const ALLOWED_ORIGINS = parseAllowedOrigins();
const ALLOW_CREDENTIALS = String(process.env.CORS_ALLOW_CREDENTIALS || 'true').toLowerCase() === 'true';

app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Si no viene Origin (curl/postman/server-to-server), seguimos normal
  if (!origin) return next();

  let allowOrigin = null;

  // Permitir explícitamente si está en la allowlist
  if (ALLOWED_ORIGINS.length > 0) {
    if (ALLOWED_ORIGINS.includes(origin)) allowOrigin = origin;
  } else {
    // Si no configuraste allowlist, por compatibilidad permitimos el origin actual SOLO en dev local
    if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      allowOrigin = origin;
    }
  }

  if (allowOrigin) {
    res.header('Access-Control-Allow-Origin', allowOrigin);
    res.header('Vary', 'Origin'); // importante para caches/CDNs

    if (ALLOW_CREDENTIALS) {
      res.header('Access-Control-Allow-Credentials', 'true');
    }

    // Headers permitidos
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );

    // Métodos permitidos
    res.header(
      'Access-Control-Allow-Methods',
      'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS'
    );
  }

  // Preflight
  if (req.method === 'OPTIONS') {
    // Si no está permitido, devolvemos 403 (así ves el problema rápido)
    if (!allowOrigin) return res.sendStatus(403);
    return res.sendStatus(204);
  }

  return next();
});

// Auth global (con whitelist en authMiddleware)
app.use(authMiddleware);

// raíz simple (queda pública por authMiddleware whitelist)
app.get('/', (req, res) => {
  res.type('text/plain').send('ok');
});

// health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/users', userRoutes);
app.use('/api/chequeos', chequeoRoutes);
app.use('/api/dan', danRoutes);
app.use('/api/realtime', realtimeRoutes);
app.use('/api/did', didRoutes);
app.use('/api/tts', ttsRoutes);

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ message: 'Unexpected error', details: err.message });
});

async function bootstrap() {
  await connectToDatabase(MONGODB_URI);

  // ✅ Reconciler inicial
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
    console.log('[reconciler] pending flushes:', result);
  } catch (e) {
    console.error('[reconciler] error on boot:', e);
  }

  // ✅ Reconciler periódico
  const intervalMs = parseInt(process.env.DAN_TEXT_RECONCILER_INTERVAL_MS || '60000', 10);
  if (intervalMs > 0) {
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
        if (result.ran > 0) {
          console.log('[reconciler] ran:', result);
        }
      } catch (e) {
        console.error('[reconciler] periodic error:', e);
      }
    }, intervalMs);
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
