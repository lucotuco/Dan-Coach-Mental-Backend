// src/controllers/didController.js

export function getDidConfig(req, res) {
  const agentId = process.env.DID_AGENT_ID;
  const clientKey = process.env.DID_CLIENT_KEY;

  if (!agentId || !clientKey) {
    return res
      .status(500)
      .json({ error: "Missing DID_AGENT_ID or DID_CLIENT_KEY in .env" });
  }

  // clientKey es para el front (embed). No es la API key.
  return res.json({ agentId, clientKey });
}

export async function getDidCredits(req, res) {
  try {
    const didApiKey = process.env.DID_API_KEY; // "username:password"
    if (!didApiKey) {
      return res.status(500).json({ error: "Missing DID_API_KEY in .env" });
    }

    const auth = Buffer.from(didApiKey, "utf8").toString("base64");

    const r = await fetch("https://api.d-id.com/credits", {
      method: "GET",
      headers: { Authorization: `Basic ${auth}` },
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      return res.status(r.status).json({
        error: "D-ID credits request failed",
        details: data,
      });
    }

    return res.json(data);
  } catch (e) {
    return res.status(500).json({
      error: "Failed to fetch D-ID credits",
      details: String(e),
    });
  }
}
