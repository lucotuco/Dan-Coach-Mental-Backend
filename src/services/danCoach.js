import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const defaultSystemPrompt = `Eres Dan, un coach mental deportivo. Responde en español con empatía y consejos prácticos.
Mantén las respuestas breves, accionables y orientadas a mejorar la mentalidad del atleta.`;

function buildProfileSummary(user) {
  const profile = user?.danProfile || {};
  const goals = Array.isArray(profile.mainGoals) ? profile.mainGoals.join(', ') : '';
  const summaryParts = [
    profile.sport && `Deporte: ${profile.sport}`,
    profile.position && `Posición: ${profile.position}`,
    profile.club && `Club: ${profile.club}`,
    profile.category && `Categoría: ${profile.category}`,
    goals && `Objetivos principales: ${goals}`,
  ].filter(Boolean);

  if (!summaryParts.length) {
    return 'No hay perfil deportivo disponible.';
  }

  return summaryParts.join(' | ');
}

function buildSystemMessage(user, conversation) {
  const profileSummary = buildProfileSummary(user);
  const previousSummary = conversation?.historySummary || 'Sin historial previo.';

  return [
    defaultSystemPrompt,
    `Perfil del usuario: ${profileSummary}`,
    `Resumen del historial: ${previousSummary}`,
    'Refuerza hábitos saludables, manejo emocional y motivación. Si pides claridad, hazlo con preguntas breves.',
  ].join('\n');
}

function buildHistorySummary(existingSummary, userMessage, danReply) {
  const parts = [existingSummary].filter(Boolean);
  parts.push(`Usuario: ${userMessage}`);
  parts.push(`Dan: ${danReply}`);
  return parts.join('\n');
}

export async function chatWithDan({ user, conversation, messageText }) {
  if (!openai.apiKey) {
    throw new Error('OpenAI API key is missing. Set OPENAI_API_KEY.');
  }

  const model = process.env.DAN_MODEL || 'gpt-4.1-mini';
  const systemPrompt = buildSystemMessage(user, conversation);

  const response = await openai.responses.create({
    model,
    input: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: messageText },
    ],
    previous_response_id: conversation?.lastResponseId || undefined,
  });

  const text = response.output_text || '';

  if (!text) {
    throw new Error('OpenAI did not return any text response.');
  }

  return {
    text,
    responseId: response.id,
    historySummary: buildHistorySummary(
      conversation?.historySummary,
      messageText,
      text
    ),
    model,
  };
}
