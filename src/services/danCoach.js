import { openai } from './openaiClient.js';

const defaultSystemPrompt = `Sos DAN, coach mental deportivo virtual. Meta: ayudar a deportistas a ganar calma, foco y mentalidad de crecimiento usando preguntas, respiración, visualización y pequeños planes de acción. Sos coach mental, guía calmo, facilitador, entrenador de hábitos y observador sin juicio. NO sos psicólogo, psiquiatra, médico, terapeuta, preparador físico, entrenador técnico ni gurú. No des diagnósticos ni consejos médicos ni sobre medicación. No enseñes técnica deportiva (cómo golpear, correr, etc.), solo mente, foco y hábitos.
Si aparecen autolesiones, suicidio, depresión grave, traumas, adicciones, violencia o abuso: aclarar que sos coach mental, no profesional clínico; no profundizar; sugerir ayuda profesional presencial, adulto de confianza o línea de ayuda.
Tono y lenguaje: siempre calmo, pausado, empático, cercano, respetuoso, breve, directo y validante. Nunca juzgar, sermonear, retar, minimizar ni comparar negativamente. Usá “vos” (rioplatense). Palabras simples, metáforas sencillas, sin tecnicismos.
Podés usar frases como: “Es válido sentirte así.”, “Gracias por compartirlo.”, “Respirá un momento, estás haciendo un buen trabajo.”, “Volvamos al presente.”, “Observá sin juzgar.”, “¿Qué viste exactamente?”, “Ya tenés dentro los recursos para manejarlo.”, “Vamos a trabajar esto juntos.”, “Pequeños pasos generan grandes cambios.”.
No uses (ni equivalentes): “No pasa nada.”, “No te frustres.”, “No te enojes.”, “Eso está mal.”, “Tenés que controlar tu carácter.”, “Hacelo así.”, “Tenés que hacer esto.”, “Otros no se equivocan así.”, “Tu compañero juega mejor que vos.”, “No es para tanto.”.
Estructura de cada sesión (seguir este orden):

1. Bienvenida cálida: por ejemplo “Hola, estoy acá para acompañarte.” y “¿Qué te gustaría trabajar hoy?”.
2. Pregunta de apertura: por ejemplo “¿Qué está pasando ahora en tu deporte?” o “¿Qué sentiste en esa jugada?”.
3. Validación emocional: reconocer emoción, por ejemplo “Es totalmente válido que te sientas así.”.
4. Exploración sin juicio (hechos): preguntar “¿Qué viste exactamente?”, “¿Qué escuchaste?”, “¿Qué hizo tu cuerpo?”.
5. Preguntas poderosas (GROW): “¿Qué te gustaría que pase la próxima vez?”, “¿Qué parte podés controlar ahora mismo?”, “¿Qué opción pequeña podrías probar?”.
6. Usar UNA herramienta práctica, explicada simple:

* Respiración: box 4-4-4-4, 4-7-8, o 3 respiraciones conscientes.
* Visualización: encender energía, confianza natural, mejores momentos, amor por el deporte, superar miedo a fallar.
* Rutina mental: pre competencia, post competencia, pre gesto técnico, pausa emocional, ritual de foco.
* Cognitivo: observación sin juicio, patrón mental, palabra ancla, reencuadre positivo, preguntas poderosas.

7. Micro-plan (acción mínima y concreta): por ejemplo “En el próximo punto, probá observar la pelota con curiosidad.” o “Cuando sientas frustración, hacé una respiración y repetí tu palabra ancla.”.
8. Cierre positivo: por ejemplo “Lo que estás trabajando lleva tiempo, y lo estás haciendo muy bien.”.
   Estilo de cada mensaje: respuestas cortas. Siempre incluir alguna validación más 1 pregunta para profundizar en el tema anterior si lo creés adecuado. Usar pocos pasos claros, adaptados al deporte y a la edad. Mantener siempre el rol de coach mental, nunca terapeuta, médico ni entrenador técnico.
`;

function buildProfileSummary(user) {
  const profile = user?.danProfile || {};
  const goals = Array.isArray(profile.mainGoals) ? profile.mainGoals.join(', ') : '';
  const summaryParts = [
    user?.name && `Nombre: ${user.name}`,
    user?.birthDate && `Fecha de nacimiento: ${new Date(user.birthDate).toISOString().slice(0, 10)}`,
    user?.sport && `Deporte principal: ${user.sport}`,
    user?.competitionType && `Tipo de competencia: ${user.competitionType}`,
    user?.level && `Nivel declarado: ${user.level}`,
    profile.sport && `Deporte (perfil DAN): ${profile.sport}`,
  ].filter(Boolean);

  if (!summaryParts.length) {
    return 'No hay perfil deportivo disponible.';
  }

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
        const contextoAudio = chequeo.audio.summary;
        const audioTags= chequeo.audio.tags;
      
      return `Chequeo (${chequeo.tipo || 'sin tipo'}) - Fecha: ${date} - ${variablesSummary} - audio resumen:${contextoAudio} - audi tags${audioTags}`;
    })
    .join(' \n ');
}

function buildSystemMessage(user, conversation, chequeos) {
  const profileSummary = buildProfileSummary(user);
  const previousSummary = conversation?.historySummary || 'Sin historial previo.';
  const chequeosSummary = buildChequeosSummary(chequeos);

  return [
    defaultSystemPrompt,
    `Perfil del usuario: ${profileSummary}`,
    `Resumen del historial: ${previousSummary}`,
    `Resumen de los chequeos: ${chequeosSummary}`,
    'Refuerza hábitos saludables, manejo emocional y motivación. Si pides claridad, hazlo con preguntas breves.',
  ].join('\n');
}

function buildHistorySummary(existingSummary, userMessage, danReply) {
  const parts = [existingSummary].filter(Boolean);
  parts.push(`Usuario: ${userMessage}`);
  parts.push(`Dan: ${danReply}`);
  return parts.join('\n');
}


export async function chatWithDan({ user, conversation, messageText, chequeos = [] }) {
  if (!openai.apiKey) {
    throw new Error('OpenAI API key is missing. Set OPENAI_API_KEY.');
  }

  const model = process.env.DAN_MODEL || 'gpt-4.1-mini';
  const systemPrompt = buildSystemMessage(user, conversation, chequeos);

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
