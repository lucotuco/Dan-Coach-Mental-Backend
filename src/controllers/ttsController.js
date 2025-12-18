// src/controllers/ttsController.js
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const TTS_DIR = path.join(process.cwd(), 'storage', 'tts');

// Voces que HOY te acepta tu endpoint (según el error que pegaste)
// (si OpenAI vuelve a aceptar "verse", tu fallback igual te salva)
const SAFE_VOICES = new Set([
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
  // Debe ser público y HTTPS para D-ID
  const envBase = process.env.PUBLIC_BASE_URL;
  if (envBase) return envBase.replace(/\/+$/, '');

  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return `${proto}://${req.get('host')}`;
}

async function callOpenAiTts({ apiKey, model, voice, text }) {
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

  return r;
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

    const requestedModel = (req.body?.model ?? process.env.OPENAI_TTS_MODEL ?? 'tts-1')
      .toString()
      .trim();

    // Default más masculino
    const requestedVoiceRaw = (req.body?.voice ?? process.env.OPENAI_TTS_VOICE ?? 'onyx')
      .toString()
      .trim();

    const requestedVoice = SAFE_VOICES.has(requestedVoiceRaw) ? requestedVoiceRaw : 'onyx';

    // 1) Intento con voice pedida
    let r = await callOpenAiTts({
      apiKey,
      model: requestedModel,
      voice: requestedVoice,
      text,
    });

    // 2) Si falla por voice inválida, fallback a alloy
    if (!r.ok && requestedVoice !== 'alloy') {
      const errText = await r.text().catch(() => '');
      const looksLikeVoiceError =
        errText.includes(`loc": ("body", "voice")`) || errText.toLowerCase().includes('voice');

      if (looksLikeVoiceError) {
        r = await callOpenAiTts({
          apiKey,
          model: requestedModel,
          voice: 'alloy',
          text,
        });
      } else {
        // si no parece error de voice, devolvemos el error original
        return res.status(500).json({ error: 'OpenAI TTS falló', details: errText });
      }
    }

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
 * Público (sin auth) para que D-ID pueda descargar el mp3.
 */
export const serveTtsAudio = async (req, res) => {
  try {
    const file = (req.params.file ?? '').toString();
    const safe = path.basename(file);

    const ext = safe.split('.').pop()?.toLowerCase();
    if (!ext || !['mp3', 'wav'].includes(ext)) {
      return res.status(400).json({ error: 'Formato inválido' });
    }

    const filePath = path.join(TTS_DIR, safe);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', ext === 'wav' ? 'audio/wav' : 'audio/mpeg');

    return res.sendFile(filePath);
  } catch (err) {
    console.error('serveTtsAudio error:', err);
    return res.status(404).send('Not found');
  }
};

// +++ NUEVO: subir audio ya generado (por Realtime) y devolver audioUrl público
const ALLOWED_UPLOAD_EXT = new Set(['wav', 'mp3']);

function contentTypeFromExt(ext) {
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'mp3') return 'audio/mpeg';
  return 'application/octet-stream';
}

/**
 * POST /api/tts/upload
 * Body: { audioBase64: string, ext?: "wav"|"mp3" }
 * Devuelve: { audioUrl }
 */
export const uploadAudio = async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY faltante' });

    const audioBase64 = (req.body?.audioBase64 ?? '').toString().trim();
    const ext = ((req.body?.ext ?? 'wav').toString().trim().toLowerCase());

    if (!audioBase64) return res.status(400).json({ error: 'Falta audioBase64' });
    if (!ALLOWED_UPLOAD_EXT.has(ext)) return res.status(400).json({ error: 'ext inválida' });

    await ensureDir();

    // base64 -> bytes
    const buf = Buffer.from(audioBase64, 'base64');
    if (!buf?.length) return res.status(400).json({ error: 'audioBase64 inválido' });

    const fileName = `${randomUUID()}.${ext}`;
    const filePath = path.join(TTS_DIR, fileName);
    await fs.writeFile(filePath, buf);

    const base = getPublicBaseUrl(req);
    const audioUrl = `${base}/api/tts/${fileName}`;

    return res.json({ audioUrl });
  } catch (err) {
    console.error('uploadAudio error:', err);
    return res.status(500).json({ error: 'Error interno subiendo audio' });
  }
};

