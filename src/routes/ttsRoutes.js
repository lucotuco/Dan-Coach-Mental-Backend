// src/routes/ttsRoutes.js
import { Router } from 'express';
import { createTtsAudio, serveTtsAudio } from '../controllers/ttsController.js';

const router = Router();

// Protegido (requiere Bearer): generar mp3
router.post('/', createTtsAudio);

// Público (sin Bearer): servir mp3 para D-ID
router.get('/:file', serveTtsAudio);

export default router;
