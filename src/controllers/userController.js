import { User } from '../models/User.js';

export async function listUsers(req, res, next) {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    next(error);
  }
}

export async function createUser(req, res, next) {
  try {
    const { name, email, phone, password } = req.body;

    // Validación básica
    if (!name || !email) {
      return res.status(400).json({ message: 'Nombre y email son obligatorios' });
    }

    // 👇 Buscar si ya existe un usuario con ese email
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      // 409 = conflicto (recurso ya existe)
      return res.status(409).json({ message: 'Ya existe un usuario registrado con ese email' });
    }

    // Si no existe, lo creamos
    const user = await User.create({ name, email, phone, password });

    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
}
export async function getUser(req, res,next) {
  try{
  // Get id from request parameters:
  const { id } = req.params;
  
  const user = await User.findById(id);
/* If a user object (document) has an id that matches id in the 
     request parameters, set HTTP status to 200 & return that user object in
     JSON format */
  res.status(200).json(user);
  } catch (error) {
    next(error);
  }
  /* If id is not a valid MongoDB ObjectId, set HTTP status to 400 (bad 
     request) and return error message in JSON form */
  /*if (!mongoose.Types.ObjectId.isValid(id)) {
     return res.status(400).json({ error: "Bad request (invalid id)" });
  }*/

  /* assign user to document in DB that has id that matches the 
     id defined in this method: */
  
  /* If no user id in database matches id from the request parameter,
     set HTTP status to 404 and return error message in JSON form */
  /*if (!user) {
    return res.status(404).json({ error: "User doesn't exist" });
  }
*/
  
};
