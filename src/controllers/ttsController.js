// src/controllers/ttsController.js
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

    try { await fs.unlink(f.path); } catch {}

    const base = getPublicBaseUrl(req);
    const audioUrl = `${base}/api/tts/${outName}`;

    console.log('[TTS][upload-recording] converted', { out: outName, ext, audioUrl });

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

// Voces permitidas por tu lista (OpenAI TTS)
const TTS_VOICES = new Set([
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer',
]);

/**
 * POST /api/tts/synthesize
 * Body: { text: string, voice?: one-of, format?: "mp3"|"wav" }
 * Devuelve: { audioUrl, ext }
 */
export const synthesizeTts = async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY no configurada' });

    const text = (req.body?.text ?? '').toString().trim();
    if (!text) return res.status(400).json({ error: 'Falta text' });

    const voiceReq = (req.body?.voice ?? 'onyx').toString().trim().toLowerCase();
    const voice = TTS_VOICES.has(voiceReq) ? voiceReq : 'onyx';

    const desiredExt = (req.body?.format ?? 'mp3').toString().trim().toLowerCase();
    const ext = ALLOWED_EXT.has(desiredExt) ? desiredExt : 'mp3';

    await ensureDir(TTS_DIR);

    const openai = new OpenAI({ apiKey });
    const model = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';

    // Genera audio
    const resp = await openai.audio.speech.create({
      model,
      voice,
      input: text,
      format: ext, // "mp3" o "wav"
    });

    const buf = Buffer.from(await resp.arrayBuffer());
    if (!buf.length) return res.status(500).json({ error: 'TTS devolvió audio vacío' });

    const fileName = `${randomUUID()}.${ext}`;
    const filePath = path.join(TTS_DIR, fileName);
    await fs.writeFile(filePath, buf);

    const base = getPublicBaseUrl(req);
    const audioUrl = `${base}/api/tts/${fileName}`;

    console.log('[TTS][synthesize] ok', { model, voice, ext, chars: text.length, bytes: buf.length, audioUrl });

    return res.json({ audioUrl, ext, voice, model });
  } catch (err) {
    console.error('synthesizeTts error:', err);
    return res.status(500).json({ error: 'Error interno generando TTS', details: err?.message ?? String(err) });
  }
};

/**
 * GET/HEAD /api/tts/:file
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

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', contentTypeFromExt(ext));

    return res.sendFile(filePath);
  } catch (err) {
    console.error('serveTtsAudio error:', err);
    return res.status(404).send('Not found');
  }
};
