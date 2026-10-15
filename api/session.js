import handleSocial from '../lib/social-handler.js';
import handleCompanion from '../lib/companion-handler.js';
import {authorizeSession,handleDeviceSessions,testModeRequested,publicTestMode,guardTestRequest,resetTestData} from '../lib/environment.js';
export default async function handler(req,res){
 if(req.query?.companion==='1')return handleCompanion(req,res);
 if(req.query?.social==='1')return handleSocial(req,res);
 if(req.query?.sessions==='1')return handleDeviceSessions(req,res);
 res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');
 if(testModeRequested()){
  if(!publicTestMode())return res.status(503).json({authenticated:false,error:'Testkonfiguration unvollständig.'});
  if(req.method==='POST'&&req.body?.operation==='reset_test'){if(!await guardTestRequest(req,res,'reset'))return;try{return res.status(200).json({ok:true,deleted:await resetTestData()});}catch{return res.status(409).json({error:'Testdaten konnten nicht zurückgesetzt werden.'});}}
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  return res.status(200).json({authenticated:true,testMode:true,paidEnabled:process.env.SOFIA_TEST_ALLOW_PAID==='true'});
 }
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 if(!process.env.SOFIA_PASSWORD)return res.status(500).json({authenticated:false,error:'Server-Konfiguration unvollständig.'});
 if(!await authorizeSession(req))return res.status(401).json({authenticated:false});
 return res.status(200).json({authenticated:true});
}


