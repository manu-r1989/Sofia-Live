import crypto from 'node:crypto';
import {testModeRequested,publicTestMode,guardTestRequest} from './environment.js';
import {companionState,companionJobs,cancelCompanionJob,retryCompanionJob,hideCompanionJob,editCompanion,prepareCompanionPhoto,companionGameView,companionUsage,finishCompanionLive} from './character-image.js';
import {editEvolution,saveTopic,memoryAudit,resolveMemory,generateActivity,preparePhotoPlan,planningView,confirmStepTask,exportBackup,previewBackup,restoreBackup} from './companion-evolution.js';
function authorized(req){if(testModeRequested())return publicTestMode();if(!process.env.SOFIA_PASSWORD)return false;const cookie=String(req.headers?.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('sofia_session='))?.slice(14)||'';const expected=crypto.createHmac('sha256',process.env.SOFIA_PASSWORD).update('sofia-authorized-session-v1').digest('hex');const a=Buffer.from(cookie),b=Buffer.from(expected);return a.length===b.length&&crypto.timingSafeEqual(a,b);}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 if(req.method==='POST'&&req.headers?.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)throw Error();}catch{return res.status(403).json({error:'Origin not allowed'});}}
 try{
  if(req.method==='GET'){const state=await companionState();return res.status(200).json({state,game:companionGameView(state.game),usage:await companionUsage(),...await companionJobs()});}
  if(req.body?.operation==='live_end')return res.status(200).json({ok:await finishCompanionLive(req.body.id)});
  const operation=req.body?.operation;
  if(operation==='evolve'){const state=await editEvolution(req.body.edit);return res.status(200).json({state,game:companionGameView(state.game)});}
  if(operation==='topic_save')return res.status(200).json({state:await saveTopic(req.body)});
  if(operation==='memory_audit')return res.status(200).json(await memoryAudit());
  if(operation==='memory_resolve')return res.status(200).json(await resolveMemory(req.body.id,req.body.accept===true));
  if(operation==='planning_view')return res.status(200).json({projects:await planningView()});
  if(operation==='backup_export')return res.status(200).json({backup:await exportBackup()});
  if(operation==='backup_preview')return res.status(200).json(await previewBackup(req.body.backup,req.body.areas));
  if(operation==='backup_restore')return res.status(200).json(await restoreBackup(req.body.token));
  if(['activity_generate','plan_photo','step_task'].includes(operation)){
   if(testModeRequested()&&!await guardTestRequest(req,res,'chat'))return;
   if(operation==='plan_photo')return res.status(200).json({imageRequest:await preparePhotoPlan(req.body.id)});
   if(operation==='step_task')return res.status(200).json(await confirmStepTask(req.body));
   const state=await generateActivity(req.body);return res.status(200).json({state,game:companionGameView(state.game)});
  }
  if(req.body?.operation==='edit'){const state=await editCompanion(req.body.edit);return res.status(200).json({state,game:companionGameView(state.game)});}
  if(req.body?.operation==='wish_photo'){if(testModeRequested()&&!await guardTestRequest(req,res,'chat'))return;return res.status(200).json({imageRequest:await prepareCompanionPhoto(req.body.id)});}
  if(req.body?.operation==='cancel_job'){await cancelCompanionJob(req.body.id);return res.status(200).json({ok:true});}
  if(req.body?.operation==='hide_job'){await hideCompanionJob(req.body.id);return res.status(200).json({ok:true});}
  if(req.body?.operation==='retry_job'){if(testModeRequested()&&!await guardTestRequest(req,res,'chat'))return;return res.status(200).json({imageRequest:await retryCompanionJob(req.body.id)});}
  return res.status(400).json({error:'Unbekannte Aktion.'});
 }catch(error){return res.status(409).json({error:error.message||'Die Aktion konnte nicht bestätigt werden.'});}
}
