import { Chequeo } from '../models/Chequeo.js';

export async function createCheck(req, res, next) {
  try {
    const {
      ownerId,
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

    if ( !fecha ) {
      return res.status(400).json({ message: 'fecha son obligatorios' });
    }
    if (!ownerId ) {
      return res.status(400).json({ message: 'userId son obligatorios',ownerId });
      console.log(ownerId);
    }
    if (!tipo) {
      return res.status(400).json({ message: 'tipo son obligatorios' });
      console.log(userId);
    }
    
    

    const chequeo = await Chequeo.create({
      owner: ownerId,
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
    next(error);
  }
}