import { Router } from 'express';
import { getDidConfig } from '../controllers/didController.js';

const router = Router();

// Protegido por tu authMiddleware global
router.get('/config', getDidConfig);

export default router;
