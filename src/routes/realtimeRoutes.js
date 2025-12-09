// src/routes/realtimeRoutes.js
import { Router } from 'express';
import {getRealtimeClientSecret,saveRealtimeSessionSummary} from '../controllers/realtimeController.js';

const router = Router();

// GET /api/realtime/client-secret
router.get('/client-secret', getRealtimeClientSecret);

// POST /api/realtime/sessions
// (la tool del agente llama acá para guardar el resumen)
router.post('/sessions', saveRealtimeSessionSummary);

export default router;
