import express from 'express';
import dotenv from 'dotenv';
import morgan from 'morgan';
import userRoutes from './routes/userRoutes.js';
import chequeoRoutes from './routes/chequeosRoutes.js';
import danRoutes from './routes/danRoutes.js';
import realtimeRoutes from './routes/realtimeRoutes.js';
import { connectToDatabase } from './config/mongo.js';
import { authMiddleware } from './middleware/authMiddleware.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI;

app.use(express.json());
app.use(morgan('dev'));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(authMiddleware);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/users', userRoutes);
app.use('/api/chequeos', chequeoRoutes);
app.use('/api/dan', danRoutes);
app.use('/api/realtime', realtimeRoutes);

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
