# Backend 2 – API Node.js + MongoDB

Este directorio contiene un ejemplo mínimo de backend en Node.js/Express conectado a una base de datos MongoDB. A continuación tienes una guía paso a paso de lo que debes hacer **fuera** y **dentro** del proyecto para dejarlo funcionando.

## 1. Pasos fuera del proyecto (configuración previa)

1. **Instala Node.js y npm**
   - Descarga la versión LTS desde [https://nodejs.org](https://nodejs.org) o usa `nvm install --lts` si prefieres Node Version Manager.
   - Verifica la instalación ejecutando `node -v` y `npm -v`.
2. **Crea tu clúster o instancia de MongoDB**
   - En MongoDB Atlas: crea una cuenta, un clúster gratuito y un usuario con contraseña.
   - En MongoDB local: instala el servidor (`mongod`) y asegúrate de que esté escuchando (por defecto en `mongodb://127.0.0.1:27017`).
3. **Obtén la cadena de conexión (connection string)**
   - Atlas provee algo como `mongodb+srv://<usuario>:<password>@<cluster>/<database>?retryWrites=true&w=majority`.
   - Localmente sería `mongodb://localhost:27017/miBase`.
4. **Configura las IPs permitidas (solo Atlas)**
   - En la sección *Network Access*, agrega tu IP pública o habilita `0.0.0.0/0` mientras desarrollas.

## 2. Pasos dentro del proyecto (este directorio)

1. **Instala las dependencias**
   ```bash
   cd "backend 2"
   npm install
   ```
   Si estás detrás de un proxy, configura las variables `HTTP_PROXY`/`HTTPS_PROXY` o ejecuta `npm config set proxy http://usuario:pass@proxy:puerto`.
2. **Copia el archivo de variables de entorno**
   ```bash
   cp .env.example .env
   ```
   - Edita `.env` y reemplaza `MONGODB_URI` con la cadena que obtuviste antes.
   - Ajusta `PORT` o `CORS_ORIGIN` si lo necesitas.
3. **Ejecuta el backend en modo desarrollo**
   ```bash
   npm run dev
   ```
   - El servidor se levanta en `http://localhost:4000` (o el puerto que definas).
   - Si la conexión a MongoDB es exitosa verás `✅ MongoDB connection established` y luego `🚀 API listening...` en consola.
4. **Variables para la integración con Dan (OpenAI)**
   - Define `OPENAI_API_KEY` en tu `.env` para que el servicio de coaching mental funcione.
   - Opcional: `DAN_MODEL` para cambiar el modelo por defecto (`gpt-4.1-mini`).
5. **Prueba la API**
   - `GET http://localhost:4000/health` → estado del servicio.
   - `POST http://localhost:4000/api/dan/chat` → conversación con Dan (ver detalles más abajo).
6. **Conecta tu frontend**
   - Desde el frontend, usa `fetch`/`axios` hacia las rutas anteriores y asegúrate de apuntar a la misma URL que definiste en `CORS_ORIGIN`.

### Endpoint `POST /api/dan/chat`

Endpoint pensado para Expo/React Native que mantiene el contexto de la conversación con Dan usando el Responses API de OpenAI.

- **Headers**: `Content-Type: application/json`
- **Body**:
  ```json
  {
    "userId": "<id del usuario en MongoDB>",
    "message": "Texto del usuario",
    "type": "general" ,
    "conversationId": "<opcional, si ya existe>",
    "chequeoId": "<opcional, si nace de un chequeo>"
  }
  ```
  - `type` agrupa conversaciones (por ejemplo: "chequeo", "rutina", etc.). Si no se envía, se usa `general`.
  - `conversationId` permite reanudar una conversación existente; si no se envía, se busca la última por `type` o se crea una nueva.

- **Response**:
  ```json
  {
    "conversationId": "<id de la conversación>",
    "message": "Respuesta de Dan",
    "lastResponseId": "<id del Responses API para mantener contexto>",
    "historySummary": "Resumen acumulado del diálogo",
    "model": "gpt-4.1-mini",
    "type": "general",
    "userMessageId": "<id del mensaje de usuario guardado>",
    "assistantMessageId": "<id del mensaje de Dan guardado>"
  }
  ```
  - `historySummary` es el historial condensado que Dan usa como contexto junto con `previous_response_id`.
  - El perfil deportivo del usuario (`danProfile` en el modelo `User`) se incluye automáticamente en el prompt.

## 3. Estructura de carpetas

```
backend 2
├── .env.example        # Plantilla de variables de entorno
├── package.json        # Scripts y dependencias
└── src
    ├── config
    │   └── mongo.js    # Configuración de la conexión a MongoDB
    ├── controllers
    │   └── noteController.js
    ├── models
    │   └── Note.js
    ├── routes
    │   └── noteRoutes.js
    └── server.js       # Punto de entrada del servidor Express
```

## 4. ¿Cómo se conecta todo?

1. `src/server.js` arranca Express, carga las variables de entorno y llama a `connectToDatabase`.
2. `connectToDatabase` (en `src/config/mongo.js`) usa Mongoose para abrir una conexión persistente con MongoDB.
3. Una vez conectados, Express expone las rutas `/api/notes`, que dependen del modelo `Note` definido en `src/models/Note.js`.
4. Puedes replicar este patrón para tus propios modelos/controladores/rutas.

## 5. Próximos pasos sugeridos

- Agrega validaciones adicionales con librerías como `zod` o `joi`.
- Implementa autenticación (JWT, OAuth, etc.) según tus necesidades.
- Crea un script de despliegue (`docker-compose`, Render, Railway, etc.) usando la misma variable `MONGODB_URI`.

> ⚠️ **Recuerda:** este repositorio no incluye `node_modules`. Cada desarrollador debe ejecutar `npm install` localmente.
