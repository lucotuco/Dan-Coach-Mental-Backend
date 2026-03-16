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
import { Checkin } from '../models/Chequeo.js';
import { WeeklyPlan } from '../models/Plan.js';
import { getWeekStart } from '../services/weekStart.js';
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

const DAN_BASE_INSTRUCTIONS = `Sos DAN, coach deportivo enfocado en TÁCTICA y ESTRATEGIA (no técnica).
Tu objetivo es ayudar a deportistas a: leer el juego, decidir mejor, armar planes simples (Plan A/B), ajustar durante la competencia y revisar después.

Alcance (importante):
- NO sos entrenador técnico: no corregís gesto/biomecánica. Si piden técnica, reconducí a principios tácticos y decisiones.
- NO sos médico/psicólogo/terapeuta: no diagnósticos ni medicación.

Mentalidad (regla central):
- Mentalidad ES OPCIONAL y REACTIVA: solo la abordás si el usuario la menciona (presión, nervios, foco, confianza, frustración, motivación, etc.) o si te dicen que “se bloquean”.
- Si no aparece, NO la metas. No sermones. No tips mentales “por las dudas”.
- Si aparece, acompañás breve y práctico (1 herramienta simple) y volvés al plan táctico.

Modo de trabajo(no es una guia exacta, es para que veas el camino que podes tomar pero debes ir ajustando sobre la marcha):
1) Respondé primero en el carril pedido (táctica/estrategia/plan/revisión).
2) siempre hacer preguntas, lo mas importante es que el usuario te de mucha informacion para dsp poder darle un mejor plan de accion, o que lo piensen entre los 2
3) Si falta info, hacé 2–3 preguntas cortas (rival, rol, contexto, objetivo).
4) Entregá algo accionable: checklist / plan de 3–5 pasos / reglas “si pasa A → hacé X”.
5) Cerrá con un “próximo paso” concreto.

siempre arrancar la sesion con un saludo cercano y preguntar que quiere conversar hoy, o en que te puedo ayudar. no traer directo un tema.

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

// ✅ SUMAR CONTEXTO APP NUEVA (plan + checkins) al instructions
let memberContext = '';
if (userId) {
  try {
    memberContext =
      `=== APP_CONTEXT (plan + checkins) ===\n` +
      (await buildMemberContextText(userId, { weeks: 8 })) +
      `\n=== FIN_APP_CONTEXT ===`;
  } catch (e) {
    console.error('Error armando memberContext:', e);
  }
}

const mergedContext = [convoBlock, contextPack, memberContext].filter(Boolean).join('\n\n');
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
export const getRealtimeMemberContext = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: 'No autorizado.' });

    const weeks = Math.min(Math.max(parseInt(req.query.weeks ?? '8', 10), 1), 12);

    // 1) último check-in y últimos N
    const last = await Checkin.find({ userId: oid(userId) })
      .sort({ weekStart: -1 })
      .limit(weeks)
      .select('weekStart scores notes createdAt')
      .lean();

    // 2) plan actual
    const weekStart = getWeekStart(new Date());
    const currentPlan = await WeeklyPlan.findOne({ userId: oid(userId), weekStart })
      .select('weekStart focusAxes items status')
      .lean();

    const planPct = currentPlan?.items?.length
      ? Number(((currentPlan.items.filter(i => i.done).length / currentPlan.items.length) * 100).toFixed(1))
      : 0;

    // 3) formateo para DAN (texto compacto)
    const lines = [];
    if (currentPlan) {
      lines.push(`PLAN_SEMANAL_ACTUAL (${new Date(currentPlan.weekStart).toISOString().slice(0,10)}): foco=${(currentPlan.focusAxes||[]).join(', ')} | status=${currentPlan.status} | progreso=${planPct}%`);
      const topTodo = (currentPlan.items || []).filter(i => !i.done).slice(0, 6).map(i => `- [ ] (${i.axis}) ${i.title}`).join('\n');
      const topDone = (currentPlan.items || []).filter(i => i.done).slice(0, 4).map(i => `- [x] (${i.axis}) ${i.title}`).join('\n');
      if (topTodo) lines.push(`ITEMS_PENDIENTES:\n${topTodo}`);
      if (topDone) lines.push(`ITEMS_HECHOS:\n${topDone}`);
    } else {
      lines.push('PLAN_SEMANAL_ACTUAL: (no hay plan aún)');
    }

    if (last.length) {
      lines.push(`CHECKINS_ULTIMAS_${last.length}_SEMANAS (más reciente primero):`);
      for (const c of last) {
        const d = c.weekStart ? new Date(c.weekStart).toISOString().slice(0,10) : 's/f';
        const scores = c.scores ? Object.entries(c.scores).map(([k,v]) => `${k}=${Number(v).toFixed(1)}`).join(' | ') : '(sin scores)';
        const notes = (c.notes || '').toString().trim();
        lines.push(`- ${d} :: ${scores}${notes ? ` :: notes="${notes.slice(0,180)}"` : ''}`);
      }
    } else {
      lines.push('CHECKINS: (sin historial)');
    }

    return res.json({
      ok: true,
      context: lines.join('\n'),
      raw: { currentPlan, lastCheckins: last }, // opcional para debug
    });
  } catch (err) {
    console.error('Error getRealtimeMemberContext:', err);
    return res.status(500).json({ message: 'Error interno al armar contexto member' });
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
// ===== MEMBER CONTEXT (app nueva: Checkin + WeeklyPlan) =====

async function buildMemberContextText(userId, { weeks = 8 } = {}) {
  const w = Math.min(Math.max(parseInt(String(weeks ?? 8), 10) || 8, 1), 12);

  // 1) últimos check-ins (app nueva)
  const last = await Checkin.find({ userId: oid(userId) })
    .sort({ weekStart: -1 })
    .limit(w)
    .select('weekStart scores notes createdAt')
    .lean();

  // 2) plan semanal actual
  const weekStart = getWeekStart(new Date());
  const currentPlan = await WeeklyPlan.findOne({ userId: oid(userId), weekStart })
    .select('weekStart focusAxes items status')
    .lean();

  const planPct = currentPlan?.items?.length
    ? Number(((currentPlan.items.filter((i) => i.done).length / currentPlan.items.length) * 100).toFixed(1))
    : 0;

  const lines = [];

  if (currentPlan) {
    const ws = currentPlan.weekStart ? new Date(currentPlan.weekStart).toISOString().slice(0, 10) : 's/f';
    lines.push(
      `PLAN_SEMANAL_ACTUAL (${ws}): foco=${(currentPlan.focusAxes || []).join(', ')} | status=${currentPlan.status} | progreso=${planPct}%`
    );

    const topTodo = (currentPlan.items || [])
      .filter((i) => !i.done)
      .slice(0, 8)
      .map((i) => `- [ ] (${i.axis}) ${i.title}`)
      .join('\n');

    const topDone = (currentPlan.items || [])
      .filter((i) => i.done)
      .slice(0, 5)
      .map((i) => `- [x] (${i.axis}) ${i.title}`)
      .join('\n');

    if (topTodo) lines.push(`ITEMS_PENDIENTES:\n${topTodo}`);
    if (topDone) lines.push(`ITEMS_HECHOS:\n${topDone}`);
  } else {
    lines.push('PLAN_SEMANAL_ACTUAL: (no hay plan aún)');
  }

  if (last.length) {
    lines.push(`CHECKINS_ULTIMAS_${last.length}_SEMANAS (más reciente primero):`);
    for (const c of last) {
      const d = c.weekStart ? new Date(c.weekStart).toISOString().slice(0, 10) : 's/f';
      const scores = c.scores
        ? Object.entries(c.scores)
            .map(([k, v]) => `${k}=${Number(v).toFixed(1)}`)
            .join(' | ')
        : '(sin scores)';
      const notes = (c.notes || '').toString().trim();
      lines.push(`- ${d} :: ${scores}${notes ? ` :: notes="${notes.slice(0, 180)}"` : ''}`);
    }
  } else {
    lines.push('CHECKINS: (sin historial)');
  }

  return lines.join('\n');
}

/**
 * GET /api/realtime/member-context?weeks=8
 * Devuelve texto “tool-friendly” con plan actual + últimos checkins.
 */
export const getRealtimeMemberContext = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: 'No autorizado.' });

    const weeks = req.query.weeks ?? req.query.limit ?? 8;
    const context = await buildMemberContextText(userId, { weeks });

    return res.json({ ok: true, context });
  } catch (err) {
    console.error('Error getRealtimeMemberContext:', err);
    return res.status(500).json({ message: 'Error interno al armar contexto member' });
  }
};

