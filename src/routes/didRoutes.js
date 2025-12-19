// src/routes/didRoutes.js
import { Router } from 'express';
import { getDidConfig, proxyDidAsset } from '../controllers/didController.js';

const router = Router();

// Config (normalmente protegido con Bearer por tu authMiddleware global)
router.get('/config', getDidConfig);

// Proxy (idealmente público, porque el <video src> no puede mandar Authorization)
router.get('/proxy', proxyDidAsset);
router.head('/proxy', proxyDidAsset);

export default router;
