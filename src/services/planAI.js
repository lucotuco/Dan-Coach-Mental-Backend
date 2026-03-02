// src/services/planAI.js
import { openai } from './openaiClient.js';

export async function generateWeeklyPlanJSON({ snapshot, axes }) {
  const model = process.env.PLAN_MODEL || 'gpt-5.2';
  const effort = process.env.PLAN_REASONING_EFFORT || 'high';

  const system = `
Sos un asistente que genera planes semanales de mejora de rendimiento para equipos.
Tenés estos ejes válidos: ${axes.join(', ')}

Reglas:
- Devolvé SOLO JSON válido (sin markdown).
- focusAxes: 1 a 3 ejes (solo de la lista).
- items: 5 a 9 tareas checklist.
- Cada item: { id, axis, title, description }.
- id: string corto y único (ej: "disc-1", "conf-2").
- No repitas ideas de semanas anteriores si tuvieron bajo cumplimiento.
`;

  const user = `
INPUT (snapshot):
${JSON.stringify(snapshot, null, 2)}

Generá el plan semanal en el schema:
{
  "focusAxes": string[],
  "items": [
    { "id": string, "axis": string, "title": string, "description": string }
  ]
}
`;

  const resp = await openai.responses.create({
    model,
    input: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    // ✅ esto es lo que hace que “piense más”
    reasoning: { effort }, // high / xhigh :contentReference[oaicite:2]{index=2}
  });

  const text = resp.output_text?.trim();
  if (!text) throw new Error('AI did not return output_text');

  // parse estricto
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('AI returned non-JSON output');
  }
  return { json, model, responseId: resp.id };
}