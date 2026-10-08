import { testModeRequested, publicTestMode, guardTestRequest } from "../lib/environment.js";
import crypto from "node:crypto";
const COOKIE_NAME="sofia_session",SESSION_VALUE="sofia-authorized-session-v1";
export const VOICE_SAMPLE_TEXT='Hey Manu! Schön, dass du da bist. Ich mache gerade eine kleine Pause. Erzähl mal, wie war dein Tag? Und keine Sorge: Wir kriegen das schon hin.';
export const VOICE_PROFILES=Object.freeze({
 current:{speed:1.0,instructions:'Sprich natürliches Deutsch mit einer warmen, weichen jungen weiblichen Stimme und einem sehr dezenten spanischen Akzent. Ruhig, leicht verspielt, nicht überzeichnet.'},
 warm:{speed:0.96,instructions:'Sprich natürliches, klares Deutsch mit einer warmen, weichen jungen weiblichen Stimme. Der spanische Akzent ist sehr dezent; die deutsche Aussprache bleibt klar. Klinge vertraut, entspannt und ruhig, mit weichen Satzanfängen und natürlichen kurzen Pausen. Keine Sprecherstimme, kein Flüstern, keine übertriebene Behauchung. Fragen klingen interessiert, der letzte Satz ruhig und zuversichtlich.'},
 lively:{speed:1.0,instructions:'Sprich natürliches, klares Deutsch mit einer warmen jungen weiblichen Stimme und einem dezenten spanischen Akzent. Klinge lebendig, leicht verspielt und melodisch, mit abwechslungsreichen Betonungen statt gleichförmiger Satzmelodie. Frage ehrlich interessiert, sprich den letzten Satz warm und zuversichtlich. Natürliche kurze Pausen, keine Eile, kein künstliches Lachen und keine überzeichnete oder singende Sprechweise.'},
 mixed:{speed:1.0,instructions:'Du sprichst als Sofia, eine erwachsene 24-jährige Spanierin in Hamburg. Behalte Sofias bisherigen warmen, natürlichen Grundklang und den sehr dezenten spanischen Akzent. Ergänze mehr melodische Bewegung, jugendliche Spontaneität, flippige, leicht freche Energie und Temperament bei normalem lebendigem Tempo. Sprich klares, natürliches Deutsch. Die Sprechweise ist umgangssprachlich wie im persönlichen Gespräch, nicht vorgelesen, kindlich oder wie eine professionelle Ansage. Betone abwechslungsreich und melodisch mit kleinen natürlichen Wechseln von Tonhöhe und Energie. Klinge locker, direkt und gesprächig wie beim Plaudern mit jemandem, den du magst. Kurze Pausen entstehen natürlich, ohne jeden Satz auszubremsen. Klinge beim Begrüßen erfreut und etwas temperamentvoll, beim Nachfragen ehrlich neugierig, beim beruhigenden letzten Satz weich und zuversichtlich. Kleine verspielte Nuancen statt dauernder Überdrehtheit. Kein erzwungenes Lachen, kein Flüstern, keine künstliche Behauchung, keine Akzentkarikatur. Sprich den gelieferten Text wortgetreu, füge keinen Jugendjargon oder zusätzliche Wörter hinzu. Authentizität und klare Verständlichkeit haben Vorrang.'}
});
function expectedSession(p){return crypto.createHmac("sha256",p).update(SESSION_VALUE).digest("hex");}
function cookieValue(req,n){for(const p of(req.headers.cookie||"").split(";")){const[k,...r]=p.trim().split("=");if(k===n)return decodeURIComponent(r.join("="));}return"";}
function authorized(req){
  if(testModeRequested())return publicTestMode();const p=process.env.SOFIA_PASSWORD;if(!p)return false;const a=cookieValue(req,COOKIE_NAME),e=expectedSession(p);return !!a&&a.length===e.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(e));}
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed."});
 if(!authorized(req))return res.status(401).json({error:"Unauthorized."});
 const preview=req.body?.previewProfile;
 if(preview!==undefined && (typeof preview!=='string'||!Object.hasOwn(VOICE_PROFILES,preview)))return res.status(400).json({error:'Ungültiges Hörprofil.'});
 const profile=VOICE_PROFILES[preview||'current'];
  if(!await guardTestRequest(req,res,"tts"))return;

 const text=preview!==undefined?VOICE_SAMPLE_TEXT:typeof req.body?.text==="string"?req.body.text.trim():"";
 if(!text||text.length>4096)return res.status(400).json({error:"Invalid text."});
 if(!process.env.OPENAI_API_KEY)return res.status(500).json({error:"OPENAI_API_KEY missing."});
 try{
  const r=await fetch("https://api.openai.com/v1/audio/speech",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini-tts",voice:"marin",input:text,instructions:profile.instructions,response_format:"mp3",speed:profile.speed})});
  if(!r.ok){console.error("OpenAI TTS:",r.status,(await r.text()).slice(0,500));return res.status(502).json({error:"TTS generation failed."});}
  res.setHeader("Content-Type","audio/mpeg");res.setHeader("Cache-Control","no-store");return res.status(200).send(Buffer.from(await r.arrayBuffer()));
 }catch(error){console.error("Sofia TTS:",error);return res.status(500).json({error:"TTS request failed."});}
}
