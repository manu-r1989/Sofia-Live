import crypto from 'node:crypto';
import {authorizeSession,testModeRequested,publicTestMode,guardTestRequest} from './environment.js';
import {companionState,companionJobs,cancelCompanionJob,retryCompanionJob,hideCompanionJob,editCompanion,prepareCompanionPhoto,companionGameView,companionUsage,finishCompanionLive} from './character-image.js';
import {editEvolution,saveTopic,memoryAudit,resolveMemory,generateActivity,preparePhotoPlan,planningView,confirmStepTask,exportBackup,previewBackup,restoreBackup} from './companion-evolution.js';
import {editNext,diaryDraft,transcribeVoice,semanticSearch,analyzeUpload,uploadPlan,confirmUploadEdit,regionSource} from './companion-next.js';
import {editGrowth,growthOverview,calendarPreview,calendarConfirm,availableSlots,slotPreview,slotConfirm,memoryTrace,correctMemory,calendarICS,zonedInstant} from './companion-growth.js';
import {editUpgrade,learningImportPreview,learningImportConfirm,templatePreview,templateConfirm,contactPreview,dataAudit} from './companion-upgrade.js';
import {editFeatures,featureOverview,cardDraft} from './companion-features.js';
function authorized(req){if(testModeRequested())return publicTestMode();if(!process.env.SOFIA_PASSWORD)return false;const cookie=String(req.headers?.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('sofia_session='))?.slice(14)||'';const expected=crypto.createHmac('sha256',process.env.SOFIA_PASSWORD).update('sofia-authorized-session-v1').digest('hex');const a=Buffer.from(cookie),b=Buffer.from(expected);return a.length===b.length&&crypto.timingSafeEqual(a,b);}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');if(!await authorizeSession(req))return res.status(401).json({error:'Unauthorized'});
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 if(req.method==='POST'&&req.headers?.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)throw Error();}catch{return res.status(403).json({error:'Origin not allowed'});}}
 try{
  if(req.method==='GET'){const state=await companionState();return res.status(200).json({state,game:companionGameView(state.game),usage:await companionUsage(),...await companionJobs()});}
  if(req.body?.operation==='live_end')return res.status(200).json({ok:await finishCompanionLive(req.body.id)});
  const operation=req.body?.operation;
  if(operation==='upgrade_edit')return res.status(200).json(await editUpgrade(req.body.edit));
  if(operation==='cards_import_preview')return res.status(200).json(await learningImportPreview(req.body));
  if(operation==='cards_import_confirm')return res.status(200).json(await learningImportConfirm(req.body));
  if(operation==='template_preview')return res.status(200).json(await templatePreview(req.body));
  if(operation==='template_confirm')return res.status(200).json(await templateConfirm(req.body));
  if(operation==='data_audit')return res.status(200).json(await dataAudit());
  if(operation==='contact_preview'){if(!await guardTestRequest(req,res,'chat'))return;return res.status(200).json(await contactPreview(req.body));}
  if(operation==='feature_edit')return res.status(200).json(await editFeatures(req.body.edit));
  if(operation==='feature_overview')return res.status(200).json(await featureOverview());
  if(operation==='card_draft'){if(!await guardTestRequest(req,res,'chat'))return;return res.status(200).json(await cardDraft(req.body));}
  if(operation==='berlin_time')return res.status(200).json({iso:zonedInstant(req.body.local)});
  if(operation==='growth_edit')return res.status(200).json({state:await editGrowth(req.body.edit)});
  if(operation==='growth_overview')return res.status(200).json(await growthOverview());
  if(operation==='calendar_preview')return res.status(200).json(await calendarPreview(req.body));
  if(operation==='calendar_confirm')return res.status(200).json(await calendarConfirm(req.body));
  if(operation==='calendar_slots')return res.status(200).json({slots:availableSlots(await companionState(),req.body)});
  if(operation==='slot_preview')return res.status(200).json(await slotPreview(req.body));
  if(operation==='calendar_export'){const state=await companionState(),event=state.calendarEvents.find(x=>x.id===req.body.id&&x.source==='planned'&&!x.archived);if(!event)return res.status(404).json({error:'Planung nicht verfügbar.'});return res.status(200).json({ics:calendarICS(event)});}
  if(operation==='slot_confirm')return res.status(200).json(await slotConfirm(req.body));
  if(operation==='memory_correct')return res.status(200).json(await correctMemory(req.body));
  if(operation==='memory_trace')return res.status(200).json(await memoryTrace(req.body));
  if(operation==='next_edit')return res.status(200).json({state:await editNext(req.body.edit)});
  if(operation==='diary_draft')return res.status(200).json({draft:await diaryDraft(req.body)});
  if(operation==='region_source')return res.status(200).json(await regionSource(req.body));
  if(operation==='upload_plan')return res.status(200).json({plan:await uploadPlan(req.body)});
  if(['voice_transcribe','semantic_search','upload_analyze','upload_confirm'].includes(operation)){
   if(!await guardTestRequest(req,res,operation==='voice_transcribe'?'tts':'chat'))return;
   if(operation==='voice_transcribe')return res.status(200).json(await transcribeVoice(req.body.audio));
   if(operation==='semantic_search')return res.status(200).json(await semanticSearch(req.body));
   if(operation==='upload_analyze')return res.status(200).json(await analyzeUpload(req.body));
   return res.status(200).json(await confirmUploadEdit(req.body));
  }
  if(operation==='evolve'){const state=await editEvolution(req.body.edit);return res.status(200).json({state,game:companionGameView(state.game)});}
  if(operation==='topic_save')return res.status(200).json({state:await saveTopic(req.body)});
  if(operation==='memory_audit')return res.status(200).json(await memoryAudit());
  if(operation==='memory_resolve')return res.status(200).json(await resolveMemory(req.body.id,req.body.accept===true));
  if(operation==='planning_view')return res.status(200).json({projects:await planningView()});
  if(operation==='backup_export')return res.status(200).json({backup:await exportBackup(req.body.areas)});
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
