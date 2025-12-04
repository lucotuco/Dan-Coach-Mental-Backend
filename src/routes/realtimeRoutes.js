// src/routes/realtimeRoutes.js
import { Router } from 'express';
import { getRealtimeClientSecret } from '../controllers/realtimeController.js';


const router = Router();

// Si querés que solo usuarios logueados puedan usar voz:
router.get('/client-secret', getRealtimeClientSecret);

export default router;
