import crypto from "node:crypto";

function makeSession(password) {
  return crypto
    .createHmac("sha256", password)
    .update("sofia-authorized-session-v1")
    .digest("hex");
}

function safeEqual(a, b) {
  const aBuffer = Buffer.from(String(a));
  const bBuffer = Buffer.from(String(b));

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const configuredPassword =
    process.env.SOFIA_PASSWORD;

  if (!configuredPassword) {
    return res.status(500).json({
      error: "SOFIA_PASSWORD fehlt."
    });
  }

  const password =
    req.body?.password;

  if (
    typeof password !== "string" ||
    !safeEqual(password, configuredPassword)
  ) {
    return res.status(401).json({
      error: "Falsches Passwort."
    });
  }

  const session =
    makeSession(configuredPassword);

  res.setHeader(
    "Set-Cookie",
    [
      `sofia_session=${session}`,
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      "Max-Age=2592000"
    ].join("; ")
  );

  return res.status(200).json({
    ok: true
  });
}
