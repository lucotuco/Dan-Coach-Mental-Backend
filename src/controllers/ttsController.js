// src/controllers/ttsController.js
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { Agent } from 'undici';

const TTS_DIR = path.join(process.cwd(), 'storage', 'tts');

// Keep-alive para reducir latencia de llamadas repetidas a OpenAI
const OPENAI_DISPATCHER = new Agent({
  connections: 50,
  keepAliveTimeout: 10_000,
  keepAliveMaxTimeout: 60_000,
});

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
  // extras (si los usás)
  'verse',
  'marin',
  'cedar',
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

function isMiniTtsModel(model) {
  return typeof model === 'string' && model.startsWith('gpt-4o-mini-tts');
}

function safeResponseFormat(fmt) {
  const f = (fmt || '').toString().trim().toLowerCase();
  const allowed = new Set(['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm']);
  return allowed.has(f) ? f : 'mp3';
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

    const model = (req.body?.model ?? process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts')
      .toString()
      .trim();

    const defaultVoice = (process.env.OPENAI_TTS_VOICE ?? 'onyx').toString().trim();
    const voice = pickVoice(req.body?.voice, defaultVoice);

    const instructionsRaw =
      (req.body?.instructions ?? process.env.OPENAI_TTS_INSTRUCTIONS ?? '').toString().trim();

    const speedNum = Number(req.body?.speed);
    const speed =
      Number.isFinite(speedNum) && speedNum >= 0.25 && speedNum <= 4.0 ? speedNum : undefined;

    const response_format = safeResponseFormat(req.body?.response_format ?? 'mp3');

    const payload = {
      model,
      voice,
      input: text,
      response_format,
      ...(speed ? { speed } : {}),
      ...(isMiniTtsModel(model) && instructionsRaw ? { instructions: instructionsRaw } : {}),
    };

    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      dispatcher: OPENAI_DISPATCHER,
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
      return res.status(500).json({ error: 'TTS devolvió un audio inválido (muy chico)' });
    }

    // Para D-ID, mp3 es lo más práctico. Igual guardamos según response_format.
    const ext = response_format === 'pcm' ? 'pcm' : response_format;
    const fileName = `${randomUUID()}.${ext}`;
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
 * Público (sin auth) para que D-ID pueda descargar/validar el audio.
 */
export const serveTtsAudio = async (req, res) => {
  try {
    const file = (req.params.file ?? '').toString();
    const safe = path.basename(file);

    const allowedExt = ['.mp3', '.wav', '.aac', '.opus', '.flac', '.pcm'];
    if (!allowedExt.some((e) => safe.endsWith(e))) {
      return res.status(400).json({ error: 'Formato inválido' });
    }

    const filePath = path.join(TTS_DIR, safe);

    res.setHeader('Access-Control-Allow-Origin', '*');
    // content-type mínimo (si querés exactitud por ext, se puede mapear)
    res.setHeader('Content-Type', safe.endsWith('.mp3') ? 'audio/mpeg' : 'application/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes');

    // En producción podés dejarlo largo; en dev conviene no cachear para evitar “audio viejo”.
    const isProd = process.env.NODE_ENV === 'production';
    res.setHeader('Cache-Control', isProd ? 'public, max-age=31536000, immutable' : 'no-store');

    return res.sendFile(filePath);
  } catch (err) {
    console.error('serveTtsAudio error:', err);
    return res.status(404).send('Not found');
  }
};
