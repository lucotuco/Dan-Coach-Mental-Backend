import fs from 'fs';
import { Chequeo } from '../models/Chequeo.js';
import { openai } from '../services/openaiClient.js';

const SUMMARY_MODEL = process.env.DAN_MODEL || 'gpt-4o-mini';

export async function transcribeAudio(filePath) {
  try {
    const fileStream = fs.createReadStream(filePath);
    const response = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: fileStream,
      language: 'es',
    });

    return response.text;
  } catch (error) {
    console.error('ERROR transcribeAudio >>>', error);
    throw error;
  }
}

export async function getSummaryAndTagsFromTranscript(transcript) {
  if (!transcript) {
    return { summary: '', tags: [] };
  }

  try {
    const completion = await openai.chat.completions.create({
      model: SUMMARY_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'Sos un coach mental deportivo. Devuelve únicamente un JSON válido con resumen y tags en español.',
        },
        {
          role: 'user',
          content: `Transcripción en español:\n${transcript}\n\nDevolvé solo un objeto JSON con el formato {"summary": "resumen breve de 2-3 líneas en español", "tags": ["tag1", "tag2", "tag3"]}.`,
        },
      ],
      temperature: 0.3,
    });

    const content = completion.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return { summary: '', tags: [] };
    }

    const parsed = JSON.parse(content);
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.map((tag) => (typeof tag === 'string' ? tag : String(tag)))
      : [];

    return {
      summary: parsed.summary || '',
      tags,
    };
  } catch (error) {
    console.error('ERROR getSummaryAndTagsFromTranscript >>>', error);
    return { summary: '', tags: [] };
  }
}

export async function createCheck(req, res, next) {
  try {
    const {
      owner,
      fecha,
      tipo,
      variable1,
      variable2,
      variable3,
      variable4,
      variable5,
      variable6,
      variable7,
      audio,
    } = req.body;

    if (!fecha) {
      return res.status(400).json({ message: 'fecha es obligatoria' });
    }
    if (!owner) {
      return res.status(400).json({ message: 'owner es obligatorio' });
    }
    if (!tipo) {
      return res.status(400).json({ message: 'tipo es obligatorio' });
    }

    let audioData = audio;

    if (req.file?.path) {
      const transcript = await transcribeAudio(req.file.path);
      const { summary, tags } = await getSummaryAndTagsFromTranscript(transcript);

      audioData = {
        url: null,
        transcript,
        summary,
        tags,
      };

      try {
        await fs.promises.unlink(req.file.path);
      } catch (cleanupError) {
        console.warn('No se pudo eliminar el archivo temporal de audio', cleanupError);
      }
    }

    const chequeo = await Chequeo.create({
      owner,
      fecha,
      tipo,
      variable1,
      variable2,
      variable3,
      variable4,
      variable5,
      variable6,
      variable7,
      audio: audioData,
    });

    res.status(201).json(chequeo);
  } catch (error) {
    console.error('ERROR createCheck >>>', error);
    next(error);
  }
}

function buildVariablesSummary(chequeo) {
  const variables = [
    chequeo.variable1 !== undefined && chequeo.variable1 !== null && `v1:${chequeo.variable1}`,
    chequeo.variable2 !== undefined && chequeo.variable2 !== null && `v2:${chequeo.variable2}`,
    chequeo.variable3 !== undefined && chequeo.variable3 !== null && `v3:${chequeo.variable3}`,
    chequeo.variable4 !== undefined && chequeo.variable4 !== null && `v4:${chequeo.variable4}`,
    chequeo.variable5 !== undefined && chequeo.variable5 !== null && `v5:${chequeo.variable5}`,
    chequeo.variable6 !== undefined && chequeo.variable6 !== null && `v6:${chequeo.variable6}`,
    chequeo.variable7 !== undefined && chequeo.variable7 !== null && `v7:${chequeo.variable7}`,
  ]
    .filter(Boolean)
    .join(', ');

  return variables || 'Sin variables registradas';
}

export async function buildRecentChequeosContext(owner, limit = 5) {
  const chequeos = await Chequeo.find({ owner }).sort({ fecha: -1 }).limit(limit);

  if (!chequeos.length) {
    return 'Contexto de chequeos recientes:\n\nSin chequeos registrados.';
  }

  const entries = chequeos.map((chequeo) => {
    const date = chequeo.fecha ? new Date(chequeo.fecha).toISOString().slice(0, 10) : 'Fecha no disponible';
    const tipo = chequeo.tipo || 'sin tipo';
    const variablesSummary = buildVariablesSummary(chequeo);
    const audioSummary = chequeo.audio?.summary || 'Sin resumen de audio.';
    const tagsSummary = Array.isArray(chequeo.audio?.tags) && chequeo.audio.tags.length
      ? chequeo.audio.tags.join(', ')
      : 'Sin tags.';

    return [
      `- ${date} (${tipo})`,
      `  Variables: ${variablesSummary}`,
      `  Summary audio: "${audioSummary}"`,
      `  Tags: ${tagsSummary}`,
    ].join('\n');
  });

  return `Contexto de chequeos recientes:\n\n${entries.join('\n\n')}`;
}

export async function listChecksByTypeAndOwner(req, res, next) {
  try {
    const { owner, tipo } = req.query;

    if (!owner) {
      return res.status(400).json({ message: 'owner es obligatorio' });
    }

    if (!tipo) {
      return res.status(400).json({ message: 'tipo es obligatorio' });
    }

    const chequeos = await Chequeo.find({ owner, tipo }).sort({ fecha: -1 });

    res.json(chequeos);
  } catch (error) {
    console.error('ERROR listChecksByTypeAndOwner >>>', error);
    next(error);
  }
}
