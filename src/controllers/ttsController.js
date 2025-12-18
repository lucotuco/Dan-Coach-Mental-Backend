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
