// src/controllers/realtimeController.js
import crypto from 'crypto';
import mongoose from 'mongoose';
import { CoachSession } from '../models/CoachSession.js';
import { Chequeo } from '../models/Chequeo.js';
import { RealtimeSessionState } from '../models/RealtimeSessionState.js';
import { SessionTranscript } from '../models/SessionTranscript.js';
import { DanConversation } from '../models/DanConversation.js';
import { DanMessage } from '../models/DanMessage.js';
import { getCachedMemory, setCachedMemory } from '../services/memoryCache.js';
import { upsertSessionTranscript } from '../services/sessionTranscriptStore.js';
import {
  buildContextPack,
  detectTopicShift,
  createSessionSummary,
  updateUserProfileFromTranscript,
  createMemoryItemsFromSummary,
  refreshLongTermBriefIfNeeded,
} from '../services/memoryService.js';

const shouldLogRealtimePayload =
  process.env.DAN_LOG_PROMPTS === '1' || process.env.DAN_LOG_PROMPTS === 'true';

const DAN_BASE_INSTRUCTIONS = `Sos DAN, coach mental deportivo virtual. Tu meta: ayudar a deportistas a ganar calma, foco y mentalidad de crecimiento usando preguntas, respiración, visualización y pequeños planes de acción.

Identidad y límites: Sos: coach mental, guía calmo, facilitador, entrenador de hábitos y observador sin juicio. NO sos: psicólogo, psiquiatra, médico, terapeuta, preparador físico, entrenador técnico ni gurú. No des diagnósticos. No des consejos médicos ni sobre medicación. No enseñes técnica deportiva (cómo golpear, correr, etc.): enfocate en mente, foco y hábitos.

Si aparecen autolesiones, suicidio, depresión grave, traumas, adicciones, violencia o abuso: Aclarar que sos coach mental, no profesional clínico. No profundizar en detalles. Sugerir ayuda profesional presencial, un adulto de confianza o una línea de ayuda.

Tono y lenguaje: Soná como una charla cercana, no como una sesión formal. Tono: calmo pero con buena energía, empático (énfasis en la empatía), cercano, respetuoso y validante. Nunca juzgar, sermonear, retar, minimizar ni comparar negativamente. Usá “vos” (rioplatense). Palabras simples, metáforas sencillas, sin tecnicismos. no mas de 1 o 2 preguntas x respuesta.

IMPORTANTE:
- Tu salida siempre es texto. Si la sesión está en modo audio, ese texto se convertirá en voz automáticamente.
`.trim();

function getAuthUserId(req) {
  return req.user?.userId || req.user?.id || req.user?._id || req.user?.sub || null;
}

function buildRealtimeInstructions(base, contextPack) {
  return base + (contextPack ? `\n\n=== CONTEXT_PACK (personalización + memoria) ===\n${contextPack}\n=== FIN CONTEXT_PACK ===\n` : '');
}
function safeObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

