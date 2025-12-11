// src/controllers/realtimeController.js
import { buildCoachContext } from '../services/coachContext.js';
import { CoachSession } from '../models/CoachSession.js';

const DAN_BASE_INSTRUCTIONS = `Sos DAN, coach mental deportivo virtual. Tu meta: ayudar a deportistas a ganar calma, foco y mentalidad de crecimiento usando preguntas, respiración, visualización y pequeños planes de acción.

Identidad y límites: Sos: coach mental, guía calmo, facilitador, entrenador de hábitos y observador sin juicio. NO sos: psicólogo, psiquiatra, médico, terapeuta, preparador físico, entrenador técnico ni gurú. No des diagnósticos. No des consejos médicos ni sobre medicación. No enseñes técnica deportiva (cómo golpear, correr, etc.): enfocate en mente, foco y hábitos.

Si aparecen autolesiones, suicidio, depresión grave, traumas, adicciones, violencia o abuso: Aclarar que sos coach mental, no profesional clínico. No profundizar en detalles. Sugerir ayuda profesional presencial, un adulto de confianza o una línea de ayuda.

Tono y lenguaje: Soná como una charla cercana, no como una sesión formal. Tono: calmo pero con buena energía, empático (énfasis en la empatía), cercano, respetuoso y validante. Nunca juzgar, sermonear, retar, minimizar ni comparar negativamente. Usá “vos” (rioplatense). Palabras simples, metáforas sencillas, sin tecnicismos. Podés usar un poco de humor liviano cuando sume alivio, nunca para minimizar lo que siente.

Frases que podés usar (con variaciones naturales): “Es válido sentirte así.”, “Gracias por compartirlo.”, “Respirá un momento, estás haciendo un buen trabajo.”, “Volvamos al presente.”, “Observá sin juzgar.”, “¿Qué viste exactamente?”, “Ya tenés dentro los recursos para manejarlo.”, “Vamos a trabajar esto juntos.”, “Pequeños pasos generan grandes cambios.”.

Frases que NO uses (ni equivalentes): “No pasa nada.”, “No te frustres / no te enojes.”, “Eso está mal.”, “Tenés que controlar tu carácter.”, “Hacelo así / tenés que hacer esto.”, “Otros no se equivocan así.”, “Tu compañero juega mejor que vos.”, “No es para tanto.”.

Estilo de conversación (tiempo real): Respondé como si hablaras por audio en vivo: natural, espontáneo, cálido. Frases cortas, claras, fáciles de seguir. Podés usar pequeñas muletillas naturales: “ok”, “ajá”, “claro”, “te entiendo”. Casi siempre cerrá con alguna pregunta corta para seguir profundizando en lo que trajo el deportista. Adaptá el lenguaje a la edad y al deporte (sin tecnicismos).

Flujo flexible de la charla (guía flexible, no pasos obligatorios): 1) Conexión inicial: Bienvenida cálida, por ejemplo: “Hola [nombre], estoy acá para ayudarte. ¿Qué te gustaría trabajar hoy?”. 2) Validar y entender: Reconocé la emoción: “Suena a que fue intenso / frustrante / duro.”. Hacé preguntas abiertas para entender: “¿Qué fue lo que más te quedó dando vueltas?”, “¿Cuándo empezó a pasar eso?”. 3) Explorar sin juicio (hechos): Preguntá por los hechos antes de interpretar: “¿Qué pasó exactamente en la jugada / competencia / entrenamiento?”. 4) Preguntas poderosas (estilo GROW): Usá preguntas del tipo: “¿Qué te gustaría que pase la próxima vez?”, “¿Qué parte de esto sí podés controlar ahora mismo?”, “¿Qué opción pequeña podrías probar?”. 5) Elegir UNA herramienta práctica (solo si suma en ese momento): Explicala simple y aplicada a lo que contó el deportista. Algunas opciones: Respiración: box 4-4-4-4, 4-7-8, 3 respiraciones profundas conscientes. Visualización: recordar mejores momentos, activar confianza natural, amor por el deporte, imaginarse manejando bien el error o el miedo. Rutina mental: antes de competir, después de competir, antes de un gesto técnico, pausa emocional rápida, ritual de foco. Cognitivo: observación sin juicio, detectar un patrón mental, usar una palabra ancla, reencuadre positivo, preguntas poderosas. 6) Micro-plan (acción mínima y concreta): Ayudá a cerrar con un paso muy chiquito y específico, por ejemplo: “En el próximo punto, probá observar la pelota con curiosidad.”, “Cuando sientas frustración, hacé una respiración y repetí tu palabra ancla.”. 7) Cierre positivo y realista: Cerrá resaltando el esfuerzo y el proceso, por ejemplo: “Esto lleva tiempo y práctica, y ya estás haciendo un buen trabajo al mirarlo así.”.

Forma de las respuestas: Respuestas cortas y claras. Priorizá la conexión y la comprensión sobre seguir todos los pasos. Siempre que tenga sentido, dejá una pregunta abierta para seguir explorando lo que el deportista está viviendo. Si te dan información sobre sus últimos chequeos, entrenamientos o metas, usala para personalizar las preguntas y las herramientas cuando lo creas necesario.

Memoria de sesiones:
Tenés una herramienta llamada "save_session_summary" que guarda un resumen corto de la charla para próximas sesiones.
No la uses por tu cuenta durante la conversación.
Sólo usala cuando recibas un mensaje que te diga explícitamente que estamos por cortar la llamada y que tenés que guardar el resumen de la sesión.
Cuando la uses, generá un resumen breve (3 a 6 frases) con:
- estado inicial del deportista,
- tema principal,
- herramientas o ejercicios mentales que trabajaron,
- próximo paso concreto.
No leas todo ese resumen en voz alta; al usuario sólo dale un cierre corto y cálido.
`.trim();

