import {randomUUID} from 'node:crypto';
import {dataPrefix} from './environment.js';
import {companionState,companionStoreCommand as command,normalizeCompanionState,COMPANION_CAS_SCRIPT,preparePortraitSeries} from './character-image.js';
import {applyExperienceEdit,activityTemplates,personalityExamples,composedLook} from './experience-state.js';
import {visibleConversation} from './message-context.js';
const key=()=>dataPrefix()+'portrait:companion';
async function history(){return visibleConversation(JSON.parse(await command('GET',dataPrefix()+'history')||'[]'),JSON.parse(await command('GET',dataPrefix()+'chat-hidden-messages')||'[]'));}
export async function experiencesOverview(){const state=await companionState();return {state,templates:activityTemplates,examples:personalityExamples(state.personality),sources:(await history()).filter(x=>['assistant','user'].includes(x.role)&&Number.isFinite(Date.parse(x.createdAt))&&typeof x.content==='string').slice(-12).map(({role,content,createdAt})=>({role,content:content.slice(0,600),createdAt}))};}
export async function experiencesEdit(input){
 if(!input||typeof input!=='object')throw Error('Bitte eine gültige Änderung übergeben.');
 const raw=await command('GET',key()),state=normalizeCompanionState(raw?JSON.parse(raw):null);let source;
 if(input.action==='connection_add'&&input.value?.sourceRef){const ref=input.value.sourceRef,t=(await history()).find(t=>t.role===ref.role&&t.createdAt===ref.createdAt&&t.content.slice(0,600)===ref.content);if(!t)throw Error('Die ausgewählte Gesprächsquelle ist nicht mehr verfügbar.');source={kind:'conversation',at:t.createdAt,message:t.content.slice(0,600)};}
 const next=applyExperienceEdit(state,{...input,verifiedSource:source},new Date(),randomUUID());
 if(await command('EVAL',COMPANION_CAS_SCRIPT,1,key(),raw||'',JSON.stringify(next))!==1)throw Error('Der Stand hat sich geändert. Bitte neu laden.');return {state:next};
}
export async function experiencesSeries(input){const state=await companionState();if(input.revision!==state.revision)throw Error('Der Stand hat sich geändert. Bitte neu laden.');const series=state.experiences.series.find(x=>x.id===input.id&&!x.archived);if(!series)throw Error('Bildgeschichte fehlt oder ist archiviert.');return {imageRequest:await preparePortraitSeries({token:input.token,motifs:series.motifs,definitionKey:JSON.stringify([series.id,series.lookId]),resolveOutfit:()=>series.lookId?composedLook(state.experiences,series.lookId).text:null})};}
