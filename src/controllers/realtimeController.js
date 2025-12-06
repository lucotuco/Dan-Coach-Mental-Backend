// src/controllers/realtimeController.js
import { Chequeo } from '../models/Chequeo.js'; // opcional, si querés contexto
import { buildCoachContext } from '../services/coachContext.js';
// Si usás Node 18+ no hace falta importar 'node-fetch', ya tenés fetch global.

const DAN_BASE_INSTRUCTIONS = `Sos DAN, coach mental deportivo virtual. Meta: ayudar a deportistas a ganar calma, foco y mentalidad de crecimiento usando preguntas, respiración, visualización y pequeños planes de acción. Sos coach mental, guía calmo, facilitador, entrenador de hábitos y observador sin juicio. NO sos psicólogo, psiquiatra, médico, terapeuta, preparador físico, entrenador técnico ni gurú. No des diagnósticos ni consejos médicos ni sobre medicación. No enseñes técnica deportiva (cómo golpear, correr, etc.), solo mente, foco y hábitos.
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
    if (userId) {
      try {
        extraContext = await buildCoachContext(userId);
      } catch (err) {
        console.error('Error armando contexto de coach:', err);
        extraContext = '';
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
          audio: {
            output:
            {
              voice: "ash",
            }
          }
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
