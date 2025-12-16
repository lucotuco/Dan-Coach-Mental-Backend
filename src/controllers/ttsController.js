// src/controllers/ttsController.js
import fs from "fs";
import path from "path";
import crypto from "crypto";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TTS_DIR = path.resolve(process.cwd(), "tmp_tts");
if (!fs.existsSync(TTS_DIR)) fs.mkdirSync(TTS_DIR, { recursive: true });

// Borra archivos viejos (MVP). Ajustá si querés.
const DELETE_AFTER_MS = 10 * 60 * 1000; // 10 min

export async function createTts(req, res) {
  try {
    const { text } = req.body ?? {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing 'text' (string)" });
    }

    const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
    const voice = process.env.OPENAI_TTS_VOICE || "verse";
    const publicBase = process.env.PUBLIC_BASE_URL;

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY in .env" });
    }
    if (!publicBase) {
      return res.status(500).json({
        error:
          "Missing PUBLIC_BASE_URL in .env (must be publicly reachable for D-ID)",
      });
    }

    const mp3 = await openai.audio.speech.create({
      model,
      voice,
      input: text,
      response_format: "mp3",
    });

    const id = crypto.randomUUID();
    const filePath = path.join(TTS_DIR, `${id}.mp3`);
    const buffer = Buffer.from(await mp3.arrayBuffer());
    await fs.promises.writeFile(filePath, buffer);

    // Cleanup (MVP)
    setTimeout(() => {
      fs.promises.unlink(filePath).catch(() => {});
    }, DELETE_AFTER_MS);

    const audioUrl = `${publicBase}/api/tts/${id}.mp3`;
    return res.json({ id, audioUrl });
  } catch (e) {
    return res.status(500).json({ error: "TTS failed", details: String(e) });
  }
}

export async function getTtsFile(req, res) {
  const { id } = req.params;
  const filePath = path.join(TTS_DIR, `${id}.mp3`);

  if (!fs.existsSync(filePath)) return res.status(404).end();

  res.setHeader("Content-Type", "audio/mpeg");
  // Importante: este GET debe ser público porque D-ID lo va a descargar server-side.
  fs.createReadStream(filePath).pipe(res);
}
