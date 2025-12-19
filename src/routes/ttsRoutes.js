// src/routes/ttsRoutes.js
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';

import { uploadAudio, uploadRecording, serveTtsAudio } from '../controllers/ttsController.js';

const router = Router();

const TMP_DIR = path.join(process.cwd(), 'storage', 'tmp');

async function ensureTmp() {
  await fs.mkdir(TMP_DIR, { recursive: true });
}

// Multer a disco (no memoria) para audios
const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    try {
      await ensureTmp();
      cb(null, TMP_DIR);
    } catch (e) {
      cb(e, TMP_DIR);
    }
  },
  filename: (_req, file, cb) => {
    const safeExt = (file.originalname.split('.').pop() || 'webm').toLowerCase();
    cb(null, `realtime_${Date.now()}_${Math.random().toString(16).slice(2)}.${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// Protegido (requiere Bearer): subir audio base64 (legacy)
router.post('/upload', uploadAudio);

// Protegido (requiere Bearer): subir recording (multipart) y convertir a mp3/wav
router.post('/upload-recording', upload.single('file'), uploadRecording);

// Público: servir audio para D-ID (incluye HEAD para validación)
router.get('/:file', serveTtsAudio);
router.head('/:file', serveTtsAudio);

export default router;
