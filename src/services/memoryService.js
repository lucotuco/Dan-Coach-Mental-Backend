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

function cosineSimilarity(a = [], b = []) {
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

async function createEmbedding(text) {
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

Transcript:
"""${transcript}"""`;

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

Transcript:
"""${transcript}"""`;

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
  return SessionTranscript.create({
    userId,
    sessionId,
    transcript,
    metadata,
  });
}

export async function createSessionSummary({ userId, sessionId, transcript }) {
  const parsed = await generateStructuredSummary(transcript);
  const summaryDoc = await SessionSummary.create({
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

  return summaryDoc;
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
    const embedding = await createEmbedding(item.text);
    embeddedItems.push({
      userId,
      sourceSessionId: sessionId,
      text: item.text,
      tags: item.tags || [],
      embedding: embedding.vector,
      embeddingModel: embedding.model,
    });
  }

  const docs = await MemoryItem.insertMany(embeddedItems);
  return { created: docs.length };
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

  const queryEmbedding = await createEmbedding(messageText);
  const memoryItems = await MemoryItem.find({ userId }).lean();

  const scoredItems = memoryItems
    .map((item) => ({
      item,
      score: cosineSimilarity(queryEmbedding.vector, item.embedding),
    }))
    .sort((a, b) => b.score - a.score);

  const filteredItems = scoredItems
    .filter((entry) => entry.score > 0)
    .slice(0, topK);

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
    userProfileLines.push(`- Contexto competitivo: ${profile.competitionContext}`);
  if (profile?.preferences?.length)
    userProfileLines.push(
      `- Preferencias: ${profile.preferences.join('; ')}`
    );
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
    if (lastSummary.tema_principal)
      lastSummaryLines.push(`- Tema principal: ${lastSummary.tema_principal}`);
    if (lastSummary.problema_clave)
      lastSummaryLines.push(`- Problema clave: ${lastSummary.problema_clave}`);
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
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 6)
        .map((line) => (line.startsWith('-') ? line : `- ${line}`))
    : [];

  const memoryLines = filteredItems.map((entry) => {
    const bullets = entry.item.text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 3)
      .map((line) => (line.startsWith('-') ? line : `- ${line}`));
    return `- (item_id: ${entry.item._id})\n${bullets.join('\n')}`;
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
    coachingRules.map((rule) => `- ${rule}`).join('\n'),
    'OPEN_LOOPS:',
    'Tareas pendientes:',
    lastSummary?.acuerdos_tareas?.length
      ? lastSummary.acuerdos_tareas
          .slice(0, 4)
          .map((task) => `- ${task}`)
          .join('\n')
      : '- (sin tareas pendientes)',
    'Preguntas sugeridas:',
    lastSummary?.seguimiento_proximo?.length
      ? lastSummary.seguimiento_proximo
          .slice(0, 4)
          .map((question) => `- ${question}`)
          .join('\n')
      : '- (sin preguntas sugeridas)',
  ].join('\n');

  let currentTokens = estimateTokens(contextPack);
  let adjustedMemoryLines = [...memoryLines];
  let adjustedBriefLines = [...briefLines];
  let adjustedLastSummaryLines = [...lastSummaryLines];
  let adjustedUserProfileLines = [...userProfileLines];

  if (currentTokens > tokenBudget && adjustedMemoryLines.length > 2) {
    adjustedMemoryLines = adjustedMemoryLines.slice(0, 2);
  }
  contextPack = [
    'USER_PROFILE:',
    adjustedUserProfileLines.length ? adjustedUserProfileLines.join('\n') : '- (sin datos)',
    'LONG_TERM_BRIEF:',
    adjustedBriefLines.length ? adjustedBriefLines.join('\n') : '- (sin datos)',
    'LAST_SESSION_SUMMARY:',
    adjustedLastSummaryLines.length ? adjustedLastSummaryLines.join('\n') : '- (sin datos)',
    'RELEVANT_MEMORIES:',
    adjustedMemoryLines.length ? adjustedMemoryLines.join('\n') : '- (sin datos)',
    'COACHING_STYLE_RULES:',
    coachingRules.map((rule) => `- ${rule}`).join('\n'),
    'OPEN_LOOPS:',
    'Tareas pendientes:',
    lastSummary?.acuerdos_tareas?.length
      ? lastSummary.acuerdos_tareas
          .slice(0, 4)
          .map((task) => `- ${task}`)
          .join('\n')
      : '- (sin tareas pendientes)',
    'Preguntas sugeridas:',
    lastSummary?.seguimiento_proximo?.length
      ? lastSummary.seguimiento_proximo
          .slice(0, 4)
          .map((question) => `- ${question}`)
          .join('\n')
      : '- (sin preguntas sugeridas)',
  ].join('\n');
  currentTokens = estimateTokens(contextPack);

  if (currentTokens > tokenBudget && adjustedBriefLines.length) {
    adjustedBriefLines = adjustedBriefLines.slice(0, 3);
  }
  contextPack = [
    'USER_PROFILE:',
    adjustedUserProfileLines.length ? adjustedUserProfileLines.join('\n') : '- (sin datos)',
    'LONG_TERM_BRIEF:',
    adjustedBriefLines.length ? adjustedBriefLines.join('\n') : '- (sin datos)',
    'LAST_SESSION_SUMMARY:',
    adjustedLastSummaryLines.length ? adjustedLastSummaryLines.join('\n') : '- (sin datos)',
    'RELEVANT_MEMORIES:',
    adjustedMemoryLines.length ? adjustedMemoryLines.join('\n') : '- (sin datos)',
    'COACHING_STYLE_RULES:',
    coachingRules.map((rule) => `- ${rule}`).join('\n'),
    'OPEN_LOOPS:',
    'Tareas pendientes:',
    lastSummary?.acuerdos_tareas?.length
      ? lastSummary.acuerdos_tareas
          .slice(0, 4)
          .map((task) => `- ${task}`)
          .join('\n')
      : '- (sin tareas pendientes)',
    'Preguntas sugeridas:',
    lastSummary?.seguimiento_proximo?.length
      ? lastSummary.seguimiento_proximo
          .slice(0, 4)
          .map((question) => `- ${question}`)
          .join('\n')
      : '- (sin preguntas sugeridas)',
  ].join('\n');
  currentTokens = estimateTokens(contextPack);

  if (currentTokens > tokenBudget && adjustedLastSummaryLines.length > 5) {
    adjustedLastSummaryLines = adjustedLastSummaryLines.slice(0, 5);
  }
  contextPack = [
    'USER_PROFILE:',
    adjustedUserProfileLines.length ? adjustedUserProfileLines.join('\n') : '- (sin datos)',
    'LONG_TERM_BRIEF:',
    adjustedBriefLines.length ? adjustedBriefLines.join('\n') : '- (sin datos)',
    'LAST_SESSION_SUMMARY:',
    adjustedLastSummaryLines.length ? adjustedLastSummaryLines.join('\n') : '- (sin datos)',
    'RELEVANT_MEMORIES:',
    adjustedMemoryLines.length ? adjustedMemoryLines.join('\n') : '- (sin datos)',
    'COACHING_STYLE_RULES:',
    coachingRules.map((rule) => `- ${rule}`).join('\n'),
    'OPEN_LOOPS:',
    'Tareas pendientes:',
    lastSummary?.acuerdos_tareas?.length
      ? lastSummary.acuerdos_tareas
          .slice(0, 4)
          .map((task) => `- ${task}`)
          .join('\n')
      : '- (sin tareas pendientes)',
    'Preguntas sugeridas:',
    lastSummary?.seguimiento_proximo?.length
      ? lastSummary.seguimiento_proximo
          .slice(0, 4)
          .map((question) => `- ${question}`)
          .join('\n')
      : '- (sin preguntas sugeridas)',
  ].join('\n');
  currentTokens = estimateTokens(contextPack);

  if (currentTokens > tokenBudget && adjustedUserProfileLines.length > 8) {
    adjustedUserProfileLines = adjustedUserProfileLines.slice(0, 8);
  }

  contextPack = [
    'USER_PROFILE:',
    adjustedUserProfileLines.length ? adjustedUserProfileLines.join('\n') : '- (sin datos)',
    'LONG_TERM_BRIEF:',
    adjustedBriefLines.length ? adjustedBriefLines.join('\n') : '- (sin datos)',
    'LAST_SESSION_SUMMARY:',
    adjustedLastSummaryLines.length ? adjustedLastSummaryLines.join('\n') : '- (sin datos)',
    'RELEVANT_MEMORIES:',
    adjustedMemoryLines.length ? adjustedMemoryLines.join('\n') : '- (sin datos)',
    'COACHING_STYLE_RULES:',
    coachingRules.map((rule) => `- ${rule}`).join('\n'),
    'OPEN_LOOPS:',
    'Tareas pendientes:',
    lastSummary?.acuerdos_tareas?.length
      ? lastSummary.acuerdos_tareas
          .slice(0, 4)
          .map((task) => `- ${task}`)
          .join('\n')
      : '- (sin tareas pendientes)',
    'Preguntas sugeridas:',
    lastSummary?.seguimiento_proximo?.length
      ? lastSummary.seguimiento_proximo
          .slice(0, 4)
          .map((question) => `- ${question}`)
          .join('\n')
      : '- (sin preguntas sugeridas)',
  ].join('\n');
  currentTokens = estimateTokens(contextPack);

  return {
    contextPack,
    retrievalDebug: filteredItems.map((entry) => ({
      id: entry.item._id,
      score: entry.score,
      tags: entry.item.tags,
    })),
    tokenEstimate: currentTokens,
    metadata,
  };
}
