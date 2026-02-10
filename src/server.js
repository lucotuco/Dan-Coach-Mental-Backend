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

// CORS básico
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
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

  // ✅ Reconciler inicial (por si se reinició el server y quedaron flush pendientes)
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

  // ✅ Reconciler periódico (opcional, recomendado)
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
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