async function buildConversationContext({ userId, conversationId, limit = 60 }) {
  const convoId = safeObjectId(conversationId);
  if (!convoId) return { summary: '', recentTurns: '' };

  const convo = await DanConversation.findOne({ _id: convoId, userId }).lean();
  if (!convo) return { summary: '', recentTurns: '' };

  const msgs = await DanMessage.find({ conversationId: convoId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const ordered = msgs.reverse(); // cronológico

  const recentTurns = ordered
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => `${m.role === 'user' ? 'Usuario' : 'DAN'}: ${String(m.text || '')}`)
    .join('\n');

  return {
    summary: String(convo.historySummary || '').trim(),
    recentTurns,
  };
}


function oid(id) {
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
}

async function upsertRealtimeState({
  userId,
  sessionId,
  metadata = {},
  touchActivity = true,
  touchAutosave = false,
  status = 'open',
}) {
  const now = new Date();
  const update = {
    $setOnInsert: { userId: oid(userId), sessionId: String(sessionId) },
    $set: {
      status,
      metadata: { ...(metadata || {}) },
    },
  };

  if (touchActivity) update.$set.lastActivityAt = now;
  if (touchAutosave) update.$set.lastAutosaveAt = now;

  const doc = await RealtimeSessionState.findOneAndUpdate(
    { userId: oid(userId), sessionId: String(sessionId) },
    update,
    { new: true, upsert: true }
  );

  return doc;
}

async function finalizeRealtimePipeline({
  userId,
  sessionId,
  transcript,
  metadata = {},
  forceLongTerm = false,
  finalizedBy = 'client',
}) {
  // sessionId FINAL para el pipeline
  const finalSessionId = `${String(sessionId)}:final`;

  // Guardamos también el finalSessionId como transcript “final”
  await upsertSessionTranscript({
    userId,
    sessionId: finalSessionId,
    transcript: String(transcript),
    metadata: { ...(metadata || {}), channel: 'realtime', kind: 'final' },
  });

  const summaryDoc = await createSessionSummary({ userId, sessionId: finalSessionId, transcript });
  const profileResult = await updateUserProfileFromTranscript({ userId, transcript });
  const memoryResult = await createMemoryItemsFromSummary({ userId, sessionId: finalSessionId, summary: summaryDoc });
  const longTermResult = await refreshLongTermBriefIfNeeded({ userId, force: Boolean(forceLongTerm) });

  await CoachSession.create({
    owner: userId,
    canal: 'realtime',
    resumen: summaryDoc?.contexto || '',
    puntosClave: Array.isArray(summaryDoc?.acuerdos_tareas) ? summaryDoc.acuerdos_tareas : [],
    proximoPaso: Array.isArray(summaryDoc?.plan_accion) && summaryDoc.plan_accion.length ? summaryDoc.plan_accion[0] : '',
    modelo: process.env.DAN_REALTIME_MODEL || 'gpt-realtime',
  });

  return {
    finalSessionId,
    summaryDoc,
    profileResult,
    memoryResult,
    longTermResult,
    finalizedBy,
  };
}

/**
 * GET /api/realtime/client-secret?mode=text|audio
 */
export const getRealtimeClientSecret = async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY no configurada en el servidor' });
    }

    const authUserId = getAuthUserId(req);
    const userId = req.query.userId ? String(req.query.userId) : (authUserId ? String(authUserId) : null);

    const mode = (req.query.mode ?? 'text').toString().toLowerCase();
    const outputModality = mode === 'audio' ? 'audio' : 'text';
const conversationId = (req.query.conversationId ?? '').toString().trim();

    let contextPack = '';
    if (userId) {
      try {
        const ctx = await buildContextPack({
          userId,
          messageText: 'inicio de sesión realtime',
          metadata: { channel: 'realtime', phase: 'bootstrap' },
          tokenBudget: parseInt(process.env.DAN_CONTEXT_BUDGET || '1500', 10),
          topK: parseInt(process.env.DAN_CONTEXT_TOPK || '4', 10),
        });
        contextPack = ctx.contextPack;
      } catch (err) {
        console.error('Error armando contextPack realtime:', err);
      }
    }

    let convoSummary = '';
let convoRecentTurns = '';

if (conversationId && userId) {
  try {
    const ctx = await buildConversationContext({
      userId,
      conversationId,
      limit: parseInt(process.env.DAN_CONVO_RECENT_LIMIT || '60', 10),
    });
    convoSummary = ctx.summary;
    convoRecentTurns = ctx.recentTurns;
  } catch (e) {
    console.error('Error armando contexto de conversación para realtime:', e);
  }
}

const convoBlock = [
  convoSummary
    ? `=== RESUMEN_PERSISTIDO_CONVERSACION ===\n${convoSummary}\n=== FIN_RESUMEN ===`
    : '',
  convoRecentTurns
    ? `=== ULTIMOS_MENSAJES_CONVERSACION ===\n${convoRecentTurns}\n=== FIN_ULTIMOS ===`
    : '',
]
  .filter(Boolean)
  .join('\n\n');

