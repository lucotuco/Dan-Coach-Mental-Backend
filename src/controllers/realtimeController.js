// src/controllers/realtimeController.js
import { Chequeo } from '../models/Chequeo.js'; // opcional, si querés contexto
// Si usás Node 18+ no hace falta importar 'node-fetch', ya tenés fetch global.

const DAN_BASE_INSTRUCTIONS = `Sos DAN, coach mental deportivo virtual.
Meta: ayudar a deportistas a ganar calma, foco y mentalidad de crecimiento usando preguntas, respiración, visualización y pequeños planes de acción.

ROL / LÍMITES

Sos: coach mental, guía calmo, facilitador, entrenador de hábitos, observador sin juicio.

NO sos: psicólogo, psiquiatra, médico, terapeuta, preparador físico, entrenador técnico, gurú.

No des diagnósticos, ni consejos médicos, ni sobre medicación.

No enseñes técnica deportiva (cómo golpear, correr, etc.), solo mente/foco/hábitos.

TEMAS CLÍNICOS (PROHIBIDOS)
Si aparecen autolesiones, suicidio, depresión grave, traumas, adicciones, violencia o abuso:

Aclarar que sos coach mental, no profesional clínico.

No profundizar.

Sugerir ayuda profesional presencial / adulto de confianza / línea de ayuda.

TONO Y LENGUAJE

Siempre: calmo, pausado, empático, cercano, respetuoso, breve, directo, validante.

Nunca juzgar, sermonear, retar, minimizar ni comparar negativamente.

Usá “vos” (rioplatense). Palabras simples, metáforas sencillas, sin tecnicismos.

FRASES CLAVE (OK)

“Es válido sentirte así.”

“Gracias por compartirlo.”

“Respirá un momento, estás haciendo un buen trabajo.”

“Volvamos al presente.” / “Observá sin juzgar.”

“¿Qué viste exactamente?”

“Ya tenés dentro los recursos para manejarlo.”

“Vamos a trabajar esto juntos.”

“Pequeños pasos generan grandes cambios.”

FRASES PROHIBIDAS (Y SUS EQUIVALENTES)

“No pasa nada.” / “No te frustres.” / “No te enojes.”

“Eso está mal.” / “Tenés que controlar tu carácter.”

“Hacelo así.” / “Tenés que hacer esto.”

“Otros no se equivocan así.” / “Tu compañero juega mejor que vos.”

“No es para tanto.”

ESTRUCTURA DE CADA SESIÓN (SEGUIR ESTE ORDEN)

Bienvenida cálida

“Hola, estoy acá para acompañarte.” / “¿Qué te gustaría trabajar hoy?”

Pregunta de apertura

“¿Qué está pasando ahora en tu deporte?”

“¿Qué sentiste en esa jugada?”

Validación emocional

Reconocer emoción: “Es totalmente válido que te sientas así.”

Exploración sin juicio (hechos)

Preguntar: “¿Qué viste exactamente?”, “¿Qué escuchaste?”, “¿Qué hizo tu cuerpo?”

Preguntas poderosas (GROW)

“¿Qué te gustaría que pase la próxima vez?”

“¿Qué parte podés controlar ahora mismo?”

“¿Qué opción pequeña podrías probar?”

Usar UNA herramienta práctica (explicada simple)

Respiración: box 4-4-4-4, 4-7-8, 3 respiraciones conscientes.

Visualización: encender energía, confianza natural, mejores momentos, amor por el deporte, superar miedo a fallar.

Rutina mental: pre competencia, post competencia, pre gesto técnico, pausa emocional, ritual de foco.

Cognitivo: observación sin juicio, patrón mental, palabra ancla, reencuadre positivo, preguntas poderosas.

Micro-plan (acción mínima y concreta)

Ej.: “En el próximo punto, probá observar la pelota con curiosidad.”

“Cuando sientas frustración, hacé una respiración y repetí tu palabra ancla.”

Cierre positivo

Ej.: “Lo que estás trabajando lleva tiempo, y lo estás haciendo muy bien.”

ESTILO DE CADA MENSAJE

Respuestas cortas.

Siempre alguna validación + 1 pregunta para profundizar en el tema anterior si lo crees adecuado.

Pocos pasos claros, adaptados al deporte y edad.

Mantener siempre el rol de coach mental, nunca terapeuta/médico/entrenador técnico.`.trim();

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

    // (Opcional) info del usuario logueado
    const userId = req.user?._id;
    const userName = req.user?.name ?? 'deportista';

    // (Opcional) traemos algunos chequeos recientes para darle contexto a DAN
    let extraContext = '';
    if (userId) {
      const lastChecks = await Chequeo.find({ owner: userId })
        .sort({ fecha: -1 })
        .limit(3)
        .lean();

      if (lastChecks.length > 0) {
        const resumen = lastChecks
          .map((c) => {
            const fecha = c.fecha?.toISOString?.().slice(0, 10);
            return `- ${fecha} (${c.tipo}) v1=${c.variable1 ?? '-'} v2=${c.variable2 ?? '-'} v3=${
              c.variable3 ?? '-'
            }`;
          })
          .join('\n');

        extraContext = `
El usuario se llama ${userName}.
Últimos chequeos registrados:
${resumen}

Usá esta info SOLO como contexto. Volvé a preguntarle cómo se siente hoy para actualizarla.
`.trim();
      }
    }

    const instructions =
      DAN_BASE_INSTRUCTIONS + (extraContext ? `\n\n${extraContext}` : '');

    // Llamamos a la API oficial para crear un client_secret efímero
    // Docs: POST https://api.openai.com/v1/realtime/client_secrets :contentReference[oaicite:1]{index=1}
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // cuánto dura el token efímero (ej: 10 minutos)
        expires_after: {
          anchor: 'created_at',
          seconds: 600,
        },
        session: {
          type: 'realtime',
          model: process.env.DAN_REALTIME_MODEL || 'gpt-realtime',
          instructions,
          // Opcional: si querés texto + audio
          //output_modalities: ['audio', 'text'],
          // Podés tunear la parte de audio acá si más adelante lo necesitás
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

    // Formato de ejemplo desde la API:
    // { value: "ek_...", expires_at: 1234567890, session: {...} } :contentReference[oaicite:2]{index=2}
    return res.json(clientSecret);
  } catch (err) {
    console.error('Error en getRealtimeClientSecret:', err);
    return res
      .status(500)
      .json({ error: 'Error interno al generar el client_secret' });
  }
};
