// src/routes/realtimeRoutes.js
import { Router } from 'express';
import {getRealtimeClientSecret,saveRealtimeSessionSummary,getRealtimeSessions} from '../controllers/realtimeController.js';

const router = Router();

// GET /api/realtime/client-secret
router.get('/client-secret', getRealtimeClientSecret);

router.get('/sessions', getRealtimeSessions)
// POST /api/realtime/sessions
// (la tool del agente llama acá para guardar el resumen)
router.post('/sessions', saveRealtimeSessionSummary);

export default router;
