// src/controllers/ttsController.js
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const TTS_DIR = path.join(process.cwd(), 'storage', 'tts');

// OpenAI TTS voices válidas (según tu propio error)
const ALLOWED_TTS_VOICES = new Set([
  'nova',
  'shimmer',
  'echo',
  'onyx',
  'fable',
  'alloy',
  'ash',
  'sage',
  'coral',
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

/**
 * POST /api/tts
 * Body: { text: string, voice?: string, model?: string }
 * Devuelve: { audioUrl: string }
 */
export const createTtsAudio = async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY faltante' });

    const text = (req.body?.text ?? '').toString().trim();
    if (!text) return res.status(400).json({ error: 'Falta text' });

    await ensureDir();

    // Model por defecto (podés setearlo por env)
    // Mantengo compatibilidad con tu setup.
    const model = (req.body?.model ?? process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts')
      .toString()
      .trim();

    // IMPORTANTE: “verse” NO es válido en /v1/audio/speech
    const defaultVoice = (process.env.OPENAI_TTS_VOICE ?? 'verse').toString().trim();
    const voice = pickVoice(req.body?.voice, defaultVoice);

    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        voice,
        input: text,
        format: 'mp3',
      }),
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
      return res.status(500).json({ error: 'TTS devolvió un mp3 inválido (muy chico)' });
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

    // Headers útiles para validación (D-ID suele hacer HEAD primero)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    // sendFile maneja HEAD correctamente si la ruta existe
    return res.sendFile(filePath);
  } catch (err) {
    console.error('serveTtsAudio error:', err);
    return res.status(404).send('Not found');
  }
};
