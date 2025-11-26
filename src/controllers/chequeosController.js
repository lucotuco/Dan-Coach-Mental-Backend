import { Chequeo } from '../models/Chequeo.js';
export async function createCheck(req, res, next) {
  try {
    console.log('BODY createCheck >>>', req.body);

    const {
      owner,
      fecha,
      tipo,
      variable1,
      variable2,
      variable3,
      variable4,
      variable5,
      variable6,
      variable7,
    } = req.body;

    if (!fecha) {
      return res.status(400).json({ message: 'fecha es obligatoria' });
    }
    if (!owner) {
      return res.status(400).json({ message: 'owner es obligatorio' });
    }
    if (!tipo) {
      return res.status(400).json({ message: 'tipo es obligatorio' });
      // este console.log nunca se ejecuta porque está después del return
      // console.log(userId);
    }

    const chequeo = await Chequeo.create({
      owner,
      fecha,
      tipo,
      variable1,
      variable2,
      variable3,
      variable4,
      variable5,
      variable6,
      variable7,
    });

    console.log('CHEQUEO CREADO >>>', chequeo);

    res.status(201).json(chequeo);
  } catch (error) {
    console.error('ERROR createCheck >>>', error);
    next(error);
  }
}