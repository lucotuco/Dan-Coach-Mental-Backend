// src/controllers/ttsController.js
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const TTS_DIR = path.join(process.cwd(), 'storage', 'tts');

const ALLOWED_VOICES = new Set([
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse',
]);

const ALLOWED_MODELS = new Set(['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts']);

async function ensureDir() {
  await fs.mkdir(TTS_DIR, { recursive: true });
}

function getPublicBaseUrl(req) {
  // >>> CLAVE para D-ID: tiene que ser accesible desde internet (https), NO localhost
  const envBase = process.env.PUBLIC_BASE_URL;
  if (envBase) return envBase.replace(/\/+$/, '');

  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return `${proto}://${req.get('host')}`;
}

/**
 * POST /api/tts
 * Body: { text, model?, voice?, instructions?, speed? }
 * Devuelve: { audioUrl }
 */
export const createTtsAudio = async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY faltante' });

    const text = (req.body?.text ?? '').toString().trim();
    if (!text) return res.status(400).json({ error: 'Falta text' });

    await ensureDir();

    const bodyModel = (req.body?.model ?? '').toString().trim();
    const bodyVoice = (req.body?.voice ?? '').toString().trim();
    const bodyInstructions = (req.body?.instructions ?? '').toString().trim();
    const bodySpeedRaw = req.body?.speed;

    const model = ALLOWED_MODELS.has(bodyModel)
      ? bodyModel
      : (process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts');

    const voice = ALLOWED_VOICES.has(bodyVoice)
      ? bodyVoice
      : (process.env.OPENAI_TTS_VOICE || 'verse');

    let speed = 1.0;
    if (typeof bodySpeedRaw === 'number') speed = bodySpeedRaw;
    if (typeof bodySpeedRaw === 'string' && bodySpeedRaw) speed = Number(bodySpeedRaw);
    if (!Number.isFinite(speed)) speed = 1.0;
    speed = Math.max(0.25, Math.min(4.0, speed));

    // Si querés “prompt de voz” estable, ponelo en env y/o mandalo desde el front
    const instructions =
      bodyInstructions || (process.env.OPENAI_TTS_INSTRUCTIONS || '').toString().trim();

    const payload = {
      model,
      voice,
      input: text,
      response_format: 'mp3',
      speed,
      ...(instructions && model === 'gpt-4o-mini-tts' ? { instructions } : {}),
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
 * GET /api/tts/:file
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

    // CORS abierto (útil para debug; D-ID server-to-server no lo necesita)
    res.setHeader('Access-Control-Allow-Origin', '*');

    return res.sendFile(filePath);
  } catch (err) {
    console.error('serveTtsAudio error:', err);
    return res.status(404).send('Not found');
  }
};
