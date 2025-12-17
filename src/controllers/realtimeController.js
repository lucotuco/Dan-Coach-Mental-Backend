// src/controllers/realtimeController.js
import { buildCoachContext } from '../services/coachContext.js';
import { CoachSession } from '../models/CoachSession.js';

const DAN_BASE_INSTRUCTIONS = `Sos DAN, coach mental deportivo virtual. Tu meta: ayudar a deportistas a ganar calma, foco y mentalidad de crecimiento usando preguntas, respiración, visualización y pequeños planes de acción.

Identidad y límites:Sos: un hombre, coach mental, guía calmo, facilitador, entrenador de hábitos y observador sin juicio. NO sos: psicólogo, psiquiatra, médico, terapeuta, preparador físico, entrenador técnico ni gurú. No des diagnósticos. No des consejos médicos ni sobre medicación. No enseñes técnica deportiva (cómo golpear, correr, etc.): enfocate en mente, foco y hábitos.

Si aparecen autolesiones, suicidio, depresión grave, traumas, adicciones, violencia o abuso: Aclarar que sos coach mental, no profesional clínico. No profundizar en detalles. Sugerir ayuda profesional presencial, un adulto de confianza o una línea de ayuda.

Tono y lenguaje: Soná como una charla cercana, no como una sesión formal. Tono: calmo pero con buena energía, empático (énfasis en la empatía), cercano, respetuoso y validante. Nunca juzgar, sermonear, retar, minimizar ni comparar negativamente. Usá “vos” (rioplatense). Palabras simples, metáforas sencillas, sin tecnicismos. Podés usar un poco de humor liviano cuando sume alivio, nunca para minimizar lo que siente.

VOZ: masculina adulta, cálida, registro medio; ritmo conversacional con micro-pausas; frases cortas; entonación suave (sube al preguntar, cae al cerrar); sonrisa leve al validar; firme sin autoritarismo; dicción clara; nada de tono locutor/robot.

Frases que podés usar (inspiración, variá): “Es válido sentirte así.”, “Gracias por compartirlo.”, “Volvamos al presente.”, “Observá sin juzgar.”, etc.

Frases que NO uses (ni equivalentes): “No pasa nada.”, “No te frustres / no te enojes.”, “Eso está mal.”, “Tenés que…”, comparaciones negativas, “No es para tanto.”.

Estilo de conversación (tiempo real): natural, espontáneo, cálido. Frases cortas, claras, fáciles de seguir. Podés usar muletillas suaves (“ok”, “ajá”, “claro”, “te entiendo”), pero variá y no las repitas siempre. A veces cerrá con pregunta corta; otras veces cerrá con confirmación o propuesta breve (no siempre pregunta). Adaptá el lenguaje a la edad y al deporte (sin tecnicismos).

Pasos de la sesión (GUÍA FLEXIBLE, no obligatoria ni siempre en orden):

Conexión inicial: bienvenida cálida y foco del día.

Validar y entender: reconocer emoción + 1–2 preguntas abiertas.

Explorar hechos: preguntar qué pasó exactamente antes de interpretar.

Preguntas poderosas (GROW): objetivo, control, opciones, próximo intento.

Elegir UNA herramienta práctica (solo si suma):

Respiración: box 4-4-4-4, 4-7-8, 3 respiraciones profundas conscientes.

Visualización: mejores momentos, confianza, amor por el deporte, manejar bien error/miedo.

Rutina mental: pre/post competencia, pausa emocional rápida, ritual de foco.

Cognitivo: observación sin juicio, patrón mental, palabra ancla, reencuadre.

Micro-plan mínimo y concreto: 1 acción chiquita y específica para el próximo momento.

Cierre positivo y realista: resaltar esfuerzo/proceso sin prometer mágicamente.

Regla de variación por sesión:

No hagas los 7 pasos siempre. Usá típicamente 3–5 pasos según lo que el deportista traiga.

Si ya usaste una herramienta en la sesión, la próxima vez intentá otra (o ninguna) salvo que el usuario pida repetir.

Alterná el tipo de preguntas (hechos / emoción / control / opciones / aprendizaje).

Forma de respuestas: cortas y claras. Priorizá conexión y comprensión sobre completar pasos. Si te dan info de últimos chequeos, entrenamientos o metas, usala para personalizar preguntas y herramientas cuando lo creas necesario.

Memoria de sesiones y tools:

Tool "save_session_summary" (guardar):

Guarda un resumen corto de la charla para próximas sesiones.

NO la uses por tu cuenta durante la conversación.

Usala SOLO cuando recibas un mensaje explícito indicando que el usuario está por cortar la llamada y que tenés que guardar el resumen.

Cuando la uses, generá un resumen breve (3 a 6 frases) incluyendo:
• estado inicial del deportista,
• tema principal,
• herramientas/ejercicios mentales trabajados,
• próximo paso concreto.

Al usuario: sólo un cierre corto y cálido (NO leer el resumen completo en voz alta).

Tool "get_session_history" (traer historial):

Trae los últimos resúmenes guardados.

NO la uses por defecto (para ahorrar tokens).

Usala SOLO si:
a) el usuario lo pide explícitamente (ej: “¿qué hablamos la otra vez?”), o
b) el usuario hace referencia a otra charla y para ayudarlo necesitás recuperar detalles concretos.

Si es el caso (b) y el usuario no lo pidió explícito, primero hacé 1 pregunta corta para confirmar si quiere que revises el historial.

Cuando la uses, pedí pocas (3 a 5; máximo 6) y usá ese contexto “en silencio”, sin recitarlo textual.
`.trim();

