import { openai } from './openaiClient.js';

const shouldLogDanPayload =
  process.env.DAN_LOG_PROMPTS === '1' || process.env.DAN_LOG_PROMPTS === 'true';

const defaultSystemPrompt = `Sos DAN, coach de rendimiento deportivo. Tu objetivo es ayudar a deportistas a mejorar rendimiento con foco en:
- estrategia y táctica (lectura del juego, decisiones, planes)
- planificación (rutinas, objetivos, carga/descarga a nivel general; NO técnica)
- preparación y revisión de competencia (pre/durante/post)
- mentalidad y herramientas mentales SOLO cuando suman y de forma opcional (no lo impongas)

Límites: NO sos médico, psicólogo, psiquiatra ni terapeuta. No das diagnósticos ni medicación. No das corrección técnica fina del gesto (biomecánica) porque no ves la técnica. Podés hablar de principios tácticos/estratégicos, hábitos, preparación y toma de decisiones.

Regla de oro de conversación (NO negociable):
1) Seguí la intención del usuario: respondé primero en el carril que pide (táctica / planificación / competencia / mentalidad).
2) Usá la memoria para personalizar y dar continuidad, no para redirigir el tema.
3) Mentalidad: si no te lo piden, como máximo ofrecé 1 sugerencia opcional y breve (1–2 líneas) relacionada con lo que está trabajando.
4) Cerrá con un siguiente paso concreto o una pregunta corta.

Tono: cercano, rioplatense (“vos”), claro, práctico, sin sermón. Frases cortas, accionables.`;

function buildProfileSummary(user) {
  const profile = user?.danProfile || {};
  const summaryParts = [
    user?.name && `Nombre: ${user.name}`,
    user?.birthDate &&
      `Fecha de nacimiento: ${new Date(user.birthDate).toISOString().slice(0, 10)}`,
    user?.sport && `Deporte principal: ${user.sport}`,
    user?.competitionType && `Tipo de competencia: ${user.competitionType}`,
    user?.level && `Nivel declarado: ${user.level}`,
    profile?.sport && `Deporte (perfil DAN): ${profile.sport}`,
  ].filter(Boolean);

  if (!summaryParts.length) return 'No hay perfil deportivo disponible.';
  return summaryParts.join(' | ');
}

function buildChequeosSummary(chequeos = []) {
  if (!Array.isArray(chequeos) || chequeos.length === 0) {
    return 'Sin chequeos registrados.';
  }

  return chequeos
    .map((chequeo) => {
      const date = chequeo.fecha
        ? new Date(chequeo.fecha).toISOString().slice(0, 10)
        : 'Fecha no disponible';

      const variables = [
        chequeo.variable1 !== undefined && `v1:${chequeo.variable1}`,
        chequeo.variable2 !== undefined && `v2:${chequeo.variable2}`,
        chequeo.variable3 !== undefined && `v3:${chequeo.variable3}`,
        chequeo.variable4 !== undefined && `v4:${chequeo.variable4}`,
        chequeo.variable5 !== undefined && `v5:${chequeo.variable5}`,
        chequeo.variable6 !== undefined && `v6:${chequeo.variable6}`,
        chequeo.variable7 !== undefined && `v7:${chequeo.variable7}`,
      ]
        .filter(Boolean)
        .join(', ');

      const variablesSummary = variables || 'Sin variables registradas';
      const contextoAudio = chequeo?.audio?.summary || '';
      const audioTags = Array.isArray(chequeo?.audio?.tags)
        ? chequeo.audio.tags.join(', ')
        : '';

      const audioPart =
        contextoAudio || audioTags
          ? ` | audio resumen: ${contextoAudio || '(sin resumen)'} | audio tags: ${
              audioTags || '(sin tags)'
            }`
          : '';

      return `Chequeo (${chequeo.tipo || 'sin tipo'}) - Fecha: ${date} - ${variablesSummary}${audioPart}`;
    })
    .join('\n');
}

function clampText(text, maxChars = 6000) {
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return text.slice(-maxChars); // conserva lo más reciente
}

export function buildSystemMessage(user, conversation, chequeos, contextPack) {
  const profileSummary = buildProfileSummary(user);
  const previousSummary = conversation?.historySummary || 'Sin historial previo.';
  const chequeosSummary = buildChequeosSummary(chequeos);

  // OJO: historySummary no debería crecer infinito
  const safePreviousSummary = clampText(previousSummary, 4000);

  return [
    defaultSystemPrompt,
    `Perfil del usuario: ${profileSummary}`,
    `Resumen del historial (compacto): ${safePreviousSummary}`,
    `Resumen de los chequeos (últimos 5): ${chequeosSummary}`,
    contextPack ? `\n\n=== CONTEXT_PACK (memoria recuperada) ===\n${contextPack}\n=== FIN CONTEXT_PACK ===\n` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildHistorySummary(existingSummary, userMessage, danReply) {
  const parts = [existingSummary].filter(Boolean);
  parts.push(`Usuario: ${userMessage}`);
  parts.push(`Dan: ${danReply}`);

  // evita crecimiento infinito
  return clampText(parts.join('\n'), 6000);
}

export async function chatWithDan({
  user,
  conversation,
  messageText,
  chequeos = [],
  contextPack = '',
}) {
  if (!openai.apiKey) {
    throw new Error('OpenAI API key is missing. Set OPENAI_API_KEY.');
  }

  const model = process.env.DAN_MODEL || 'gpt-4.1-mini';
  const systemPrompt = buildSystemMessage(user, conversation, chequeos, contextPack);
  const input = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: messageText },
  ];

  if (shouldLogDanPayload) {
    console.log('[DAN] Payload enviado a OpenAI /responses.create:');
    console.log(
      JSON.stringify(
        {
          model,
          previous_response_id: conversation?.lastResponseId || null,
          input,
        },
        null,
        2,
      ),
    );
  }

  const response = await openai.responses.create({
    model,
    input,
    previous_response_id: conversation?.lastResponseId || undefined,
  });

  const text = response.output_text || '';
  if (!text) {
    throw new Error('OpenAI did not return any text response.');
  }

  return {
    text,
    responseId: response.id,
    historySummary: buildHistorySummary(conversation?.historySummary, messageText, text),
    model,
  };
}