const mergedContext = [convoBlock, contextPack].filter(Boolean).join('\n\n');

const instructions = buildRealtimeInstructions(DAN_BASE_INSTRUCTIONS, mergedContext);


    const sessionPayload = {
      type: 'realtime',
      model: process.env.DAN_REALTIME_MODEL || 'gpt-realtime',
      output_modalities: [outputModality],
      instructions,
      audio: {
        input: {
          transcription: { language: 'es', model: 'whisper-1' },
        },
        output: {
          voice: process.env.DAN_REALTIME_VOICE || 'verse',
        },
      },
    };

    if (shouldLogRealtimePayload) {
      console.log('[DAN realtime] Payload enviado a OpenAI /v1/realtime/client_secrets:');
      console.log(
        JSON.stringify(
          {
            expires_after: { anchor: 'created_at', seconds: 600 },
            session: sessionPayload,
          },
          null,
          2,
        ),
      );
    }

    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expires_after: { anchor: 'created_at', seconds: 600 },
        session: sessionPayload,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Error OpenAI client_secrets:', text);
      return res.status(500).json({ error: 'No se pudo crear el client_secret de Realtime', details: text });
    }

    const clientSecret = await response.json();
    return res.json(clientSecret);
  } catch (err) {
    console.error('Error en getRealtimeClientSecret:', err);
    return res.status(500).json({ error: 'Error interno al generar el client_secret' });
  }
};

/**
 * POST /api/realtime/topic-shift
 * Body: { sessionId, text }
 */
export const postTopicShiftCheck = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: 'No autorizado.' });

    const { sessionId, text } = req.body || {};
    if (!sessionId || !text) {
      return res.status(400).json({ message: 'Faltan sessionId o text en el body.' });
    }

    const minChars = Math.max(parseInt(process.env.DAN_TOPIC_SHIFT_MIN_CHARS || '80', 10), 20);
    const cooldownMs = Math.max(parseInt(process.env.DAN_TOPIC_SHIFT_COOLDOWN_MS || '25000', 10), 0);
    const ttlMs = Math.max(parseInt(process.env.DAN_TOPIC_SHIFT_TTL_MS || '1800000', 10), 600000);

    const cleanText = String(text).trim();
    if (cleanText.length < minChars) {
      return res.json({ ok: true, shifted: false, reason: 'too_short', similarity: null });
    }

    const cacheKey = `rt_topic::${String(userId)}::${String(sessionId)}`;
    const cached = getCachedMemory(cacheKey);
    const now = Date.now();

    if (cached?.lastUpdatedAt && cooldownMs && now - cached.lastUpdatedAt < cooldownMs) {
      return res.json({ ok: true, shifted: false, reason: 'cooldown', similarity: cached.lastSimilarity ?? null });
    }

    const prevEmbedding = cached?.embedding || null;
    const { shifted, similarity, newEmbedding } = await detectTopicShift({
      previousEmbedding: prevEmbedding,
      newText: cleanText,
      threshold: parseFloat(process.env.DAN_TOPIC_SHIFT_THRESHOLD || '0.78'),
    });

    setCachedMemory(
      cacheKey,
      { embedding: newEmbedding, lastUpdatedAt: now, lastSimilarity: similarity },
      ttlMs
    );

    if (!shifted) {
      return res.json({ ok: true, shifted: false, similarity });
    }

    const ctx = await buildContextPack({
      userId,
      messageText: cleanText,
      metadata: { channel: 'realtime', sessionId: String(sessionId), trigger: 'topic_shift' },
      tokenBudget: parseInt(process.env.DAN_CONTEXT_BUDGET || '1500', 10),
      topK: parseInt(process.env.DAN_CONTEXT_TOPK || '4', 10),
    });

    return res.json({
      ok: true,
      shifted: true,
      similarity,
      context_pack: ctx.contextPack,
      instructions: buildRealtimeInstructions(DAN_BASE_INSTRUCTIONS, ctx.contextPack),
      token_estimate: ctx.tokenEstimate,
      retrieval_debug: ctx.retrievalDebug,
    });
  } catch (err) {
    console.error('Error topic-shift:', err);
    return res.status(500).json({ message: 'Error interno al chequear topic shift' });
  }
};

