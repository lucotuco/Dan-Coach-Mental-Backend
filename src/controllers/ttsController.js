import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const TTS_DIR = path.join(process.cwd(), 'storage', 'tts');

async function ensureDir() {
  await fs.mkdir(TTS_DIR, { recursive: true });
}

function getPublicBaseUrl(req) {
  const envBase = process.env.PUBLIC_BASE_URL;
  if (envBase) return envBase.replace(/\/+$/, '');

  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return `${proto}://${req.get('host')}`;
}

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

    console.log('[TTS][upload] saved', { ext, bytes: buf.length, audioUrl });

    return res.json({ audioUrl });
  } catch (err) {
    console.error('uploadAudio error:', err);
    return res.status(500).json({ error: 'Error interno subiendo audio' });
  }
};

/**
 * POST /api/tts/from-text
 * Body: { text: string, voice?: string, format?: "mp3"|"wav" }
 * Devuelve: { audioUrl }
 *
 * Genera un audio con OpenAI TTS para que D-ID pueda hacer lip-sync.
 * Este endpoint debe quedar protegido (requiere Bearer) — tu authMiddleware global ya lo protege.
 */
export const ttsFromText = async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY no configurada en el servidor' });

    const text = (req.body?.text ?? '').toString().trim();
    if (!text) return res.status(400).json({ error: 'Falta text' });

    // Límite práctico para evitar audios enormes por accidente
    const safeText = text.slice(0, 1200);

    const voice = ((req.body?.voice ?? process.env.OPENAI_TTS_VOICE ?? 'verse').toString().trim());
    const format = ((req.body?.format ?? 'mp3').toString().trim().toLowerCase());
    const ext = format === 'wav' ? 'wav' : 'mp3';

    // Modelo configurable por env (si no está, default razonable)
    const model = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';

    await ensureDir();

    const fileName = `${randomUUID()}.${ext}`;
    const filePath = path.join(TTS_DIR, fileName);

    // OpenAI TTS: /v1/audio/speech
    // En algunos SDKs/cambios el parámetro se llama "response_format".
    // Usamos response_format (mp3|wav) que es lo estándar.
    const payload = {
      model,
      voice,
      input: safeText,
      response_format: ext,
    };

    console.log('[TTS][from-text] generating...', {
      model,
      voice,
      format: ext,
      chars: safeText.length,
    });

    const resp = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.error('[TTS][from-text] OpenAI error:', errText);
      return res.status(500).json({ error: 'Error generando TTS', details: errText });
    }

    const arrayBuffer = await resp.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);
    if (!buf?.length) return res.status(500).json({ error: 'TTS vacío' });

    await fs.writeFile(filePath, buf);

    const base = getPublicBaseUrl(req);
    const audioUrl = `${base}/api/tts/${fileName}`;

    console.log('[TTS][from-text] saved', { bytes: buf.length, audioUrl });

    return res.json({ audioUrl });
  } catch (err) {
    console.error('ttsFromText error:', err);
    return res.status(500).json({ error: 'Error interno generando TTS' });
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

    const ext = safe.split('.').pop()?.toLowerCase();
    if (!ext || !['mp3', 'wav'].includes(ext)) {
      return res.status(400).json({ error: 'Formato inválido' });
    }

    const filePath = path.join(TTS_DIR, safe);

    // Evitar 304/cache en validaciones
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', contentTypeFromExt(ext));

    return res.sendFile(filePath);
  } catch (err) {
    console.error('serveTtsAudio error:', err);
    return res.status(404).send('Not found');
  }
};
