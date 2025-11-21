import { Chequeo } from '../models/Chequeo.js';

export async function createCheck(req, res, next) {
  try {
    const { userId, fecha, tipo, variable1,variable2,variable3,variable4,variable5,variable6,variable7 } = req.body;

    const check = await Check.create({
        
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

    res.status(201).json(check);
  } catch (error) {
    next(error);
  }
}