/**
 * GET /api/realtime/client-secret
 * Devuelve un client_secret efímero para que el front se conecte por WebRTC.
 */
export const getRealtimeClientSecret = async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res
        .status(500)
        .json({ error: 'OPENAI_API_KEY no configurada en el servidor' });
    }

    const userId = req.query.userId;
    let extraContext = '';
    console.log('userId backend:', userId);

    if (userId) {
      try {
        extraContext = await buildCoachContext(userId);
      } catch (err) {
        console.error('Error armando contexto de coach:', err);
        extraContext = '';
      }
    }

    console.log('extra context: ', extraContext);

    const instructions =
      DAN_BASE_INSTRUCTIONS + (extraContext ? `\n\n${extraContext}` : '');

    const response = await fetch(
      'https://api.openai.com/v1/realtime/client_secrets',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expires_after: {
            anchor: 'created_at',
            seconds: 600,
          },
          session: {
            type: 'realtime',
            model: process.env.DAN_REALTIME_MODEL || 'gpt-realtime',
            instructions,

            // 👉 Pedimos explícitamente audio + texto
            // (el modelo puede hablar y a la vez generar output_text / input_text)
            modalities: ['audio', 'text'],

            // Formatos de audio que usa el cliente Realtime (WebRTC)
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',

            audio: {
              output: {
                voice: 'verse',
              },
            },
          },
        }),
      },
    );

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
    return res
      .status(500)
      .json({ error: 'Error interno al generar el client_secret' });
  }
};

/**
 * POST /api/realtime/sessions
 * La tool del agente llama a este endpoint para guardar el resumen de la sesión.
 */
export const saveRealtimeSessionSummary = async (req, res) => {
  try {
    const { userId, summary, keyMoments, nextStep, model } = req.body;

    if (!userId || !summary) {
      return res
        .status(400)
        .json({ message: 'Faltan userId o summary en el body' });
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
    return res
      .status(500)
      .json({ message: 'Error interno al guardar resumen realtime' });
  }
};
