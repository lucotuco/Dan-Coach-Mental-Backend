import mongoose from 'mongoose';
import crypto from 'crypto';
import { openai } from './openaiClient.js';
import { SessionTranscript } from '../models/SessionTranscript.js';
import { SessionSummary } from '../models/SessionSummary.js';
import { UserProfile } from '../models/UserProfile.js';
import { MemoryItem } from '../models/MemoryItem.js';
import { LongTermBrief } from '../models/LongTermBrief.js';

const DEFAULT_EMBEDDING_MODEL =
  process.env.DAN_EMBEDDING_MODEL || 'text-embedding-3-small';
const DEFAULT_SUMMARY_MODEL =
  process.env.DAN_SUMMARY_MODEL || 'gpt-4.1-mini';

const DEFAULT_CONTEXT_TOKEN_BUDGET = parseInt(
  process.env.DAN_CONTEXT_BUDGET || '1500',
  10
);

const DEFAULT_LONG_TERM_INTERVAL = parseInt(
  process.env.DAN_LONG_TERM_INTERVAL || '5',
  10
);

// ✅ Vector search controls
const USE_ATLAS_VECTOR_SEARCH =
  String(process.env.DAN_USE_ATLAS_VECTOR_SEARCH || 'false').toLowerCase() ===
  'true';

const ATLAS_VECTOR_INDEX =
  process.env.DAN_ATLAS_VECTOR_INDEX || 'memoryItemsVectorIndex';

// Score threshold: evita traer “cosas meh”
const DEFAULT_VECTOR_SCORE_THRESHOLD = parseFloat(
  process.env.DAN_VECTOR_SCORE_THRESHOLD || '0.72'
);

// numCandidates (más = más recall, más costo)
const DEFAULT_VECTOR_NUM_CANDIDATES = parseInt(
  process.env.DAN_VECTOR_NUM_CANDIDATES || '200',
  10
);

