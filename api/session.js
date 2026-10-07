import { testModeRequested, publicTestMode, guardTestRequest, resetTestData } from "../lib/environment.js";
import crypto from "node:crypto";

function makeExpectedSession(password) {
  return crypto
    .createHmac("sha256", password)
    .update("sofia-authorized-session-v1")
    .digest("hex");
}

function getCookie(req, name) {
  const cookieHeader = req.headers.cookie || "";

  for (const cookie of cookieHeader.split(";")) {
    const trimmed = cookie.trim();
    const index = trimmed.indexOf("=");

    if (index === -1) continue;

    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1);

    if (key === name) {
      return value;
    }
  }

  return "";
}

function safeEqual(a, b) {
  const aBuffer = Buffer.from(String(a));
  const bBuffer = Buffer.from(String(b));

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    aBuffer,
    bBuffer
  );
}

export default async function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate"
  );

  if(testModeRequested()) {
    if(!publicTestMode())return res.status(503).json({authenticated:false,error:'Testkonfiguration unvollständig.'});
    if(req.method==='POST' && req.body?.operation==='reset_test') {
      if(!await guardTestRequest(req,res,'reset'))return;
      try{return res.status(200).json({ok:true,deleted:await resetTestData()});}catch{return res.status(409).json({error:'Testdaten konnten nicht zurückgesetzt werden.'});}
    }
    if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
    return res.status(200).json({authenticated:true,testMode:true,paidEnabled:process.env.SOFIA_TEST_ALLOW_PAID==='true'});
  }
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  if (!process.env.SOFIA_PASSWORD) {
    return res.status(500).json({
      authenticated: false,
      error: "Server-Konfiguration unvollständig."
    });
  }

  const receivedSession =
    getCookie(req, "sofia_session");

  const expectedSession =
    makeExpectedSession(
      process.env.SOFIA_PASSWORD
    );

  const authenticated =
    receivedSession &&
    safeEqual(
      receivedSession,
      expectedSession
    );

  if (!authenticated) {
    return res.status(401).json({
      authenticated: false
    });
  }

  return res.status(200).json({
    authenticated: true
  });
}
