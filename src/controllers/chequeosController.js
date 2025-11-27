import { Chequeo } from '../models/Chequeo.js';
export async function createCheck(req, res, next) {
  try {
    

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

    

    res.status(201).json(chequeo);
  } catch (error) {
    console.error('ERROR createCheck >>>', error);
    next(error);
  }
}

export async function listChecksByTypeAndOwner(req, res, next) {
  try {
    const { owner, tipo } = req.query;

    if (!owner) {
      return res.status(400).json({ message: 'owner es obligatorio' });
    }

    if (!tipo) {
      const chequeos = await Chequeo.find({ owner, tipo }).sort({ fecha: -1 });
    }
    else{
      const chequeos = await Chequeo.find({ owner }).sort({ fecha: -1 });
    }

    res.json(chequeos);
  } catch (error) {
    console.error('ERROR listChecksByTypeAndOwner >>>', error);
    next(error);
  }
}