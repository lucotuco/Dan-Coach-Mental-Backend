// src/controllers/ttsController.js
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const TTS_DIR = path.join(process.cwd(), 'storage', 'tts');

// Voces built-in soportadas por /v1/audio/speech (según doc actual)
const ALLOWED_TTS_VOICES = new Set([
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'onyx',
  'nova',
  'sage',
  'shimmer',
  'verse',
  'marin',
  'cedar',
]);

async function ensureDir() {
  await fs.mkdir(TTS_DIR, { recursive: true });
}

function getPublicBaseUrl(req) {
  // Debe ser accesible públicamente por D-ID (HTTPS).
  const envBase = process.env.PUBLIC_BASE_URL;
  if (envBase) return envBase.replace(/\/+$/, '');

  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return `${proto}://${req.get('host')}`;
}

function pickVoice(requested, fallback) {
  const v = (requested || '').toString().trim();
  if (ALLOWED_TTS_VOICES.has(v)) return v;
  return fallback;
}

function isMiniTtsModel(model) {
  return typeof model === 'string' && model.startsWith('gpt-4o-mini-tts');
}

/**
 * POST /api/tts
 * Body: {
 *   text: string,
 *   voice?: string,
 *   model?: string,
 *   instructions?: string,
 *   speed?: number,
 *   response_format?: "mp3"|"opus"|"aac"|"flac"|"wav"|"pcm"
 * }
 * Devuelve: { audioUrl: string }
 */
export const createTtsAudio = async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY faltante' });

    const text = (req.body?.text ?? '').toString().trim();
    if (!text) return res.status(400).json({ error: 'Falta text' });

    await ensureDir();

    // Modelo por defecto: gpt-4o-mini-tts (necesario si querés usar `instructions`)
    // Modelos válidos: tts-1, tts-1-hd, gpt-4o-mini-tts, gpt-4o-mini-tts-2025-12-15
    const model = (req.body?.model ?? process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts')
      .toString()
      .trim();

    // Voice por defecto: verse
    const defaultVoice = (process.env.OPENAI_TTS_VOICE ?? 'verse').toString().trim();
    const voice = pickVoice(req.body?.voice, defaultVoice);

    // `instructions` controla la voz, pero NO funciona con tts-1/tts-1-hd
    // (solo lo mandamos si es gpt-4o-mini-tts*)
    const instructionsRaw =
      (req.body?.instructions ?? process.env.OPENAI_TTS_INSTRUCTIONS ?? '').toString().trim();

    const speedNum = Number(req.body?.speed);
    const speed =
      Number.isFinite(speedNum) && speedNum >= 0.25 && speedNum <= 4.0 ? speedNum : undefined;

    const response_format = (req.body?.response_format ?? 'mp3').toString().trim();

    const payload = {
      model,
      voice,
      input: text,
      response_format, // spec actual del endpoint
      ...(speed ? { speed } : {}),
      ...(isMiniTtsModel(model) && instructionsRaw ? { instructions: instructionsRaw } : {}),
    };

    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.error('OpenAI TTS error:', t);
      return res.status(500).json({ error: 'OpenAI TTS falló', details: t });
    }

    const arrayBuf = await r.arrayBuffer();
    const buf = Buffer.from(arrayBuf);

    // Sanity check mínimo
    if (!buf || buf.length < 800) {
      return res.status(500).json({ error: 'TTS devolvió un audio inválido (muy chico)' });
    }

    const fileName = `${randomUUID()}.mp3`;
    const filePath = path.join(TTS_DIR, fileName);
    await fs.writeFile(filePath, buf);

    const base = getPublicBaseUrl(req);
    const audioUrl = `${base}/api/tts/${fileName}`;

    return res.json({ audioUrl });
  } catch (err) {
    console.error('createTtsAudio error:', err);
    return res.status(500).json({ error: 'Error interno creando TTS' });
  }
};

/**
 * GET/HEAD /api/tts/:file
 * Público (sin auth) para que D-ID pueda descargar/validar el mp3.
 */
export const serveTtsAudio = async (req, res) => {
  try {
    const file = (req.params.file ?? '').toString();
    const safe = path.basename(file);

    if (!safe.endsWith('.mp3')) {
      return res.status(400).json({ error: 'Formato inválido' });
    }

    const filePath = path.join(TTS_DIR, safe);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    return res.sendFile(filePath);
  } catch (err) {
    console.error('serveTtsAudio error:', err);
    return res.status(404).send('Not found');
  }
};
