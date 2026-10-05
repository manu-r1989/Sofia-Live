import crypto from "node:crypto";

const MEMORY_KEY = "sofia:main:longterm";


/* ========================================
   SESSION
======================================== */

function makeExpectedSession(password) {
  return crypto
    .createHmac("sha256", password)
    .update("sofia-authorized-session-v1")
    .digest("hex");
}


function getCookie(req, name) {
  const cookieHeader =
    req.headers.cookie || "";

  for (const cookie of cookieHeader.split(";")) {
    const trimmed = cookie.trim();
    const index = trimmed.indexOf("=");

    if (index === -1) continue;

    const key =
      trimmed.slice(0, index);

    const value =
      trimmed.slice(index + 1);

    if (key === name) {
      return value;
    }
  }

  return "";
}


function safeEqual(a, b) {
  const aBuffer =
    Buffer.from(String(a));

  const bBuffer =
    Buffer.from(String(b));

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    aBuffer,
    bBuffer
  );
}


function isAuthorized(req) {
  if (!process.env.SOFIA_PASSWORD) {
    return false;
  }

  const received =
    getCookie(
      req,
      "sofia_session"
    );

  if (!received) {
    return false;
  }

  const expected =
    makeExpectedSession(
      process.env.SOFIA_PASSWORD
    );

  return safeEqual(
    received,
    expected
  );
}


/* ========================================
   API
======================================== */

export default async function handler(req, res) {

  res.setHeader(
    "Cache-Control",
    "no-store"
  );


  if (!isAuthorized(req)) {
    return res.status(401).json({
      error: "Nicht autorisiert."
    });
  }


  if (
    !process.env.KV_REST_API_URL ||
    !process.env.KV_REST_API_TOKEN
  ) {
    return res.status(500).json({
      error: "Redis-Konfiguration fehlt."
    });
  }


  try {

    /* ========================================
       ERINNERUNGEN LESEN
    ======================================== */

    if (req.method === "GET") {

      const memories =
        await redisGetJSON(
          MEMORY_KEY,
          []
        );

      const cleanMemories =
        Array.isArray(memories)
          ? memories.filter(
              memory =>
                typeof memory === "string" &&
                memory.trim()
            )
          : [];


      return res.status(200).json({
        memories: cleanMemories,
        count: cleanMemories.length
      });

    }


    /* ========================================
       EINE ERINNERUNG LÖSCHEN
    ======================================== */

    if (req.method === "PUT") {
      const { old_memory, new_memory } = req.body || {};
      if (typeof old_memory !== "string" || !old_memory.trim() ||
          typeof new_memory !== "string" || !new_memory.trim()) {
        return res.status(400).json({ error: "Alte und neue Erinnerung werden benötigt." });
      }
      if (new_memory.trim().length > 500) {
        return res.status(413).json({ error: "Die Erinnerung ist zu lang." });
      }

      const stored = await redisGetJSON(MEMORY_KEY, []);
      const memories = Array.isArray(stored) ? stored : [];
      const target = old_memory.trim().toLowerCase();
      const index = memories.findIndex(item =>
        typeof item === "string" && item.trim().toLowerCase() === target
      );
      if (index === -1) {
        return res.status(404).json({ error: "Erinnerung nicht gefunden." });
      }

      memories[index] = new_memory.trim();
      await redisSetJSON(MEMORY_KEY, memories);
      return res.status(200).json({ ok: true, memories, count: memories.length });
    }

    if (req.method === "DELETE") {

      const { memory } =
        req.body || {};


      if (
        typeof memory !== "string" ||
        !memory.trim()
      ) {
        return res.status(400).json({
          error:
            "Keine Erinnerung angegeben."
        });
      }


      const stored =
        await redisGetJSON(
          MEMORY_KEY,
          []
        );


      let memories =
        Array.isArray(stored)
          ? stored
          : [];


      const target =
        memory
          .trim()
          .toLowerCase();


      const index =
        memories.findIndex(
          item =>
            typeof item === "string" &&
            item
              .trim()
              .toLowerCase() ===
              target
        );


      if (index === -1) {
        return res.status(404).json({
          error:
            "Erinnerung nicht gefunden."
        });
      }


      memories.splice(
        index,
        1
      );


      await redisSetJSON(
        MEMORY_KEY,
        memories
      );


      return res.status(200).json({
        ok: true,
        memories,
        count: memories.length
      });

    }


    return res.status(405).json({
      error: "Method not allowed"
    });


  } catch (error) {

    console.error(
      "Sofia Memory API:",
      error
    );


    return res.status(500).json({
      error:
        "Memory konnte nicht geladen werden."
    });

  }

}


/* ========================================
   REDIS GET
======================================== */

async function redisGetJSON(
  key,
  fallback
) {

  const response =
    await fetch(
      process.env.KV_REST_API_URL,
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${process.env.KV_REST_API_TOKEN}`,

          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify([
            "GET",
            key
          ])
      }
    );


  if (!response.ok) {
    throw new Error(
      `Redis GET HTTP ${response.status}`
    );
  }


  const data =
    await response.json();


  if (data.error) {
    throw new Error(
      data.error
    );
  }


  if (!data.result) {
    return fallback;
  }


  try {
    return JSON.parse(
      data.result
    );
  } catch {
    return fallback;
  }

}


/* ========================================
   REDIS SET
======================================== */

async function redisSetJSON(
  key,
  value
) {

  const response =
    await fetch(
      process.env.KV_REST_API_URL,
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${process.env.KV_REST_API_TOKEN}`,

          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify([
            "SET",
            key,
            JSON.stringify(value)
          ])
      }
    );


  if (!response.ok) {
    throw new Error(
      `Redis SET HTTP ${response.status}`
    );
  }


  const data =
    await response.json();


  if (data.error) {
    throw new Error(
      data.error
    );
  }


  return data.result;

}