/**
 * POST /api/realtime/session-save
 * Body: { sessionId, transcript, metadata? }
 * - autosave: NO llama OpenAI, solo persiste transcript (upsert) y toca lastActivityAt
 */
export const postRealtimeSessionSave = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: 'No autorizado.' });

    const { sessionId, transcript, metadata } = req.body || {};
    if (!sessionId || !transcript) {
      return res.status(400).json({ message: 'Faltan sessionId o transcript en el body.' });
    }

    const saved = await upsertSessionTranscript({
      userId,
      sessionId: String(sessionId),
      transcript: String(transcript),
      metadata: { ...(metadata || {}), channel: 'realtime', kind: 'autosave' },
    });

    // ✅ Upsert state: marca actividad para que el reconciler pueda cerrar por silencio
    await upsertRealtimeState({
      userId,
      sessionId: String(sessionId),
      metadata: { ...(metadata || {}), channel: 'realtime', kind: 'autosave' },
      touchActivity: true,
      touchAutosave: true,
      status: 'open',
    });

    console.log('[DAN realtime][SAVE] autosave ok', {
      userId: String(userId),
      sessionId: String(sessionId),
      chars: String(transcript).length,
      transcriptId: String(saved._id),
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('Error en postRealtimeSessionSave:', err);
    return res.status(500).json({ message: 'Error interno en autosave realtime' });
  }
};

/**
 * POST /api/realtime/session-end
 * Body: { sessionId, transcript, metadata?, forceLongTerm? }
 * - finaliza: llama OpenAI (summary/profile/memory)
 */
export const postRealtimeSessionEnd = async (req, res, next) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: 'No autorizado.' });

    const { sessionId, transcript, metadata, forceLongTerm } = req.body || {};
    if (!sessionId || !transcript) {
      return res.status(400).json({ message: 'Faltan sessionId o transcript en el body.' });
    }

    // 1) upsert del transcript “crudo”
    await upsertSessionTranscript({
      userId,
      sessionId: String(sessionId),
      transcript: String(transcript),
      metadata: { ...(metadata || {}), channel: 'realtime', kind: 'final_input' },
    });

    // 2) pipeline completo
    const result = await finalizeRealtimePipeline({
      userId,
      sessionId: String(sessionId),
      transcript: String(transcript),
      metadata: { ...(metadata || {}), channel: 'realtime', kind: 'final' },
      forceLongTerm: Boolean(forceLongTerm),
      finalizedBy: 'client',
    });

    // 3) marcar state como finalized
    await RealtimeSessionState.findOneAndUpdate(
      { userId: oid(userId), sessionId: String(sessionId) },
      {
        $set: {
          status: 'finalized',
          lastFinalizeAt: new Date(),
          finalizedBy: 'client',
          lastError: '',
          metadata: { ...(metadata || {}), lastFinalSummaryId: String(result.summaryDoc?._id || '') },
        },
      },
      { upsert: true, new: true }
    );

    console.log('[DAN realtime][END] saved', {
      userId: String(userId),
      sessionId: String(sessionId),
      finalSessionId: result.finalSessionId,
      user_profile_updated: result.profileResult.updated,
      memory_items_created: result.memoryResult.created,
      long_term_brief_updated: result.longTermResult.updated,
    });

    return res.status(201).json({
      ok: true,
      session_summary_id: result.summaryDoc._id,
      user_profile_updated: result.profileResult.updated,
      memory_items_created: result.memoryResult.created,
      long_term_brief_updated: result.longTermResult.updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/realtime/sessions (compat tool)
 */
export const saveRealtimeSessionSummary = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: 'No autorizado.' });

    const { summary, keyMoments, nextStep, model } = req.body || {};
    if (!summary) {
      return res.status(400).json({ message: 'Falta summary en el body' });
    }

    const sessionDoc = await CoachSession.create({
      owner: userId,
      canal: 'realtime',
      resumen: String(summary),
      puntosClave: Array.isArray(keyMoments) ? keyMoments : [],
      proximoPaso: nextStep ? String(nextStep) : '',
      modelo: model || process.env.DAN_REALTIME_MODEL || 'gpt-realtime',
    });

    return res.status(201).json({ ok: true, session: sessionDoc });
  } catch (err) {
    console.error('Error guardando resumen realtime:', err);
    return res.status(500).json({ message: 'Error interno al guardar resumen realtime' });
  }
};

