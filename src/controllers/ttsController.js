import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import OpenAI from 'openai';

const TTS_DIR = path.join(process.cwd(), 'storage', 'tts');
const TMP_DIR = path.join(process.cwd(), 'storage', 'tmp');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function getPublicBaseUrl(req) {
  const envBase = process.env.PUBLIC_BASE_URL;
  if (envBase) return envBase.replace(/\/+$/, '');

  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return `${proto}://${req.get('host')}`;
}

const ALLOWED_EXT = new Set(['wav', 'mp3']);

function contentTypeFromExt(ext) {
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'mp3') return 'audio/mpeg';
  return 'application/octet-stream';
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const bin = ffmpegPath || 'ffmpeg';
    const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    p.stderr.on('data', (d) => (stderr += d.toString()));

    p.on('error', (err) => reject(err));
    p.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(0, 800)}`));
    });
  });
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
    if (!ALLOWED_EXT.has(ext)) return res.status(400).json({ error: 'ext inválida' });

    await ensureDir(TTS_DIR);

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
 * POST /api/tts/upload-recording?ext=mp3|wav
 * multipart/form-data: field "file"
 * Devuelve: { audioUrl, ext }
 */
export const uploadRecording = async (req, res) => {
  const desiredExt = ((req.query.ext ?? 'mp3').toString().trim().toLowerCase());
  const ext = ALLOWED_EXT.has(desiredExt) ? desiredExt : 'mp3';

  try {
    const f = req.file;
    if (!f?.path) return res.status(400).json({ error: 'Falta archivo (field "file")' });

    await ensureDir(TTS_DIR);

    const outName = `${randomUUID()}.${ext}`;
    const outPath = path.join(TTS_DIR, outName);

    if (ext === 'mp3') {
      await runFfmpeg(['-y', '-i', f.path, '-vn', '-ac', '1', '-ar', '44100', '-b:a', '128k', outPath]);
    } else {
      await runFfmpeg(['-y', '-i', f.path, '-vn', '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', outPath]);
    }

    try {
      await fs.unlink(f.path);
    } catch {}

    const base = getPublicBaseUrl(req);
    const audioUrl = `${base}/api/tts/${outName}`;

    console.log('[TTS][upload-recording] converted', { in: path.basename(f.path), out: outName, ext, audioUrl });

    return res.json({ audioUrl, ext });
  } catch (err) {
    console.error('uploadRecording error:', err);
    try {
      if (req.file?.path && fsSync.existsSync(req.file.path)) await fs.unlink(req.file.path);
    } catch {}
    return res.status(500).json({
      error: 'Error interno convirtiendo audio (ffmpeg)',
      details: err?.message ?? String(err),
    });
  }
};

/**
 * POST /api/tts/synthesize
 * Body: { text: string, format?: "mp3"|"wav" }
 * Devuelve: { audioUrl, ext }
 *
 * Genera el audio que escucha el usuario y el mismo se manda a D-ID como audio_url.
 */
export const synthesizeTts = async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY no configurada' });

    const text = (req.body?.text ?? '').toString().trim();
    if (!text) return res.status(400).json({ error: 'Falta text' });

    // limitar para evitar abuso (ajustá si querés)
    const safeText = text.slice(0, 2000);

    const desired = ((req.body?.format ?? 'mp3').toString().trim().toLowerCase());
    const ext = ALLOWED_EXT.has(desired) ? desired : 'mp3';

    await ensureDir(TTS_DIR);
    await ensureDir(TMP_DIR);

    const ttsModel = process.env.TTS_MODEL || 'gpt-4o-mini-tts';
    const ttsVoice = process.env.TTS_VOICE || 'alloy';

    const client = new OpenAI({ apiKey });

    // Generamos MP3 siempre primero (más simple / rápido), y si pidieron WAV lo convertimos.
    const tmpMp3 = path.join(TMP_DIR, `${randomUUID()}.mp3`);

    const speech = await client.audio.speech.create({
      model: ttsModel,
      voice: ttsVoice,
      input: safeText,
      format: 'mp3',
    });

    const mp3Buf = Buffer.from(await speech.arrayBuffer());
    await fs.writeFile(tmpMp3, mp3Buf);

    let outName;
    let outPath;

    if (ext === 'mp3') {
      outName = `${randomUUID()}.mp3`;
      outPath = path.join(TTS_DIR, outName);
      await fs.rename(tmpMp3, outPath);
    } else {
      outName = `${randomUUID()}.wav`;
      outPath = path.join(TTS_DIR, outName);

      // wav mono 44100 pcm_s16le (muy compatible con servicios tipo D-ID)
      await runFfmpeg(['-y', '-i', tmpMp3, '-vn', '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', outPath]);

      try {
        await fs.unlink(tmpMp3);
      } catch {}
    }

    const base = getPublicBaseUrl(req);
    const audioUrl = `${base}/api/tts/${outName}`;

    console.log('[TTS][synthesize] ok', {
      model: ttsModel,
      voice: ttsVoice,
      ext,
      chars: safeText.length,
      audioUrl,
    });

    return res.json({ audioUrl, ext });
  } catch (err) {
    console.error('synthesizeTts error:', err);
    return res.status(500).json({
      error: 'Error interno generando TTS',
      details: err?.message ?? String(err),
    });
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
    if (!fsSync.existsSync(filePath)) return res.status(404).send('Not found');

    // Evitar 304/cache en validaciones
    res.setHeader('Cache-Control', 'no-store');

    // Para que D-ID pueda acceder sin problemas
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,Range');
    res.setHeader('Content-Type', contentTypeFromExt(ext));

    return res.sendFile(filePath);
  } catch (err) {
    console.error('serveTtsAudio error:', err);
    return res.status(404).send('Not found');
  }
};
