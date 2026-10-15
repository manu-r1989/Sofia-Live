// Pure validation shared by live edits and backup restoration. No provider or storage access.
export const contactKinds=['observation','opinion','thread','project','photo','activity','ritual'];
const text=(x,n)=>{if(typeof x!=='string'||x.trim().length>n)throw Error('Text fehlt oder ist zu lang.');return x.trim();};
const list=(x,n)=>{if(!Array.isArray(x)||x.length>n)throw Error('Zu viele oder ungültige Einträge.');return x;};
const id=x=>{if(typeof x!=='string'||!/^[a-f0-9-]{36}$/i.test(x))throw Error('Ungültige ID.');return x;};
const date=x=>{if(typeof x!=='string'||!Number.isFinite(Date.parse(x)))throw Error('Ungültiger Zeitpunkt.');return x;};
export function featureDefaults(){return {focus:null,initiative:{pauseUntil:null,rules:[]},cards:[],links:[],weeks:[],photoReviews:[]};}
export function validateFeatures(value){
 const v=value||featureDefaults(),out=featureDefaults();
 if(v.focus){if(!/^\d{4}-\d{2}-\d{2}$/.test(v.focus.day))throw Error('Tag ungültig.');out.focus={day:v.focus.day,text:text(v.focus.text,200)};}
 const i=v.initiative||out.initiative;out.initiative={pauseUntil:i.pauseUntil===null?null:date(i.pauseUntil),rules:list(i.rules,7).map(r=>{if(!contactKinds.includes(r.kind)||!['normal','prefer','avoid'].includes(r.mode))throw Error('Kontaktregel ungültig.');return {kind:r.kind,mode:r.mode,until:r.until===null?null:date(r.until)};})};
 if(new Set(out.initiative.rules.map(x=>x.kind)).size!==out.initiative.rules.length)throw Error('Kontaktregel doppelt.');
 out.cards=list(v.cards||[],120).map(c=>{if(!Number.isInteger(c.attempts)||c.attempts<0||!Number.isInteger(c.correct)||c.correct<0||c.correct>c.attempts||!Number.isInteger(c.streak)||c.streak<0||c.streak>c.correct)throw Error('Lernstand ungültig.');const front=text(c.front,500),back=text(c.back,1000);if(!front||!back)throw Error('Frage und Antwort fehlen.');return {id:id(c.id),front,back,deck:text(c.deck,80),source:text(c.source||'',1000),attempts:c.attempts,correct:c.correct,streak:c.streak,dueAt:date(c.dueAt),createdAt:date(c.createdAt),archived:c.archived===true};});
 out.links=list(v.links||[],60).map(x=>({id:id(x.id),projectId:id(x.projectId),milestoneId:id(x.milestoneId),goal:text(x.goal,300),archived:x.archived===true}));
 out.weeks=list(v.weeks||[],24).map(x=>({id:id(x.id),projectId:id(x.projectId),createdAt:date(x.createdAt),text:text(x.text,6000),archived:x.archived===true}));
 out.photoReviews=list(v.photoReviews||[],120).map(x=>{if(!['good','partial','missed'].includes(x.rating))throw Error('Fotobewertung ungültig.');return {id:id(x.id),imageId:id(x.imageId),rating:x.rating,text:text(x.text||'',1000),at:date(x.at)};});
 for(const name of ['cards','links','weeks','photoReviews'])if(new Set(out[name].map(x=>x.id)).size!==out[name].length)throw Error('Eintrags-ID doppelt.');return out;
}
export function initiativeRule(state,kind,now=new Date()){
 const i=state.featureState?.initiative;if(Date.parse(i?.pauseUntil)>+now)return {blocked:true,reason:'custom_pause',weight:0};
 const rule=i?.rules?.find(x=>x.kind===kind&&(!x.until||Date.parse(x.until)>+now));return {blocked:rule?.mode==='avoid',reason:rule?.mode==='avoid'?'topic_rule':null,weight:rule?.mode==='prefer'?3:1};
}
export function mergeFeatures(current,incoming){
 const a=validateFeatures(current),b=validateFeatures(incoming),out={...a,focus:b.focus||a.focus,initiative:b.initiative};
 for(const k of ['cards','links','weeks','photoReviews']){const map=new Map(a[k].map(x=>[x.id,x]));b[k].forEach(x=>map.set(x.id,x));out[k]=[...map.values()];}return validateFeatures(out);
}
export function rateCard(card,answer,now=new Date()){
 if(card.archived)throw Error('Karte ist pausiert.');if(typeof answer!=='string'||!answer.trim()||answer.length>1000)throw Error('Bitte zuerst antworten.');
 const normalize=x=>x.normalize('NFKC').trim().toLocaleLowerCase('de-DE').replace(/\s+/g,' '),correct=normalize(answer)===normalize(card.back),streak=correct?card.streak+1:0;
 return {...card,attempts:card.attempts+1,correct:card.correct+Number(correct),streak,dueAt:new Date(+now+(correct?[1,2,4,8,14][Math.min(4,streak-1)]*86400000:600000)).toISOString()};
}