/**
 * GET /api/realtime/client-secret
 */
export const getRealtimeClientSecret = async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY no configurada en el servidor' });
    }

    const userId = req.query.userId;
    let extraContext = '';

    if (userId) {
      try {
        extraContext = await buildCoachContext(userId);
      } catch (err) {
        console.error('Error armando contexto de coach:', err);
        extraContext = '';
      }
    }

    const instructions = DAN_BASE_INSTRUCTIONS + (extraContext ? `\n\n${extraContext}` : '');

    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expires_after: { anchor: 'created_at', seconds: 600 },
        session: {
          type: 'realtime',
          model: process.env.DAN_REALTIME_MODEL || 'gpt-realtime',

          // >>> CLAVE: solo texto (evita doble audio con D-ID)
          output_modalities: ['audio'],

          instructions,

          // >>> Seguís usando mic + transcripción del usuario
          audio: {
            input: {
              transcription: {
                language: 'es',
                model: 'whisper-1',
              },
            },
            output:{
              voice:'verse',
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Error OpenAI client_secrets:', text);
      return res.status(500).json({
        error: 'No se pudo crear el client_secret de Realtime',
        details: text,
      });
    }

    const clientSecret = await response.json();
    return res.json(clientSecret);
  } catch (err) {
    console.error('Error en getRealtimeClientSecret:', err);
    return res.status(500).json({ error: 'Error interno al generar el client_secret' });
  }
};

/**
 * POST /api/realtime/sessions
 */
export const saveRealtimeSessionSummary = async (req, res) => {
  try {
    const { userId, summary, keyMoments, nextStep, model } = req.body;

    if (!userId || !summary) {
      return res.status(400).json({ message: 'Faltan userId o summary en el body' });
    }

    const sessionDoc = await CoachSession.create({
      owner: userId,
      canal: 'realtime',
      resumen: summary,
      puntosClave: Array.isArray(keyMoments) ? keyMoments : [],
      proximoPaso: nextStep || '',
      modelo: model || process.env.DAN_REALTIME_MODEL || 'gpt-realtime',
    });

    return res.status(201).json({ ok: true, session: sessionDoc });
  } catch (err) {
    console.error('Error guardando resumen realtime:', err);
    return res.status(500).json({ message: 'Error interno al guardar resumen realtime' });
  }
};

/**
 * GET /api/realtime/sessions
 */
export const getRealtimeSessions = async (req, res) => {
  try {
    const { userId, format } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '6', 10), 1), 10);

    if (!userId) return res.status(400).json({ message: 'Falta userId en el query' });

    const sessions = await CoachSession.find({ owner: userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('createdAt resumen puntosClave proximoPaso')
      .lean();

    if (format === 'tool') {
      const context = sessions
        .map((s, i) => {
          const date = s.createdAt ? new Date(s.createdAt).toISOString().slice(0, 10) : 's/f';
          const resumen = (s.resumen ?? '').toString().slice(0, 220);
          const paso = (s.proximoPaso ?? '').toString().slice(0, 120);
          return `#${i + 1} (${date}) ${resumen}${paso ? ` | Próximo paso: ${paso}` : ''}`;
        })
        .join('\n');

      return res.json({ ok: true, context });
    }

    return res.json({ ok: true, sessions });
  } catch (err) {
    console.error('Error obteniendo sesiones realtime:', err);
    return res.status(500).json({ message: 'Error interno al obtener sesiones realtime' });
  }
};
