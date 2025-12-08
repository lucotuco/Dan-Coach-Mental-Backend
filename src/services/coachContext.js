// src/services/coachContext.js
import { User } from '../models/User.js';
import { Chequeo } from '../models/Chequeo.js';

export async function buildCoachContext(userId) {
  const user = await User.findById(userId).lean();
  if (!user) throw new Error('Usuario no encontrado');

  // Últimos 5 chequeos (ajustá el número)
  const chequeos = await Chequeo.find({ owner: userId })
    .sort({ fecha: -1 })
    .limit(5)
    .lean();

const userContext = [];

userContext.push(`Nombre: ${user.name}`);

if (user.deporte)   userContext.push(`Deporte: ${user.deporte}`);
if (user.posicion)  userContext.push(`Posición: ${user.posicion}`);
if (user.edad)      userContext.push(`Edad: ${user.edad}`);
if (user.nivel)     userContext.push(`Nivel: ${user.nivel}`);
if (user.goalT)   
{
  userContext.push(`Meta: ${user.goalT}`);
}
else userContext.push(`Meta resumen: ${user.goalA.summary} - tags: ${user.goalA.tags?.join(', ')}`)

    .filter(Boolean)
    .join('\n');

  const chequeosContext = chequeos
    .map((ch) => {
      const fecha = ch.fecha?.toISOString().split('T')[0];
      const vars = [
        ch.variable1 && `v1=${ch.variable1}`,
        ch.variable2 && `v2=${ch.variable2}`,
        ch.variable3 && `v3=${ch.variable3}`,
        ch.variable4 && `v4=${ch.variable4}`,
        ch.variable5 && `v5=${ch.variable5}`,
        ch.variable6 && `v6=${ch.variable6}`,
        ch.variable7 && `v7=${ch.variable7}`,
      ]
        .filter(Boolean)
        .join(', ');

        const contextoAudio = chequeo.audio.summary;
        const audioTags= chequeo.audio.tags;

      return `- ${fecha} | tipo: ${ch.tipo}${vars ? ` | ${vars}` : ''} | audio resumen:${contextoAudio} | audi tags${audioTags} `;
    })
    .join('\n');

  const contextString = `
[CONTEXTO DEL USUARIO]
${userContext || 'Sin datos de usuario'}

[ULTIMOS CHEQUEOS]
${chequeosContext || 'Sin chequeos registrados aún'}
`.trim();

  return contextString;
}