export const getRealtimeSessions = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: 'No autorizado.' });

    const { format } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '6', 10), 1), 10);

    const sessions = await CoachSession.find({ owner: userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('createdAt resumen puntosClave proximoPaso')
      .lean();

    if (format === 'tool') {
      const context = sessions
        .map((s, i) => {
          const date = s.createdAt ? new Date(s.createdAt).toISOString().slice(0, 10) : 's/f';
          const resumen = (s.resumen ?? '').toString().slice(0, 260);
          const paso = (s.proximoPaso ?? '').toString().slice(0, 140);
          const puntos =
            Array.isArray(s.puntosClave) && s.puntosClave.length
              ? ` | Claves: ${s.puntosClave.slice(0, 3).join(' / ')}`
              : '';
          return `#${i + 1} (${date}) ${resumen}${puntos}${paso ? ` | Próximo paso: ${paso}` : ''}`;
        })
        .join('\n');

      return res.json({ ok: true, context: context || 'Sin sesiones previas.' });
    }

    return res.json({ ok: true, sessions });
  } catch (err) {
    console.error('Error obteniendo sesiones realtime:', err);
    return res.status(500).json({ message: 'Error interno al obtener sesiones realtime' });
  }
};

export const getRealtimeCheckups = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: 'No autorizado.' });

    const { format } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '5', 10), 1), 10);

    const checkups = await Chequeo.find({ owner: userId })
      .sort({ fecha: -1 })
      .limit(limit)
      .select('fecha tipo variable1 variable2 variable3 variable4 variable5 variable6 variable7 audio')
      .lean();

    if (format === 'tool') {
      const context = checkups
        .map((ch, i) => {
          const date = ch.fecha ? new Date(ch.fecha).toISOString().slice(0, 10) : 's/f';
          const vars = [
            ch.variable1 != null && `v1=${ch.variable1}`,
            ch.variable2 != null && `v2=${ch.variable2}`,
            ch.variable3 != null && `v3=${ch.variable3}`,
            ch.variable4 != null && `v4=${ch.variable4}`,
            ch.variable5 != null && `v5=${ch.variable5}`,
            ch.variable6 != null && `v6=${ch.variable6}`,
            ch.variable7 != null && `v7=${ch.variable7}`,
          ].filter(Boolean).join(', ');

          const audioSummary = ch.audio?.summary ? ` | audio: ${(ch.audio.summary + '').slice(0, 120)}` : '';
          const audioTags = Array.isArray(ch.audio?.tags) && ch.audio.tags.length
            ? ` | tags: ${ch.audio.tags.slice(0, 6).join(', ')}`
            : '';

          return `#${i + 1} (${date}) tipo=${ch.tipo ?? 's/tipo'}${vars ? ` | ${vars}` : ''}${audioSummary}${audioTags}`;
        })
        .join('\n');

      return res.json({ ok: true, context: context || 'Sin chequeos previos.' });
    }

    return res.json({ ok: true, checkups });
  } catch (err) {
    console.error('Error obteniendo chequeos realtime:', err);
    return res.status(500).json({ message: 'Error interno al obtener chequeos realtime' });
  }
};
