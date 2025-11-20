import { User } from '../models/User.js';

export async function listUsers(req, res, next) {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    next(error);
  }
}

export async function loginUser(req, res, next) {
  try {
    const { email, password } = req.body;

    // 1) Validación básica
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: 'Email y contraseña son obligatorios' });
    }

    // 2) Buscar usuario por email
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      // No existe un usuario con ese mail
      return res
        .status(401)
        .json({ message: 'Credenciales inválidas (usuario no encontrado)' });
    }

    // 3) Comparar contraseña en texto plano
    if (user.password !== password) {
      return res
        .status(401)
        .json({ message: 'Credenciales inválidas (contraseña incorrecta)' });
    }

    // 4) Armar objeto de usuario sin la contraseña
    const userObj = user.toObject();
    delete userObj.password;

    // 5) Devolver el usuario logueado
    return res.json({
      message: 'Login exitoso',
      user: userObj,
    });
  } catch (error) {
    next(error);
  }
}export async function createUser(req, res, next) {
  try {
    let { name, email, phone, password } = req.body;

    // Normalizar valores (evitar espacios, mayúsculas en mail, etc.)
    name = name?.trim();
    email = email?.trim().toLowerCase();
    phone = phone?.trim();

    // 1) Validar que no falte ningún campo
    const missingFields = [];
    if (!name) missingFields.push('name');
    if (!email) missingFields.push('email');
    if (!phone) missingFields.push('phone');
    if (!password) missingFields.push('password');

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: 'Faltan campos obligatorios',
        missingFields, // por si querés mostrar cuáles faltan en el front
      });
    }

    // 2) Verificar si ya existe un usuario con ese email
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      // 409 = conflicto (recurso ya existe)
      return res
        .status(409)
        .json({ message: 'Ya existe un usuario registrado con ese email' });
    }

    // 3) Crear el usuario
    const user = await User.create({ name, email, phone, password });

    // Opcional: no devolver la contraseña al front
    const userObj = user.toObject();
    delete userObj.password;

    return res.status(201).json(userObj);
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
