// src/controllers/ttsController.js
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const TTS_DIR = path.join(process.cwd(), 'storage', 'tts');

// Tu lista “real” (10)
const ALLOWED_TTS_VOICES = new Set([
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer',
]);

async function ensureDir() {
  await fs.mkdir(TTS_DIR, { recursive: true });
}

function getPublicBaseUrl(req) {
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

function assertFetch() {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error(
      'Este servidor no tiene fetch global. Usá Node 18+ (recomendado) o agregá un polyfill.',
    );
  }
}

/**
 * POST /api/tts
 * Body: { text, voice?, model?, instructions?, speed?, response_format? }
 * Devuelve: { audioUrl }
 */
export const createTtsAudio = async (req, res) => {
  try {
    assertFetch();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY faltante' });

    const text = (req.body?.text ?? '').toString().trim();
    if (!text) return res.status(400).json({ error: 'Falta text' });

    await ensureDir();

    // rápido y con instrucciones (si tu cuenta lo soporta)
    const model = (req.body?.model ?? process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts')
      .toString()
      .trim();

    const defaultVoice = (process.env.OPENAI_TTS_VOICE ?? 'onyx').toString().trim();
    const voice = pickVoice(req.body?.voice, defaultVoice);

    const instructions = (req.body?.instructions ?? process.env.OPENAI_TTS_INSTRUCTIONS ?? '')
      .toString()
      .trim();

    const speedNum = Number(req.body?.speed);
    const speed =
      Number.isFinite(speedNum) && speedNum >= 0.25 && speedNum <= 4.0 ? speedNum : undefined;

    // Para D-ID: mp3 estable
    const response_format = 'mp3';

    const payload = {
      model,
      voice,
      input: text,
      response_format,
      ...(speed ? { speed } : {}),
      ...(instructions ? { instructions } : {}),
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

    if (!buf || buf.length < 800) {
      return res.status(500).json({ error: 'TTS devolvió audio inválido (muy chico)' });
    }

    const fileName = `${randomUUID()}.mp3`;
    const filePath = path.join(TTS_DIR, fileName);
    await fs.writeFile(filePath, buf);

    const base = getPublicBaseUrl(req);
    const audioUrl = `${base}/api/tts/${fileName}`;

    return res.json({ audioUrl });
  } catch (err) {
    console.error('createTtsAudio error:', err);
    return res.status(500).json({ error: 'Error interno creando TTS', details: err?.message ?? String(err) });
  }
};

/**
 * GET/HEAD /api/tts/:file
 * Público para D-ID.
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
