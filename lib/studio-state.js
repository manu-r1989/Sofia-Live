// Portable, bounded data for the activity studio. No provider or storage access.
import {journeyCatalogue} from './journey-state.js';
export const catalogue=[
 ['notes','Notizbücher','Notiz merken sammeln Chat Foto Wissen'],
 ['documents','Gemeinsam lesen','PDF Dokument Text Buch Fragen Quellen zusammenfassen'],
 ['learning','Lernmaterial erstellen','Lernkarten Quiz Dokument lernen üben'],
 ['speaking','Sprechübungen','Spanisch Englisch Sprache sprechen aufnehmen Aussprache'],
 ['puzzles','Rätselabenteuer','Escape Detektiv Geheimnis spielen Inventar'],
 ['roles','Rollenspiel mit mehreren Figuren','Gespräch Training Bewerbung Verhandlung Feedback'],
 ['map','Gedankenkarte','Mindmap Ideen Entscheidung Projekt verbinden'],
 ['outing','Ausflug planen','Freizeit Reise unterwegs Budget Zeit Stopps'],
 ['reader','Vorlesemodus','Text hören Audio vorlesen weiterlesen'],
 ['recommend','Aktivität finden','Vorschlag Interessen Stimmung Zeit Empfehlungen'],
 ['history','Aktivitätsverlauf','zuletzt Verlauf Ergebnisse fortsetzen'],
 ['language','Sprachtrainer','Spanisch Englisch lernen Dialog üben'],
 ['focus','Fokus mit Etappen','konzentrieren Pause Arbeit'],
 ['projects','Vorhaben','Projekt planen Aufgaben'],
 ['ideas','Ideenwerkstatt','Idee entwickeln'],
 ['decisions','Entscheidungswerkstatt','Entscheidung abwägen'],
 ['gallery','Galerie','Foto Bilder ansehen'],
 ['quiz','Quiz und Lernrunde','Wissen wiederholen Karten testen'],
 ['story','Geschichtenwelt','Geschichte erzählen Abenteuer'],
 ['profiles','Situationsprofile','Arbeit unterwegs Feierabend'],
].map(([id,title,keywords])=>({id,title,keywords}));
catalogue.push(...journeyCatalogue);
export const txt=(x='',n=3000)=>{if(typeof x!=='string'||x.length>n)throw Error('Text fehlt oder ist zu lang.');return x.trim();};
const arr=(x=[],n=40)=>{if(!Array.isArray(x)||x.length>n)throw Error('Zu viele Einträge.');return x;};
const uid=x=>{if(typeof x!=='string'||!/^[a-f\d-]{36}$/i.test(x))throw Error('Ungültige ID.');return x;};
const date=x=>{if(typeof x!=='string'||!Number.isFinite(Date.parse(x)))throw Error('Datum ungültig.');return x;};
const int=(x,a,b)=>{if(!Number.isInteger(x)||x<a||x>b)throw Error('Zahl ungültig.');return x;};
const choose=(x,a)=>{if(!a.includes(x))throw Error('Auswahl ungültig.');return x;};
const unique=a=>{if(new Set(a.map(x=>x.id)).size!==a.length)throw Error('Doppelte ID.');return a;};
const base=x=>{const title=txt(x.title,100);if(!title)throw Error('Titel fehlt.');return {id:uid(x.id),title,createdAt:date(x.createdAt),updatedAt:date(x.updatedAt||x.createdAt),archived:x.archived===true};};
export function studioDefaults(){return {favorites:[],notes:[],documents:[],practices:[],puzzles:[],roleplays:[],edges:[],outings:[],recommendations:[],reading:null,events:[],applied:[]};}
export function validateStudio(input){const v=input||studioDefaults(),o=studioDefaults();
 o.favorites=arr(v.favorites,20).map(x=>choose(x,catalogue.map(c=>c.id)));if(new Set(o.favorites).size!==o.favorites.length)throw Error('Favorit doppelt.');
 o.notes=unique(arr(v.notes,40).map(x=>({...base(x),book:txt(x.book||'Allgemein',60),text:txt(x.text),imageIds:arr(x.imageIds,4).map(uid),source:x.source?{role:choose(x.source.role,['user','assistant']),quote:txt(x.source.quote,12000),at:date(x.source.at)}:null})));
 o.documents=unique(arr(v.documents,10).map(x=>({...base(x),kind:choose(x.kind,['pdf','text','scan']),pages:arr(x.pages,60).map((p,i)=>({page:int(p.page,1,60),text:txt(p.text,20000)}))})));for(const d of o.documents){if(!d.pages.length||d.pages.some((p,i)=>p.page!==i+1)||d.pages.reduce((n,p)=>n+p.text.length,0)>60000)throw Error('Dokument auf höchstens 60 Seiten und 60.000 Zeichen begrenzen.');}
 o.practices=unique(arr(v.practices,30).map(x=>({...base(x),language:txt(x.language,60),target:txt(x.target,1000),transcript:txt(x.transcript,2000)})));
 if(o.practices.some(x=>!x.language||!x.target||!x.transcript))throw Error('Sprache, Beispielsatz und geprüftes Transkript eingeben.');
 o.puzzles=unique(arr(v.puzzles,20).map(x=>({...base(x),adventure:choose(x.adventure,['observatory','library']),step:int(x.step,0,3),hints:int(x.hints,0,9),attempts:int(x.attempts,0,999),inventory:arr(x.inventory,3).map(s=>txt(s,100)),log:arr(x.log,20).map(s=>txt(s,400))})));
 o.roleplays=unique(arr(v.roleplays,12).map(x=>({...base(x),goal:txt(x.goal,1000),scene:txt(x.scene,1500),characters:arr(x.characters,4).map(c=>({name:txt(c.name,60),role:txt(c.role,200)})),turns:arr(x.turns,20).map(t=>({id:uid(t.id),user:txt(t.user,2000),lines:arr(t.lines,4).map(l=>({name:txt(l.name,60),text:txt(l.text,1000)})),at:date(t.at)})),feedback:txt(x.feedback||'',4000)})));for(const r of o.roleplays){if(r.characters.length<2||r.characters.some(c=>!c.name||!c.role)||new Set(r.characters.map(c=>c.name.toLowerCase())).size!==r.characters.length||r.turns.some(t=>t.lines.some(l=>!r.characters.some(c=>c.name===l.name))))throw Error('Zwei bis vier eindeutig benannte Figuren und gültige Rollen wählen.');}
 o.edges=unique(arr(v.edges,60).map(x=>({id:uid(x.id),from:txt(x.from,100),to:txt(x.to,100),label:txt(x.label,100)})));if(o.edges.some(x=>!x.from||!x.to||x.from===x.to))throw Error('Unterschiedliche Knoten wählen.');
 o.outings=unique(arr(v.outings,20).map(x=>({...base(x),place:txt(x.place,150),interests:txt(x.interests,500),minutes:int(x.minutes,15,1440),budget:int(x.budget,0,10000),text:txt(x.text,6000)})));
 if(o.outings.some(x=>!x.place||!x.text))throw Error('Ort und Planungsnotizen eingeben.');
 o.recommendations=unique(arr(v.recommendations,12).map(x=>({...base(x),text:txt(x.text,4000)})));
 if(v.reading)o.reading={source:txt(v.reading.source,120),digest:txt(v.reading.digest,64),index:int(v.reading.index,0,1000),seconds:int(v.reading.seconds,0,3600)};
 o.events=unique(arr(v.events,80).map(x=>({id:uid(x.id),kind:choose(x.kind,['notes','documents','learning','speaking','puzzles','roles','map','outing','reader','recommend']),target:txt(x.target,120),title:txt(x.title,150),at:date(x.at)})));
 o.applied=arr(v.applied,80).map(uid);if(new Set(o.applied).size!==o.applied.length)throw Error('Doppelte Übernahme.');
 if(o.documents.reduce((n,d)=>n+d.pages.reduce((s,p)=>s+p.text.length,0),0)>120000||JSON.stringify(o).length>400000)throw Error('Arbeitsbereich voll. Vor weiteren Einträgen Daten sichern und nicht mehr benötigte Dokumente löschen.');return o;
}
export function mergeStudio(a,b){a=validateStudio(a);b=validateStudio(b);const out={...a,favorites:b.favorites,reading:a.reading||b.reading};for(const k of ['notes','documents','practices','puzzles','roleplays','edges','outings','recommendations','events'])out[k]=[...new Map([...a[k],...b[k]].map(x=>[x.id,x])).values()];out.events=out.events.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).slice(-80);out.applied=[...new Set([...a.applied,...b.applied])].slice(-80);return validateStudio(out);}
export function sourcePool(state){const s=validateStudio(state.featureState?.studio),v=state.featureState?.expansion;return [...s.notes.filter(x=>!x.archived).map(x=>({id:'note:'+x.id,title:x.title,text:x.text,kind:'notes',target:x.id})),...s.documents.filter(x=>!x.archived).flatMap(d=>d.pages.map(p=>({id:'document:'+d.id+':'+p.page,title:d.title+(d.kind==='text'?' · Abschnitt ':' · Seite ')+p.page,text:p.text,kind:'documents',target:d.id,page:p.page}))),...(v?.ideas||[]).filter(x=>!x.archived).map(x=>({id:'idea:'+x.id,title:x.title,text:x.text,kind:'ideas',target:x.id})),...(v?.decisions||[]).filter(x=>!x.archived).map(x=>({id:'decision:'+x.id,title:x.title,text:x.note,kind:'decisions',target:x.id}))];}
export function readingChunks(text){return String(text).match(/[\s\S]{1,1200}(?:\s|$)|[\s\S]{1,1200}/g)||[];}
export function checkedCitations(rows,sources){if(!Array.isArray(rows)||rows.length>8)throw Error('Quellenformat ungültig.');return rows.map(x=>{const s=sources.find(s=>s.id===x.source),quote=txt(x.quote,500);if(!s||!quote)throw Error('Eine Quellenstelle ließ sich nicht im gespeicherten Text bestätigen. Bitte die Originalstelle lesen.');const pattern=quote.split(/\s+/).map(word=>word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s+'),match=s.text.match(new RegExp(pattern));if(!match)throw Error('Eine Quellenstelle ließ sich nicht im gespeicherten Text bestätigen. Bitte die Originalstelle lesen.');return {source:s.id,title:s.title,quote:match[0]};});}
export const adventures={
 observatory:{title:'Das verschlossene Observatorium',intro:'Sofia und du stehen vor einer verlassenen Sternwarte. Drei Mechanismen sichern das Dach.',steps:[{text:'Am Tor steht: „Verdopple die Folge: 3, 6, 12, …“. Welche Zahl öffnet das Tor?',answers:['24'],hint:'Jede Zahl ist doppelt so groß wie die vorherige.',item:'Messingschlüssel',result:'24 öffnet das Tor. Sofia findet einen Messingschlüssel.'},{text:'Im Flur liegt eine Karte: Norden → Osten → Süden → ? Welche Himmelsrichtung fehlt?',answers:['westen','west','w'],hint:'Folge den Himmelsrichtungen im Uhrzeigersinn.',item:'Sternkarte',result:'Westen schließt die Runde. Hinter dem Kartenfach liegt eine Sternkarte.'},{text:'Auf der Sternkarte sind 5 Sterne. Zwei sind durchgestrichen, drei weitere kommen dazu. Wie viele bleiben sichtbar?',answers:['6','sechs'],hint:'Rechne 5 − 2 + 3.',item:'Dachhebel',result:'Sechs Sterne: Das Dach öffnet sich. Gemeinsam beobachtet ihr den Nachthimmel.'}]},
 library:{title:'Das Geheimnis der Bibliothek',intro:'Sofia entdeckt eine Notiz zwischen alten Büchern. Gemeinsam öffnet ihr das geheime Lesekabinett.',steps:[{text:'Eine Notiz sagt: „Ich habe Seiten, aber keine Flügel. Du kannst mich lesen.“ Was bin ich?',answers:['buch','ein buch'],hint:'Das gesuchte Ding steht überall in diesem Raum.',item:'Buchschlüssel',result:'Im Buch liegt ein Schlüssel aus Papier.'},{text:'Das Zahlenschloss zeigt: 2, 4, 8, 16, … Welche Zahl folgt?',answers:['32','zweiunddreissig','zweiunddreißig'],hint:'Verdopple die letzte Zahl.',item:'Geheime Notiz',result:'32 öffnet die Schublade mit der geheimen Notiz.'},{text:'Die Notiz sagt: „Ordne diese Buchstaben: TÜR“. Welches Wort öffnet das Kabinett?',answers:['tür','tuer','die tür'],hint:'Das Wort steht schon da und bezeichnet einen Eingang.',item:'Lesekabinett',result:'Die Tür öffnet sich. Sofia und du habt das stille Lesekabinett gefunden.'}]}
};
export function puzzleView(p){const a=adventures[p.adventure];return {...p,intro:a.intro,current:a.steps[p.step]?.text||'Abenteuer gelöst.',hint:p.hints?a.steps[p.step]?.hint||'':null,complete:p.step===a.steps.length};}
