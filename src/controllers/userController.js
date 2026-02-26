import { User } from '../models/User.js';
import { getSummaryAndTagsFromTranscript, transcribeAudio } from '../controllers/chequeosController.js';
import fs from 'fs';
import jwt from 'jsonwebtoken';

export async function listUsers(req, res, next) {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    next(error);
  }
}
import { User } from '../models/User.js';

export async function getMe(req, res, next) {
  try {
    // req.user viene del authMiddleware
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });

    return res.json({
      userId: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      teamId: user.teamId ? String(user.teamId) : null,
    });
  } catch (err) {
    return next(err);
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

    // 5) Generar token y devolver el usuario logueado
    const JWT_SECRET = process.env.JWT_SECRET;

    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'Falta la clave de JWT' });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
      expiresIn: '7d',
    });

    return res.json({
      message: 'Login exitoso',
      user: userObj,
      token,
    });
  } catch (error) {
    next(error);
  }
}

export async function createUser(req, res, next) {
  try {
    let { name, email, password } = req.body;

    name = name?.trim();
    email = email?.trim().toLowerCase();

    const missingFields = [];
    if (!name) missingFields.push('name');
    if (!email) missingFields.push('email');
    if (!password) missingFields.push('password');

    if (missingFields.length > 0) {
      return res.status(400).json({ message: 'Faltan campos obligatorios', missingFields });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'Ya existe un usuario registrado con ese email' });
    }

    const user = await User.create({ name, email, password });

    const userObj = user.toObject();
    delete userObj.password;

    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'Falta la clave de JWT' });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({
      message: 'creacion de usuario exitoso',
      user: userObj,
      token,
    });
  } catch (error) {
    next(error);
  }
}
 export async function updateUser(req, res, next) {
  try {
    const {
      id,
      sport,
      level,
      competitionType,
      birthDate,
    } = req.body;

    console.log('Body recibido en /cargarInfo:', req.body);

    if (!id) {
      return res.status(400).json({ message: 'Falta el id del usuario' });
    }

    const allowedCompetitionTypes = ['individual', 'pareja', 'equipo'];
    if (competitionType && !allowedCompetitionTypes.includes(competitionType)) {
      return res.status(400).json({
        message: 'competitionType debe ser individual, pareja o equipo',
      });
    }

    let parsedBirthDate;
    if (birthDate) {
      parsedBirthDate = new Date(birthDate);
      if (Number.isNaN(parsedBirthDate.getTime())) {
        return res.status(400).json({ message: 'birthDate no es una fecha válida' });
      }
    }

    const updateData = {};
    if (parsedBirthDate !== undefined) updateData.birthDate = parsedBirthDate;
    if (sport !== undefined) updateData.sport = sport;
    if (competitionType !== undefined) updateData.competitionType = competitionType;
    if (level !== undefined) updateData.level = level;

    console.log('Datos a actualizar:', updateData);

    const updatedUser = await User.findByIdAndUpdate(id, updateData, {
      new: true,
      // runValidators: true,
    });

    console.log('Usuario actualizado:', updatedUser && updatedUser._id);

    if (!updatedUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const userObj = updatedUser.toObject();
    delete userObj.password;

    return res.json({
      message: 'Usuario actualizado correctamente',
      user: userObj,
    });
  } catch (error) {
    console.error('Error en updateUser:', error);
    next(error);
  }
}


export async function getUser(req, res, next) {
  try {
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

export async function updateUserGoalA(req, res, next) {
  try {
    const { id } = req.body;

    console.log('Content-Type:', req.headers['content-type']);
    console.log('Body /metaAudio recibido:', req.body);
    console.log('File /metaAudio recibido:', req.file);

    if (!id) {
      return res.status(400).json({ message: 'Falta el id del usuario' });
    }

    if (!req.file) {
      // 🔴 si entra acá, el problema es 100% de cómo llega el FormData desde el front
      return res.status(400).json({ message: 'No se recibió archivo de audio' });
    }

    let audioData = null;

    const transcript = await transcribeAudio(req.file);
    const { summary, tags } = await getSummaryAndTagsFromTranscript(transcript);
    console.log('summary: ', summary, 'tags: ' ,tags);
    audioData = {
      url: null,
      transcript,
      summary,
      tags,
    };

    // si algún día usás diskStorage, esto limpia archivo temporal
    if (req.file.path) {
      try {
        await fs.promises.unlink(req.file.path);
      } catch (cleanupError) {
        console.warn('No se pudo eliminar el archivo temporal de audio', cleanupError);
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { goalA: audioData },
      { new: true }
    );

    console.log('Usuario actualizado (audio):', updatedUser && updatedUser._id);

    if (!updatedUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const userObj = updatedUser.toObject();
    delete userObj.password;

    return res.json({
      message: 'Usuario actualizado correctamente',
      user: userObj,
    });

  } catch (error) {
    console.error('Error en updateUserGoalA:', error);
    next(error);
  }
};

export async function updateUserGoalT(req, res, next) {
  try {
    const { id, meta } = req.body;
    console.log('Body /metaTexto', req.body);

    if (!id) {
      return res.status(400).json({ message: 'Falta el id del usuario' });
    }
    if (!meta) {
      return res.status(400).json({ message: 'Falta el texto de la meta' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { goalT: meta },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const userObj = updatedUser.toObject();
    delete userObj.password;

    return res.json({
      message: 'Usuario actualizado correctamente',
      user: userObj,
    });
  } catch (error) {
    console.error('Error en updateUserGoalT:', error);
    next(error);
  }
}