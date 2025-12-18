// src/controllers/ttsController.js
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const DEBUG_TTS = process.env.DEBUG_TTS === '1';

const TTS_DIR = path.join(process.cwd(), 'storage', 'tts');

const SAFE_VOICES = new Set([
  'nova', 'shimmer', 'echo', 'onyx', 'fable', 'alloy', 'ash', 'sage', 'coral',
]);

const ALLOWED_UPLOAD_EXT = new Set(['wav', 'mp3']);

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
  return fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      voice,
      input: text,
      response_format: 'mp3', // ✅ (no "format")
    }),
  });
}

/**
 * POST /api/tts
 * Body: { text: string, voice?: string, model?: string }
 * Devuelve: { audioUrl: string }
 */
export const createTtsAudio = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY faltante' });

    const text = (req.body?.text ?? '').toString().trim();
    if (!text) return res.status(400).json({ error: 'Falta text' });

    await ensureDir();

    const requestedModel = (req.body?.model ?? process.env.OPENAI_TTS_MODEL ?? 'tts-1')
      .toString()
      .trim();

    const requestedVoiceRaw = (req.body?.voice ?? process.env.OPENAI_TTS_VOICE ?? 'onyx')
      .toString()
      .trim();

    const requestedVoice = SAFE_VOICES.has(requestedVoiceRaw) ? requestedVoiceRaw : 'onyx';

    if (DEBUG_TTS) {
      console.log('[TTS] create', { model: requestedModel, voice: requestedVoice, chars: text.length });
    }

    let r = await callOpenAiTts({
      apiKey,
      model: requestedModel,
      voice: requestedVoice,
      text,
    });

    // Fallback si hay error de voice
    if (!r.ok && requestedVoice !== 'alloy') {
      const errText = await r.text().catch(() => '');
      const looksLikeVoiceError =
        errText.toLowerCase().includes('voice') || errText.includes(`("body","voice")`) || errText.includes(`("body", "voice")`);

      if (looksLikeVoiceError) {
        if (DEBUG_TTS) console.log('[TTS] voice fallback -> alloy');
        r = await callOpenAiTts({
          apiKey,
          model: requestedModel,
          voice: 'alloy',
          text,
        });
      } else {
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

    if (DEBUG_TTS) console.log('[TTS] created', { fileName, bytes: buf.length, audioUrl });

    return res.json({ audioUrl });
  } catch (err) {
    console.error('createTtsAudio error:', err);
    return res.status(500).json({ error: 'Error interno creando TTS' });
  }
};

/**
 * POST /api/tts/upload
 * Body: { audioBase64: string, ext?: "wav"|"mp3" }
 * Devuelve: { audioUrl }
 */
export const uploadAudio = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    const audioBase64 = (req.body?.audioBase64 ?? '').toString().trim();
    const ext = ((req.body?.ext ?? 'wav').toString().trim().toLowerCase());

    if (!audioBase64) return res.status(400).json({ error: 'Falta audioBase64' });
    if (!ALLOWED_UPLOAD_EXT.has(ext)) return res.status(400).json({ error: 'ext inválida' });

    await ensureDir();

    const buf = Buffer.from(audioBase64, 'base64');
    if (!buf?.length) return res.status(400).json({ error: 'audioBase64 inválido' });

    const fileName = `${randomUUID()}.${ext}`;
    const filePath = path.join(TTS_DIR, fileName);
    await fs.writeFile(filePath, buf);

    const base = getPublicBaseUrl(req);
    const audioUrl = `${base}/api/tts/${fileName}`;

    if (DEBUG_TTS) {
      console.log('[TTS][upload] received', { ext, base64Len: audioBase64.length, bytes: buf.length });
      console.log('[TTS][upload] saved', { fileName, filePath, audioUrl });
    }

    return res.json({ audioUrl });
  } catch (err) {
    console.error('uploadAudio error:', err);
    return res.status(500).json({ error: 'Error interno subiendo audio' });
  }
};

/**
 * GET/HEAD /api/tts/:file
 * Público para que D-ID valide/descargue audio.
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
    const st = await fs.stat(filePath);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', String(st.size));
    res.setHeader('Content-Type', ext === 'wav' ? 'audio/wav' : 'audio/mpeg');

    if (DEBUG_TTS) {
      console.log('[TTS][serve]', { method: req.method, url: req.originalUrl, safe, bytes: st.size });
    }

    if (req.method === 'HEAD') {
      return res.status(200).end();
    }

    return res.sendFile(filePath, (err) => {
      if (err) {
        console.error('[TTS][serve] sendFile error:', err);
        if (!res.headersSent) res.status(404).send('Not found');
      }
    });
  } catch (err) {
    console.error('serveTtsAudio error:', err);
    return res.status(404).send('Not found');
  }
};
