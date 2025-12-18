// src/routes/ttsRoutes.js
import { Router } from 'express';
import { createTtsAudio, serveTtsAudio, uploadAudio } from '../controllers/ttsController.js';

const router = Router();

// Protegido (requiere Bearer): generar mp3 desde texto
router.post('/', createTtsAudio);

// Protegido (requiere Bearer): subir audio ya generado (Realtime)
router.post('/upload', uploadAudio);

// Público: servir audio para D-ID
router.get('/:file', serveTtsAudio);
router.head('/:file', serveTtsAudio); // ✅ explícito

export default router;