// Topic shift
export const DEFAULT_TOPIC_SHIFT_THRESHOLD = parseFloat(
  process.env.DAN_TOPIC_SHIFT_THRESHOLD || '0.78'
);

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function stripCodeFences(text) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((item) => item.replace(/^-+\s*/, '').trim())
      .filter(Boolean);
  }
  return [];
}

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function cosineSimilarity(a = [], b = []) {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function makeTextHash(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

export async function getTextEmbedding(text) {
  if (!openai.apiKey) {
    throw new Error('OpenAI API key is missing. Set OPENAI_API_KEY.');
  }
  const response = await openai.embeddings.create({
    model: DEFAULT_EMBEDDING_MODEL,
    input: text,
  });
  return {
    vector: response.data?.[0]?.embedding || [],
    model: DEFAULT_EMBEDDING_MODEL,
  };
}

async function generateStructuredSummary(transcript) {
  if (!openai.apiKey) {
    throw new Error('OpenAI API key is missing. Set OPENAI_API_KEY.');
  }
  const prompt = `Sos un agente de backend de DAN. Generá un resumen estructurado de la sesión a partir del transcript.

Reglas:
- Respetá el siguiente JSON lógico EXACTO.
- Contenido en español.
- No inventes datos. Si no hay información, dejá campos vacíos o listas vacías.
- "plan_accion", "acuerdos_tareas" y "seguimiento_proximo" deben ser listas de 3 a 6 bullets si hay contenido.
- "confidence" entre 0 y 1.

JSON lógico:
{
  "contexto": "",
  "tema_principal": "",
  "problema_clave": "",
  "hipotesis": "",
  "plan_accion": [],
  "acuerdos_tareas": [],
  "seguimiento_proximo": [],
  "tags": [],
  "confidence": 0.0
}

TRANSCRIPT:
<<<
${transcript}
>>>`;

  const response = await openai.responses.create({
    model: DEFAULT_SUMMARY_MODEL,
    input: [
      {
        role: 'system',
        content: 'Respondé únicamente con JSON válido, sin texto extra.',
      },
      { role: 'user', content: prompt },
    ],
  });

  const raw = stripCodeFences(response.output_text || '');
  const parsed = safeJsonParse(raw);
  if (!parsed) {
    throw new Error('No se pudo generar un JSON válido para el SessionSummary.');
  }
  return parsed;
}

async function inferUserProfileUpdates(transcript) {
  if (!openai.apiKey) {
    throw new Error('OpenAI API key is missing. Set OPENAI_API_KEY.');
  }
  const prompt = `Analizá el transcript y proponé SOLO actualizaciones explícitamente confirmadas por el usuario.
Si no hay actualizaciones explícitas, respondé con {"hasUpdates": false}.

Campos posibles:
- sport
- role
- level
- goals (lista corta)
- competitionContext
- preferences (solo si el usuario lo pidió repetidamente)
- restrictions
- stableFacts (hechos confirmados)
- historyNotes (solo si contradice algo previo)

Respuesta JSON:
{
  "hasUpdates": true|false,
  "updates": {
    "sport": "",
    "role": "",
    "level": "",
    "goals": [],
    "competitionContext": "",
    "preferences": [],
    "restrictions": [],
    "stableFacts": [],
    "historyNotes": []
  }
}

TRANSCRIPT:
<<<
${transcript}
>>>`;

  const response = await openai.responses.create({
    model: DEFAULT_SUMMARY_MODEL,
    input: [
      {
        role: 'system',
        content:
          'Respondé únicamente con JSON válido. No inventes datos ni inferencias psicológicas.',
      },
      { role: 'user', content: prompt },
    ],
  });

  const raw = stripCodeFences(response.output_text || '');
  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed.hasUpdates !== 'boolean') {
    return { hasUpdates: false };
  }
  return parsed;
}

async function buildLongTermBriefFromSummaries(summaries) {
  if (!openai.apiKey) {
    throw new Error('OpenAI API key is missing. Set OPENAI_API_KEY.');
  }
  const prompt = `Generá un brief de largo plazo (2000-3000 caracteres máx) basado en estos resúmenes.
Incluir:
- patrones confirmados
- palancas que funcionaron / no funcionaron
- estilo preferido
- objetivos vigentes
Escribí en español, en bullets cortos. No inventes datos.

Resúmenes:
${summaries.map((summary, idx) => `#${idx + 1}\n${summary}`).join('\n')}`;

  const response = await openai.responses.create({
    model: DEFAULT_SUMMARY_MODEL,
    input: [
      {
        role: 'system',
        content:
          'Respondé únicamente con texto en bullets, sin encabezados adicionales.',
      },
      { role: 'user', content: prompt },
    ],
  });

  return (response.output_text || '').trim();
}

function summaryToMemoryItems(summary) {
  const items = [];
  const plan = normalizeList(summary.plan_accion);
  const tareas = normalizeList(summary.acuerdos_tareas);
  const tags = normalizeList(summary.tags);

  if (plan.length) {
    items.push({
      text: `Plan de acción reciente:\n- ${plan.slice(0, 6).join('\n- ')}`,
      tags,
    });
  }

  if (tareas.length) {
    items.push({
      text: `Acuerdos y tareas:\n- ${tareas.slice(0, 6).join('\n- ')}`,
      tags,
    });
  }

  const tema = summary.tema_principal?.trim();
  const problema = summary.problema_clave?.trim();
  if (tema || problema) {
    items.push({
      text: `Tema clave: ${tema || 'sin tema'}${problema ? ` | Problema: ${problema}` : ''}`,
      tags,
    });
  }

  return items.slice(0, 6);
}

export async function saveSessionTranscript({
  userId,
  sessionId,
  transcript,
  metadata,
}) {
  try {
    return await SessionTranscript.create({
      userId,
      sessionId,
      transcript,
      metadata,
    });
  } catch (e) {
    const existing = await SessionTranscript.findOne({ userId, sessionId });
    if (existing) return existing;
    throw e;
  }
}

export async function createSessionSummary({ userId, sessionId, transcript }) {
  const parsed = await generateStructuredSummary(transcript);
  try {
    return await SessionSummary.create({
      userId,
      sessionId,
      contexto: parsed.contexto || '',
      tema_principal: parsed.tema_principal || '',
      problema_clave: parsed.problema_clave || '',
      hipotesis: parsed.hipotesis || '',
      plan_accion: normalizeList(parsed.plan_accion),
      acuerdos_tareas: normalizeList(parsed.acuerdos_tareas),
      seguimiento_proximo: normalizeList(parsed.seguimiento_proximo),
      tags: normalizeList(parsed.tags),
      confidence:
        typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    });
  } catch (e) {
    const existing = await SessionSummary.findOne({ userId, sessionId });
    if (existing) return existing;
    throw e;
  }
}

export async function updateUserProfileFromTranscript({ userId, transcript }) {
  const profileUpdate = await inferUserProfileUpdates(transcript);
  if (!profileUpdate.hasUpdates || !profileUpdate.updates) {
    return { updated: false };
  }

  const updates = profileUpdate.updates || {};
  const updatePayload = {};
  const listFields = [
    'goals',
    'preferences',
    'restrictions',
    'stableFacts',
    'historyNotes',
  ];

  if (updates.sport) updatePayload.sport = updates.sport;
  if (updates.role) updatePayload.role = updates.role;
  if (updates.level) updatePayload.level = updates.level;
  if (updates.competitionContext) {
    updatePayload.competitionContext = updates.competitionContext;
  }

  listFields.forEach((field) => {
    if (Array.isArray(updates[field]) && updates[field].length) {
      updatePayload[field] = updates[field].map(String);
    }
  });

  if (!Object.keys(updatePayload).length) {
    return { updated: false };
  }

  await UserProfile.findOneAndUpdate(
    { userId },
    { $set: updatePayload },
    { upsert: true, new: true }
  );

  return { updated: true };
}

export async function createMemoryItemsFromSummary({
  userId,
  sessionId,
  summary,
}) {
  const memoryItems = summaryToMemoryItems(summary);
  if (!memoryItems.length) {
    return { created: 0 };
  }

  const embeddedItems = [];
  for (const item of memoryItems) {
    const embedding = await getTextEmbedding(item.text);
    embeddedItems.push({
      userId,
      sourceSessionId: sessionId,
      text: item.text,
      textHash: makeTextHash(item.text),
      tags: item.tags || [],
      embedding: embedding.vector,
      embeddingModel: embedding.model,
    });
  }

  let inserted = 0;
  try {
    const docs = await MemoryItem.insertMany(embeddedItems, { ordered: false });
    inserted = docs.length;
  } catch (e) {
    const msg = String(e?.message || '');
    if (!msg.includes('E11000')) throw e;
    inserted = 0;
  }

  return { created: inserted };
}

export async function refreshLongTermBriefIfNeeded({ userId, force = false }) {
  const count = await SessionSummary.countDocuments({ userId });
  if (!force && count % DEFAULT_LONG_TERM_INTERVAL !== 0) {
    return { updated: false };
  }

  const summaries = await SessionSummary.find({ userId })
    .sort({ date: -1 })
    .limit(DEFAULT_LONG_TERM_INTERVAL)
    .lean();

  if (!summaries.length) {
    return { updated: false };
  }

  const summaryTexts = summaries.map(
    (summary) =>
      `Contexto: ${summary.contexto}\nTema: ${summary.tema_principal}\nProblema: ${summary.problema_clave}\nPlan: ${summary.plan_accion?.join(
        '; '
      )}\nTareas: ${summary.acuerdos_tareas?.join('; ')}`
  );

  const briefText = await buildLongTermBriefFromSummaries(summaryTexts);
  await LongTermBrief.findOneAndUpdate(
    { userId },
    {
      $set: {
        text: briefText,
        sourceSessionIds: summaries.map((summary) => summary.sessionId),
      },
    },
    { upsert: true, new: true }
  );

  return { updated: true };
}

// ✅ Atlas Vector Search retrieval
async function retrieveMemoriesAtlasVector({
  userId,
  queryVector,
  topK,
  numCandidates,
  scoreThreshold,
}) {
  const userObjectId =
    typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

  const pipeline = [
    {
      $vectorSearch: {
        index: ATLAS_VECTOR_INDEX,
        path: 'embedding',
        queryVector,
        numCandidates,
        limit: topK,
        filter: { userId: userObjectId },
      },
    },
    {
      $project: {
        text: 1,
        tags: 1,
        userId: 1,
        sourceSessionId: 1,
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ];

  const results = await MemoryItem.aggregate(pipeline);
  return results.filter((r) =>
    typeof r.score === 'number' ? r.score >= scoreThreshold : false
  );
}

export async function buildContextPack({
  userId,
  messageText,
  metadata = {},
  tokenBudget = DEFAULT_CONTEXT_TOKEN_BUDGET,
  topK = 4,
}) {
  const [profile, brief, lastSummary] = await Promise.all([
    UserProfile.findOne({ userId }).lean(),
    LongTermBrief.findOne({ userId }).lean(),
    SessionSummary.findOne({ userId }).sort({ date: -1 }).lean(),
  ]);

  const queryEmbedding = await getTextEmbedding(messageText);

  // ✅ Retrieval: Vector Search (Atlas) o fallback a cosine local
  let retrieved = [];
  let retrievalMode = 'atlas_vector';

  try {
    if (USE_ATLAS_VECTOR_SEARCH) {
      retrieved = await retrieveMemoriesAtlasVector({
        userId,
        queryVector: queryEmbedding.vector,
        topK,
        numCandidates: DEFAULT_VECTOR_NUM_CANDIDATES,
        scoreThreshold: DEFAULT_VECTOR_SCORE_THRESHOLD,
      });
    } else {
      retrievalMode = 'local_cosine';
      const memoryItems = await MemoryItem.find({ userId }).lean();
      const scoredItems = memoryItems
        .map((item) => ({
          item,
          score: cosineSimilarity(queryEmbedding.vector, item.embedding),
        }))
        .sort((a, b) => b.score - a.score)
        .filter((e) => e.score > 0)
        .slice(0, topK);

      retrieved = scoredItems.map((e) => ({
        ...e.item,
        score: e.score,
      }));
    }
  } catch (e) {
    retrievalMode = 'fallback_local_cosine';
    const memoryItems = await MemoryItem.find({ userId }).lean();
    const scoredItems = memoryItems
      .map((item) => ({
        item,
        score: cosineSimilarity(queryEmbedding.vector, item.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .filter((e) => e.score > 0)
      .slice(0, topK);

    retrieved = scoredItems.map((e) => ({
      ...e.item,
      score: e.score,
    }));
  }

  const coachingRules = [
    'Seguir la intención del usuario: responder primero en el carril que pide (táctica/planificación/competencia/mentalidad).',
    'La memoria se usa para personalizar y dar continuidad, no para redirigir el tema.',
    'Si se menciona mentalidad, debe ser opcional y breve salvo que el usuario lo pida explícitamente.',
    'Hacer seguimiento real: si hay acuerdos/tareas, preguntar por resultados de forma corta.',
  ];

  const userProfileLines = [];
  if (profile?.sport) userProfileLines.push(`- Deporte: ${profile.sport}`);
  if (profile?.role) userProfileLines.push(`- Rol/posición: ${profile.role}`);
  if (profile?.level) userProfileLines.push(`- Nivel: ${profile.level}`);
  if (profile?.goals?.length)
    userProfileLines.push(`- Objetivos: ${profile.goals.join('; ')}`);
  if (profile?.competitionContext)
    userProfileLines.push(
      `- Contexto competitivo: ${profile.competitionContext}`
    );
  if (profile?.preferences?.length)
    userProfileLines.push(`- Preferencias: ${profile.preferences.join('; ')}`);
  if (profile?.restrictions?.length)
    userProfileLines.push(
      `- Restricciones: ${profile.restrictions.join('; ')}`
    );
  if (profile?.stableFacts?.length)
    userProfileLines.push(
      `- Hechos estables: ${profile.stableFacts.join('; ')}`
    );
  if (profile?.historyNotes?.length)
    userProfileLines.push(
      `- Notas históricas: ${profile.historyNotes.join('; ')}`
    );

  const lastSummaryLines = [];
  if (lastSummary) {
    if (lastSummary.contexto) lastSummaryLines.push(`- Contexto: ${lastSummary.contexto}`);
    if (lastSummary.tema_principal) lastSummaryLines.push(`- Tema principal: ${lastSummary.tema_principal}`);
    if (lastSummary.problema_clave) lastSummaryLines.push(`- Problema clave: ${lastSummary.problema_clave}`);
    if (lastSummary.plan_accion?.length)
      lastSummaryLines.push(`- Plan acción: ${lastSummary.plan_accion.join('; ')}`);
    if (lastSummary.acuerdos_tareas?.length)
      lastSummaryLines.push(`- Acuerdos/tareas: ${lastSummary.acuerdos_tareas.join('; ')}`);
    if (lastSummary.seguimiento_proximo?.length)
      lastSummaryLines.push(`- Seguimiento próximo: ${lastSummary.seguimiento_proximo.join('; ')}`);
  }

  const briefLines = brief?.text
    ? brief.text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 6)
        .map((l) => (l.startsWith('-') ? l : `- ${l}`))
    : [];

  const memoryLines = retrieved.map((item) => {
    const bullets = (item.text || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 3)
      .map((l) => (l.startsWith('-') ? l : `- ${l}`));
    return `- (item_id: ${item._id}) (score: ${
      typeof item.score === 'number' ? item.score.toFixed(3) : 'n/a'
    })\n${bullets.join('\n')}`;
  });

  let contextPack = [
    'USER_PROFILE:',
    userProfileLines.length ? userProfileLines.join('\n') : '- (sin datos)',
    'LONG_TERM_BRIEF:',
    briefLines.length ? briefLines.join('\n') : '- (sin datos)',
    'LAST_SESSION_SUMMARY:',
    lastSummaryLines.length ? lastSummaryLines.join('\n') : '- (sin datos)',
    'RELEVANT_MEMORIES:',
    memoryLines.length ? memoryLines.join('\n') : '- (sin datos)',
    'COACHING_STYLE_RULES:',
    coachingRules.map((r) => `- ${r}`).join('\n'),
  ].join('\n');

  let tokens = estimateTokens(contextPack);
  if (tokens > tokenBudget && memoryLines.length > 2) {
    const trimmedMemory = memoryLines.slice(0, 2);
    contextPack = contextPack.replace(
      /RELEVANT_MEMORIES:[\s\S]*?COACHING_STYLE_RULES:/m,
      `RELEVANT_MEMORIES:\n${trimmedMemory.join('\n')}\nCOACHING_STYLE_RULES:`
    );
  }
  tokens = estimateTokens(contextPack);

  return {
    contextPack,
    retrievalDebug: retrieved.map((item) => ({
      id: item._id,
      score: item.score,
      tags: item.tags,
      sourceSessionId: item.sourceSessionId,
    })),
    tokenEstimate: tokens,
    metadata: { ...metadata, retrievalMode, index: ATLAS_VECTOR_INDEX },
    queryEmbedding: queryEmbedding.vector,
  };
}

// ✅ Topic shift detector (realtime refresh)
export async function detectTopicShift({
  previousEmbedding,
  newText,
  threshold = parseFloat(process.env.DAN_TOPIC_SHIFT_THRESHOLD || '0.78'),
}) {
  const embedding = await createEmbedding(newText);

  if (!previousEmbedding || !Array.isArray(previousEmbedding) || !previousEmbedding.length) {
    return { shifted: false, similarity: 1, newEmbedding: embedding.vector };
  }

  const similarity = cosineSimilarity(previousEmbedding, embedding.vector);
  return { shifted: similarity < threshold, similarity, newEmbedding: embedding.vector };
}

