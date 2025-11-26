import { Chequeo } from '../models/Chequeo.js';

export async function createCheck(req, res, next) {
  try {
    const {
      userId,
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

    if (!userId || !fecha || !tipo) {
      return res.status(400).json({ message: 'userId, fecha y tipo son obligatorios' });
    }

    const chequeo = await Chequeo.create({
      owner: userId,
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