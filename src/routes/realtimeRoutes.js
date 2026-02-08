// src/routes/realtimeRoutes.js
import { Router } from 'express';
import {
  getRealtimeClientSecret,
  postTopicShiftCheck,
  postRealtimeSessionEnd,
  saveRealtimeSessionSummary,
  getRealtimeSessions,
  getRealtimeCheckups,
} from '../controllers/realtimeController.js';

const router = Router();

// GET /api/realtime/client-secret
router.get('/client-secret', getRealtimeClientSecret);

// POST /api/realtime/topic-shift
router.post('/topic-shift', postTopicShiftCheck);

// POST /api/realtime/session-end (pipeline completo)
router.post('/session-end', postRealtimeSessionEnd);

// Compat tool vieja (si todavía la llamás)
router.post('/sessions', saveRealtimeSessionSummary);

// GET /api/realtime/sessions
router.get('/sessions', getRealtimeSessions);

// GET /api/realtime/checkups
router.get('/checkups', getRealtimeCheckups);

export default router;
