// src/routes/realtimeRoutes.js
import { Router } from 'express';
import {
  getRealtimeClientSecret,
  saveRealtimeSessionSummary,
  getRealtimeSessions,
  getRealtimeCheckups,
} from '../controllers/realtimeController.js';

const router = Router();

// GET /api/realtime/client-secret?mode=text|audio
router.get('/client-secret', getRealtimeClientSecret);

// GET /api/realtime/sessions
router.get('/sessions', getRealtimeSessions);

// ✅ GET /api/realtime/checkups
router.get('/checkups', getRealtimeCheckups);

// POST /api/realtime/sessions
router.post('/sessions', saveRealtimeSessionSummary);

export default router;
