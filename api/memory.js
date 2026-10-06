import crypto from "node:crypto";
import { getSofiaLife, editCharacterState } from '../lib/character-image.js';

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



function memoryCategory(memory) {
  const text = String(memory || "").toLowerCase();
  if (text.includes("famil") || text.includes("partner") || text.includes("freund")) return "Personen";
  if (text.includes("projekt") || text.includes("arbeit") || text.includes("beruf") || text.includes("stud")) return "Projekte & Arbeit";
  if (text.includes("ziel") || text.includes("plan") || text.includes("möchte")) return "Ziele & Pläne";
  if (text.includes("immer") || text.includes("routine") || text.includes("regelmäßig")) return "Gewohnheiten";
  if (text.includes("mag ") || text.includes("lieblings") || text.includes("bevorzug") || text.includes("interess")) return "Vorlieben";
  if (text.includes("beziehung") || text.includes("spitzname") || text.includes("insider")) return "Beziehung";
  return "Sonstiges";
}

function normalizeMemoryItem(item) {
  if (typeof item === "string" && item.trim()) {
    return { text: item.trim(), category: memoryCategory(item), createdAt: null, updatedAt: null };
  }
  if (!item || typeof item !== "object" || typeof item.text !== "string" || !item.text.trim()) return null;
  return {
    text: item.text.trim().slice(0, 500),
    category: typeof item.category === "string" && item.category.trim() ? item.category.trim() : memoryCategory(item.text),
    createdAt: typeof item.createdAt === "string" ? item.createdAt : null,
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : null
  };
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
    if (req.body?.scope === 'character' && ['PUT','DELETE'].includes(req.method)) {
      try {
        const character=await editCharacterState({...req.body,value:req.method==='DELETE'?'':req.body.value});
        return res.status(200).json({ok:true,character});
      } catch(error) {
        if(!['character_conflict','character_invalid'].includes(error.message))throw error;
        return res.status(error.message==='character_conflict'?409:400).json({error:error.message==='character_conflict'?'Sofias Zustand hat sich geändert. Bitte die Ansicht neu laden.':'Diese Änderung ist nicht möglich.'});
      }
    }

    /* ========================================
       ERINNERUNGEN LESEN
    ======================================== */

    if (req.method === "GET") {

      const memories =
        await redisGetJSON(
          MEMORY_KEY,
          []
        );

      const items = Array.isArray(memories)
        ? memories.map(normalizeMemoryItem).filter(Boolean)
        : [];

      return res.status(200).json({
        memories: items.map(item => item.text),
        items,
        count: items.length,
        character: await getSofiaLife()
      });

    }


    /* ========================================
       EINE ERINNERUNG LÖSCHEN
    ======================================== */

    if (req.method === "PUT") {
      const { old_memory, new_memory, category } = req.body || {};
      if (typeof old_memory !== "string" || !old_memory.trim() ||
          typeof new_memory !== "string" || !new_memory.trim()) {
        return res.status(400).json({ error: "Alte und neue Erinnerung werden benötigt." });
      }
      if (new_memory.trim().length > 500) {
        return res.status(413).json({ error: "Die Erinnerung ist zu lang." });
      }

      const stored = await redisGetJSON(MEMORY_KEY, []);
      const memories = Array.isArray(stored) ? stored.map(normalizeMemoryItem).filter(Boolean) : [];
      const target = old_memory.trim().toLowerCase();
      const index = memories.findIndex(item => item.text.toLowerCase() === target);
      if (index === -1) {
        return res.status(404).json({ error: "Erinnerung nicht gefunden." });
      }

      const allowedCategories = [
        "Personen",
        "Vorlieben",
        "Projekte & Arbeit",
        "Ziele & Pläne",
        "Gewohnheiten",
        "Beziehung",
        "Persönliches",
        "Sonstiges"
      ];

      const nextCategory =
        typeof category === "string" && allowedCategories.includes(category)
          ? category
          : memoryCategory(new_memory);

      memories[index] = {
        ...memories[index],
        text: new_memory.trim(),
        category: nextCategory,
        updatedAt: new Date().toISOString()
      };
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
          ? stored.map(normalizeMemoryItem).filter(Boolean)
          : [];


      const target =
        memory
          .trim()
          .toLowerCase();


      const index =
        memories.findIndex(
          item =>
            item.text.toLowerCase() === target
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
