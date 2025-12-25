// src/routes/realtimeRoutes.js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { createRealtimeClientSecret } from '../controllers/realtimeController.js';

const router = express.Router();

// GET /api/realtime/client-secret?mode=text
router.get('/client-secret', requireAuth, createRealtimeClientSecret);

export default router;
