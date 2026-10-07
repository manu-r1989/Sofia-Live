import { testModeRequested, publicTestMode, guardTestRequest } from "../lib/environment.js";
import crypto from "node:crypto";
const COOKIE_NAME="sofia_session",SESSION_VALUE="sofia-authorized-session-v1";
function expectedSession(p){return crypto.createHmac("sha256",p).update(SESSION_VALUE).digest("hex");}
function cookieValue(req,n){for(const p of(req.headers.cookie||"").split(";")){const[k,...r]=p.trim().split("=");if(k===n)return decodeURIComponent(r.join("="));}return"";}
function authorized(req){
  if(testModeRequested())return publicTestMode();const p=process.env.SOFIA_PASSWORD;if(!p)return false;const a=cookieValue(req,COOKIE_NAME),e=expectedSession(p);return !!a&&a.length===e.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(e));}
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed."});
 if(!authorized(req))return res.status(401).json({error:"Unauthorized."});
  if(!await guardTestRequest(req,res,"tts"))return;

 const text=typeof req.body?.text==="string"?req.body.text.trim():"";
 if(!text||text.length>4096)return res.status(400).json({error:"Invalid text."});
 if(!process.env.OPENAI_API_KEY)return res.status(500).json({error:"OPENAI_API_KEY missing."});
 try{
  const r=await fetch("https://api.openai.com/v1/audio/speech",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini-tts",voice:"marin",input:text,instructions:"Sprich natürliches Deutsch mit einer warmen, weichen jungen weiblichen Stimme und einem sehr dezenten spanischen Akzent. Ruhig, leicht verspielt, nicht überzeichnet.",response_format:"mp3",speed:1.0})});
  if(!r.ok){console.error("OpenAI TTS:",r.status,(await r.text()).slice(0,500));return res.status(502).json({error:"TTS generation failed."});}
  res.setHeader("Content-Type","audio/mpeg");res.setHeader("Cache-Control","no-store");return res.status(200).send(Buffer.from(await r.arrayBuffer()));
 }catch(error){console.error("Sofia TTS:",error);return res.status(500).json({error:"TTS request failed."});}
}