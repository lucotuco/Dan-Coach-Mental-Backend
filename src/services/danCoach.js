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


// ------------------------------
// Auto-title (Chat sessions)
// ------------------------------

function formatTodayTitle(date = new Date()) {
  // America/Argentina/Buenos_Aires
  const fmt = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  // Ej: "12 feb 2026" o "12 feb. 2026" según runtime -> normalizamos
  return fmt
    .format(date)
    .replace(/\./g, '')          // quita puntos en abreviaturas (feb.)
    .replace(/\s+/g, ' ')        // normaliza espacios
    .trim()
    .toLowerCase();               // preferencia: compacto
}

function sanitizeTitle(raw) {
  const s = String(raw || '')
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')  // sin comillas
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // sin punto final
  return s.replace(/[\.!?]+$/g, '').trim().slice(0, 80);
}

export async function generateConversationTitle({ excerpt, fallbackDate = new Date() }) {
  const fallback = formatTodayTitle(fallbackDate);

  if (!openai.apiKey) return fallback;

  const cleanExcerpt = String(excerpt || '').trim();
  if (!cleanExcerpt) return fallback;

  const model = process.env.DAN_TITLE_MODEL || process.env.DAN_MODEL || 'gpt-4.1-mini';
  const promptVersion = 1;

  const system = 'Generás títulos cortos y seguros para conversaciones en español.';
  const user = [
    'Generá un título en español, de 3 a 7 palabras, sin comillas, sin punto final.',
    '- Debe describir el tema principal',
    '- No incluir datos sensibles (emails, teléfonos, direcciones)',
    '- Si hay dos temas, elegí el más reciente',
    'Devolvé SOLO el título.',
    '',
    'CONVERSACIÓN (extracto):',
    cleanExcerpt,
  ].join('\n');

  const input = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  if (shouldLogDanPayload) {
    console.log('[DAN_TITLE] Payload enviado a OpenAI /responses.create:');
    console.log(JSON.stringify({ model, promptVersion, input_preview_chars: cleanExcerpt.length }, null, 2));
    // Si querés ver TODO el prompt, descomentá:
    // console.log(JSON.stringify({ model, promptVersion, input }, null, 2));
  }

  try {
    const response = await openai.responses.create({ model, input });
    const raw = response.output_text || '';
    const title = sanitizeTitle(raw);

    // Validación mínima: 3-7 palabras (best-effort)
    const wc = title ? title.split(/\s+/).filter(Boolean).length : 0;
    if (wc < 3 || wc > 10) {
      // si se fue de rango, igual preferimos algo usable antes que fallback
      return title || fallback;
    }

    return title || fallback;
  } catch (e) {
    if (shouldLogDanPayload) console.log('[DAN_TITLE] Error generando título:', e?.message || e);
    return fallback;
  }
}
