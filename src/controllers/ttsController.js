// src/controllers/ttsController.js
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const TTS_DIR = path.join(process.cwd(), 'storage', 'tts');

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
  const envBase = process.env.PUBLIC_BASE_URL;
  if (envBase) return envBase.replace(/\/+$/, '');

  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return `${proto}://${req.get('host')}`;
}

function pickVoice(requested, fallbackValid) {
  const v = (requested || '').toString().trim();
  if (ALLOWED_TTS_VOICES.has(v)) return v;
  return fallbackValid;
}

/**
 * POST /api/tts
 * Body: { text: string, voice?: string, model?: string }
 */
export const createTtsAudio = async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY faltante' });

    const text = (req.body?.text ?? '').toString().trim();
    if (!text) return res.status(400).json({ error: 'Falta text' });

    await ensureDir();

    const model = (req.body?.model ?? process.env.OPENAI_TTS_MODEL ?? 'tts-1').toString().trim();

    // DEFAULT SIEMPRE VÁLIDO (no "verse")
    const fallbackVoice = ALLOWED_TTS_VOICES.has((process.env.OPENAI_TTS_VOICE ?? '').trim())
      ? (process.env.OPENAI_TTS_VOICe ?? '').trim()
      : 'onyx';

    const voice = pickVoice(req.body?.voice, fallbackVoice);

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

export const serveTtsAudio = async (req, res) => {
  try {
    const file = (req.params.file ?? '').toString();
    const safe = path.basename(file);

    if (!safe.endsWith('.mp3')) return res.status(400).json({ error: 'Formato inválido' });

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
