# DAN Coach Mental - Backend API 🧠⚡

Este repositorio contiene la API principal de **DAN**, un coach mental deportivo impulsado por Inteligencia Artificial. Está construido con Node.js, Express y MongoDB, e integra el modelo de OpenAI para manejar sesiones de coaching en tiempo real y por texto, junto con un sistema avanzado de memoria a largo plazo (RAG).

## 🚀 Características Principales
* **Autenticación y Roles:** Gestión de usuarios con roles de `coach` y `member` mediante JWT, y organización basada en equipos (`teams`)[cite: 1].
* **Integración con OpenAI:** Soporte para la API de texto y la API Realtime de OpenAI, permitiendo interacciones de voz de baja latencia con el asistente[cite: 1].
* **Memoria a Largo Plazo (RAG):** Generación automática de resúmenes de sesión, extracción de métricas, y almacenamiento vectorial para dotar a DAN de memoria contextual sobre el atleta[cite: 1].
* **Gestión de Planes y Chequeos:** Endpoints para crear chequeos semanales de los atletas y generar planes de acción personalizados con IA basándose en los resultados[cite: 1].
* **Cronjobs (Schedulers):** Procesos en segundo plano para consolidar y purgar la memoria de las sesiones automáticamente[cite: 1].

## 🛠️ Tecnologías Utilizadas
* **Entorno:** Node.js + Express[cite: 1].
* **Base de Datos:** MongoDB (Mongoose)[cite: 1].
* **IA y Media:** `openai`, `ffmpeg-static`, `multer` (para procesamiento de audios)[cite: 1].
* **Seguridad:** `bcryptjs` (hash de contraseñas), `jsonwebtoken` (Auth)[cite: 1].

## ⚙️ Instalación y Configuración local

1. **Clonar el repositorio y entrar a la carpeta:**
   \`\`\`bash
   cd lucotuco-dan-coach-mental-backend
   \`\`\`

2. **Instalar las dependencias:**
   \`\`\`bash
   npm install
   \`\`\`

3. **Configurar las variables de entorno:**
   Copia el archivo de ejemplo para crear tu propio entorno local:
   \`\`\`bash
   cp .env.example .env
   \`\`\`
   Asegúrate de rellenar al menos las siguientes variables clave en tu nuevo archivo `.env`[cite: 1]:
   * `MONGODB_URI`: Tu cadena de conexión a MongoDB (Atlas o Local)[cite: 1].
   * `JWT_SECRET`: Una clave secreta segura para firmar los tokens de sesión[cite: 1].
   * `OPENAI_API_KEY`: Tu clave de la API de OpenAI[cite: 1].
   * `CORS_ORIGIN`: Las URLs de tu Frontend permitidas (ej. `http://localhost:8081`)[cite: 1].

4. **Levantar el servidor en modo desarrollo:**
   \`\`\`bash
   npm run dev
   \`\`\`
   El servidor iniciará (por defecto en el puerto `4000`) y verás el mensaje `✅DB: dan2` confirmando la conexión a la base de datos[cite: 1].

## 📂 Estructura del Proyecto
* `/src/controllers`: Lógica de negocio de las rutas (Auth, Checkins, Dan, Plans, Realtime, Teams)[cite: 1].
* `/src/models`: Esquemas de Mongoose (`User`, `Chequeo`, `DanConversation`, `WeeklyPlan`, etc.)[cite: 1].
* `/src/routes`: Definición de los endpoints de la API[cite: 1].
* `/src/services`: Servicios externos y utilidades clave (Cliente de OpenAI, reconciliadores de memoria, generadores de planes)[cite: 1].
