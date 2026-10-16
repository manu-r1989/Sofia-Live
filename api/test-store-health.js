// Temporary read-only test diagnostic; intentionally excluded from production.
import {testModeRequested,publicTestMode} from '../lib/environment.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'||!testModeRequested()||!publicTestMode())return res.status(404).json({error:'Not found'});
 try{const r=await fetch(process.env.KV_REST_API_URL,{method:'POST',headers:{Authorization:'Bearer '+process.env.KV_REST_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(['PING']),signal:AbortSignal.timeout(15000)});const body=await r.text();const reason=/quota|limit|exceed|capacity/i.test(body)?'storage_limit':/unauthor|wrongpass|invalid.*token|forbidden/i.test(body)?'storage_credentials':r.ok?'connected':'storage_provider_error';return res.status(200).json({ok:r.ok,providerStatus:r.status,reason});}catch{return res.status(200).json({ok:false,reason:'storage_network_error'});}
}
