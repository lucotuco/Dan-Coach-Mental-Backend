import { Router } from 'express';
import { uploadAudio, serveTtsAudio, ttsFromText } from '../controllers/ttsController.js';

const router = Router();

// Protegido (requiere Bearer): generar TTS desde texto (para D-ID lip-sync)
router.post('/from-text', ttsFromText);

// Protegido (requiere Bearer): subir audio ya generado (si lo usás en otras pruebas)
router.post('/upload', uploadAudio);

// Público: servir audio para D-ID (incluye HEAD para validación)
router.get('/:file', serveTtsAudio);
router.head('/:file', serveTtsAudio);

export default router;
