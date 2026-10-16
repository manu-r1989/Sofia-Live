import {validateExpansion,mergeExpansion,expansionDefaults} from './expansion-state.js';
import {validateStudio,mergeStudio,studioDefaults} from './studio-state.js';
// Pure validation shared by live edits and backup restoration. No provider or storage access.
export const contactKinds=['observation','opinion','thread','project','photo','activity','ritual'];
const text=(x,n)=>{if(typeof x!=='string'||x.trim().length>n)throw Error('Text fehlt oder ist zu lang.');return x.trim();};
const list=(x,n)=>{if(!Array.isArray(x)||x.length>n)throw Error('Zu viele oder ungültige Einträge.');return x;};
const id=x=>{if(typeof x!=='string'||!/^[a-f0-9-]{36}$/i.test(x))throw Error('Ungültige ID.');return x;};
const date=x=>{if(typeof x!=='string'||!Number.isFinite(Date.parse(x)))throw Error('Ungültiger Zeitpunkt.');return x;};
export function featureDefaults(){return {studio:studioDefaults(),focus:null,initiative:{pauseUntil:null,rules:[]},cards:[],links:[],weeks:[],photoReviews:[],templates:[],wishes:[],contactTopics:[],previewFeedback:[],audio:{speed:1,reply:'manual'},expansion:expansionDefaults()};}
export function validateFeatures(value){
 const v=value||featureDefaults(),out=featureDefaults();
 if(v.focus){if(!/^\d{4}-\d{2}-\d{2}$/.test(v.focus.day))throw Error('Tag ungültig.');out.focus={day:v.focus.day,text:text(v.focus.text,200)};}
 const i=v.initiative||out.initiative;out.initiative={pauseUntil:i.pauseUntil===null?null:date(i.pauseUntil),rules:list(i.rules,7).map(r=>{if(!contactKinds.includes(r.kind)||!['normal','prefer','avoid'].includes(r.mode))throw Error('Kontaktregel ungültig.');return {kind:r.kind,mode:r.mode,until:r.until===null?null:date(r.until)};})};
 if(new Set(out.initiative.rules.map(x=>x.kind)).size!==out.initiative.rules.length)throw Error('Kontaktregel doppelt.');
 out.cards=list(v.cards||[],120).map(c=>{if(!Number.isInteger(c.attempts)||c.attempts<0||!Number.isInteger(c.correct)||c.correct<0||c.correct>c.attempts||!Number.isInteger(c.streak)||c.streak<0||c.streak>c.correct)throw Error('Lernstand ungültig.');const front=text(c.front,500),back=text(c.back,1000);if(!front||!back)throw Error('Frage und Antwort fehlen.');return {id:id(c.id),front,back,deck:text(c.deck,80),source:text(c.source||'',1000),attempts:c.attempts,correct:c.correct,streak:c.streak,dueAt:date(c.dueAt),createdAt:date(c.createdAt),archived:c.archived===true};});
 out.links=list(v.links||[],60).map(x=>({id:id(x.id),projectId:id(x.projectId),milestoneId:id(x.milestoneId),goal:text(x.goal,300),archived:x.archived===true}));
 out.weeks=list(v.weeks||[],24).map(x=>({id:id(x.id),projectId:id(x.projectId),createdAt:date(x.createdAt),text:text(x.text,6000),archived:x.archived===true}));
 out.photoReviews=list(v.photoReviews||[],120).map(x=>{if(!['good','partial','missed'].includes(x.rating))throw Error('Fotobewertung ungültig.');return {id:id(x.id),imageId:id(x.imageId),rating:x.rating,text:text(x.text||'',1000),at:date(x.at)};});
 out.cards=out.cards.map((c,index)=>({...c,accepted:list(v.cards[index].accepted||[],10).map(x=>text(x,1000)).filter(Boolean),hint:text(v.cards[index].hint||'',500)}));
 out.templates=list(v.templates||[],24).map(x=>{const title=text(x.title,100);if(!title)throw Error('Vorlagenname fehlt.');return {id:id(x.id),title,goals:list(x.goals,12).map(x=>text(x,300)),steps:list(x.steps,12).map(x=>{const title=text(x.title,100);if(!title)throw Error('Schritttitel fehlt.');return {title,text:text(x.text||'',1000)};}),createdAt:date(x.createdAt),archived:x.archived===true};});
 out.wishes=list(v.wishes||[],30).map(x=>{if(!['questions','stay','topic_block','tone'].includes(x.kind))throw Error('Gesprächswunsch ungültig.');return {id:id(x.id),kind:x.kind,text:text(x.text,200),until:x.until===null?null:date(x.until),archived:x.archived===true};});
 out.contactTopics=list(v.contactTopics||[],20).map(x=>{if(!['prefer','avoid'].includes(x.mode))throw Error('Themenwahl ungültig.');const term=text(x.term,80);if(term.length<3)throw Error('Thema bitte mit mindestens drei Zeichen benennen.');return {id:id(x.id),term,mode:x.mode,until:x.until===null?null:date(x.until),archived:x.archived===true};});
 out.previewFeedback=list(v.previewFeedback||[],40).map(x=>{if(!['like','less'].includes(x.rating))throw Error('Bewertung ungültig.');return {id:id(x.id),text:text(x.text,700),rating:x.rating,at:date(x.at)};});
 const a=v.audio||out.audio;if(![.75,1,1.25,1.5].includes(a.speed)||!['manual','voice','all'].includes(a.reply))throw Error('Audioauswahl ungültig.');out.audio={speed:a.speed,reply:a.reply};
 out.expansion=validateExpansion(v.expansion);
 out.studio=validateStudio(v.studio);
 for(const name of ['cards','links','weeks','photoReviews','templates','wishes','contactTopics','previewFeedback'])if(new Set(out[name].map(x=>x.id)).size!==out[name].length)throw Error('Eintrags-ID doppelt.');return out;
}
export function initiativeRule(state,kind,now=new Date()){
 const i=state.featureState?.initiative;if(Date.parse(i?.pauseUntil)>+now)return {blocked:true,reason:'custom_pause',weight:0};
 const rule=i?.rules?.find(x=>x.kind===kind&&(!x.until||Date.parse(x.until)>+now));return {blocked:rule?.mode==='avoid',reason:rule?.mode==='avoid'?'topic_rule':null,weight:rule?.mode==='prefer'?3:1};
}
export function mergeFeatures(current,incoming){
 const a=validateFeatures(current),b=validateFeatures(incoming),out={...a,studio:mergeStudio(a.studio,b.studio),focus:b.focus||a.focus,initiative:b.initiative,audio:b.audio,expansion:mergeExpansion(a.expansion,b.expansion)};
 for(const k of ['cards','links','weeks','photoReviews','templates','wishes','contactTopics','previewFeedback']){const map=new Map(a[k].map(x=>[x.id,x]));b[k].forEach(x=>map.set(x.id,x));out[k]=[...map.values()];}return validateFeatures(out);
}
export function rateCard(card,answer,now=new Date()){
 if(card.archived)throw Error('Karte ist pausiert.');if(typeof answer!=='string'||!answer.trim()||answer.length>1000)throw Error('Bitte zuerst antworten.');
 const normalize=x=>x.normalize('NFKC').trim().toLocaleLowerCase('de-DE').replace(/\s+/g,' '),correct=[card.back,...(card.accepted||[])].some(x=>normalize(answer)===normalize(x)),streak=correct?card.streak+1:0;
 return {...card,attempts:card.attempts+1,correct:card.correct+Number(correct),streak,dueAt:new Date(+now+(correct?[1,2,4,8,14][Math.min(4,streak-1)]*86400000:600000)).toISOString()};
}
export function topicAllowed(state,value,now=new Date()){
 const normalized=String(value||'').normalize('NFKC').toLocaleLowerCase('de-DE');const blockedWishes=(state.featureState?.wishes||[]).filter(x=>x.kind==='topic_block').map(x=>({...x,term:x.text,mode:'avoid'}));return ![...(state.featureState?.contactTopics||[]),...blockedWishes].some(x=>!x.archived&&x.mode==='avoid'&&(!x.until||Date.parse(x.until)>+now)&&normalized.includes(x.term.normalize('NFKC').toLocaleLowerCase('de-DE')));
}
export function topicPreference(state,value,now=new Date()){
 const normalized=String(value||'').normalize('NFKC').toLocaleLowerCase('de-DE');return (state.featureState?.contactTopics||[]).some(x=>!x.archived&&x.mode==='prefer'&&(!x.until||Date.parse(x.until)>+now)&&normalized.includes(x.term.normalize('NFKC').toLocaleLowerCase('de-DE')))?3:1;
}
export function cardImport(value,now=new Date()){
 if(!value||value.format!=='sofia-learning-deck'||value.schema!==1)throw Error('Bitte eine Sofia-Lernstapeldatei wählen.');
 const result=featureDefaults();result.cards=list(value.cards,120).map(c=>({id:c.id,front:c.front,back:c.back,deck:c.deck||'Import',accepted:c.accepted||[],hint:c.hint||'',source:c.source||'',attempts:0,correct:0,streak:0,dueAt:now.toISOString(),createdAt:now.toISOString(),archived:false}));return validateFeatures(result).cards;
}
