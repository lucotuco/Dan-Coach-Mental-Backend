const LIVEAVATAR_API_KEY = process.env.LIVEAVATAR_API_KEY;
const LIVEAVATAR_AVATAR_ID = process.env.LIVEAVATAR_AVATAR_ID;
const LIVEAVATAR_MODE = (process.env.LIVEAVATAR_MODE || "FULL").toUpperCase();
const LIVEAVATAR_LANGUAGE = process.env.LIVEAVATAR_LANGUAGE || "en";

export async function getLiveAvatarSession(req, res) {
  try {
    if (!LIVEAVATAR_API_KEY) {
      return res.status(500).json({ error: "Missing LIVEAVATAR_API_KEY" });
    }
    if (!LIVEAVATAR_AVATAR_ID) {
      return res.status(500).json({ error: "Missing LIVEAVATAR_AVATAR_ID" });
    }

    // 1) Token
    const tokenPayload = {
      mode: LIVEAVATAR_MODE,          // FULL para que se comporte como demo
      avatar_id: LIVEAVATAR_AVATAR_ID,
      // Si tu cuenta requiere persona/voz, luego lo completamos.
      // avatar_persona: { language: LIVEAVATAR_LANGUAGE, ... }
    };

    const tokenResp = await fetch("https://api.liveavatar.com/v1/sessions/token", {
      method: "POST",
      headers: {
        "X-API-KEY": LIVEAVATAR_API_KEY,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(tokenPayload),
    });

    const tokenText = await tokenResp.text();
    if (!tokenResp.ok) {
      return res.status(500).json({
        error: "liveavatar_token_failed",
        detail: tokenText,
      });
    }

    const tokenJson = JSON.parse(tokenText);
    const sessionToken = tokenJson.session_token || tokenJson.sessionToken;
    if (!sessionToken) {
      return res.status(500).json({
        error: "liveavatar_token_missing",
        detail: tokenJson,
      });
    }

    // 2) Start
    const startResp = await fetch("https://api.liveavatar.com/v1/sessions/start", {
      method: "POST",
      headers: {
        authorization: `Bearer ${sessionToken}`,
        accept: "application/json",
      },
    });

    const startText = await startResp.text();
    if (!startResp.ok) {
      return res.status(500).json({
        error: "liveavatar_start_failed",
        detail: startText,
      });
    }

    const startJson = JSON.parse(startText);

    // 3) Devolver lo mínimo necesario para Stage 1 (frontend conecta a LiveKit)
    const livekit_url = startJson.livekit_url ?? startJson.livekitUrl;
    const livekit_client_token =
      startJson.livekit_client_token ?? startJson.livekitClientToken;

    if (!livekit_url || !livekit_client_token) {
      return res.status(500).json({
        error: "liveavatar_missing_livekit_fields",
        detail: startJson,
      });
    }

    return res.json({
      livekit_url,
      livekit_client_token,
      mode: LIVEAVATAR_MODE,
      language: LIVEAVATAR_LANGUAGE,
    });
  } catch (e) {
    return res.status(500).json({
      error: "liveavatar_session_error",
      detail: String(e),
    });
  }
}
