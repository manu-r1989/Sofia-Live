(() => {
 'use strict';
 const C=window.SofiaCompanion,{node,field,request,next}=C;
 const labels={top:'Oberteil',bottom:'Hose / Rock',dress:'Kleid / Einteiler',outerwear:'Jacke / Mantel',shoes:'Schuhe',accessory:'Accessoire'};
 const date=x=>new Date(x).toLocaleString('de-DE',{timeZone:'Europe/Berlin'});
 const card=(title,text='')=>{const s=node('section');s.className='companion-card';s.append(node('h3',title));if(text)s.append(node('p',text));return s;};
 const area=(parent,label,value='',max=1200)=>{const wrap=node('label',label),el=node('textarea');el.setAttribute('aria-label',label);el.maxLength=max;el.value=value;el.dataset.offlineField=label;wrap.append(el);parent.append(wrap);return el;};
 const check=(parent,label,value=false)=>{const wrap=node('label'),el=node('input');el.type='checkbox';el.checked=value;el.setAttribute('aria-label',label);el.dataset.offlineField=label;wrap.append(el,node('span',label));parent.append(wrap);return el;};
 const button=(label,fn,p)=>{const b=node('button',label);b.type='button';b.onclick=async()=>{if(b.disabled)return;b.disabled=true;try{await fn();}catch(e){p.textContent=e.message||'Aktion nicht bestätigt.';}finally{if(b.isConnected)b.disabled=false;}};return b;};
 async function surface(title,key,build){const d=C.panel(title);d.classList.add('features-dialog','experiences-dialog');window.SofiaOffline?.scope(d,'experiences:'+key,title);const p=node('p','Wird geladen …');p.setAttribute('role','status');d.append(p);try{const data=await request('experiences_overview');if(d.open)await build(d,p,data);if(p.textContent==='Wird geladen …')p.textContent='Gespeicherter Stand geladen.';}catch(e){p.textContent=e.message;}return d;}
 async function edit(data,action,value={},id=null){const fields={preference_add:['Titel der Vorliebe#0','Vorliebe für Sofias Rolle'],garment_add:['Name des Kleidungsstücks#0','Kategorie#0','Beschreibung des Kleidungsstücks'],look_save:['Name des Looks#0','Anlass des Looks#0',...data.state.experiences.garments.filter(x=>!x.archived).map(x=>'garment:'+x.id)],series_save:['Titel der Bildgeschichte#0','Motive – zwei bis vier Zeilen','Look für alle Motive#0'],activity_step:['Notiz zum aktuellen Schritt'],connection_add:['Titel des Bezugs#0','Gespeicherter Bezug','Herkunft#0',...[...data.state.moments,...data.state.experiences.connections].filter(x=>!x.archived).map(x=>'relation:'+x.id)],connection_update:['connection:'+id],initiative:[...Object.values({cooking:'Gemeinsam kochen',walk:'Ein gemeinsamer Spaziergang',movie:'Filmabend',discovery:'Kleine Entdeckungstour'}).map(x=>'Vorschläge: '+x),'Eine pausierte Aktivität gelegentlich zum Fortsetzen vorschlagen','Gespeicherte gemeinsame Bezüge passend aufgreifen']}[action]||[];const r=await request('experiences_edit',{edit:{revision:data.state.revision,action,value,id}},{fields});data.state=r.state;return r;}
 const reopen=(d,open)=>window.SofiaUI.replaceFrom(d,open);
 function archive(row,collection,d,p,data,open){return button((row.archived?'Wiederherstellen: ':'Archivieren: ')+row.title,async()=>{await edit(data,'archive',{collection,archived:!row.archived},row.id);reopen(d,open);},p);}
 async function home(){return surface('Gemeinsam erleben','home',(d,p,data)=>{
  const a=data.state.experiences.activities.find(x=>x.id===data.state.experiences.activeActivityId);
  if(a){const s=card('Fortsetzen: '+a.title,'Schritt '+(a.cursor+1)+' von '+a.steps.length+' · '+a.steps[a.cursor].title);s.append(button('Aktivität fortsetzen',()=>next(d,()=>activity(a.id),home),p));d.append(s);}
  C.menuGroup(d,'Sofia und unser Alltag','Persönliche Bezüge und bewusste gemeinsame Aktivitäten.',[
   ['Charakter und Vorlieben','Verhaltensbeispiele und gespeicherte persönliche Vorlieben.',personality],
   ['Kleiderschrank und Looks','Kleidungsstücke kombinieren und zeitweise tragen.',wardrobe],
   ['Gemeinsame Aktivitäten','Kochen, Spaziergang, Filmabend oder Entdeckungstour.',activities],
   ['Gemeinsame Bezüge','Quellen, Verbindungen und frühere Fassungen ansehen.',connections],
   ['Bildgeschichten','Zwei bis vier Motive ausdrücklich gemeinsam bestellen.',series],
   ['Passende Initiative','Erlaubte Aktivitätsvorschläge und Gesprächsbezüge wählen.',initiative]
  ],home);d.append(node('p','Auch im Chat möglich: Starte einen Filmabend. Zieh den Look Alltag für vier Stunden an. Look Alltag: Ersetze Top durch Pullover. Das hat sich geändert: Filmvorliebe: Neuer Inhalt. Namen müssen zu deinen gespeicherten Einträgen passen.'));p.textContent='Öffnen erzeugt keine Fotos und startet keine kostenpflichtige KI-Anfrage.';
 });}
 async function personality(){return surface('Charakter und Vorlieben','personality',(d,p,data)=>{
  d.append(button('Persönlichkeitsregler öffnen',()=>next(d,()=>C.characterChoices('personality'),personality),p));
  const names={humor:'Humor',wit:'Schlagfertigkeit',directness:'Direktheit',independence:'Eigenständigkeit',warmth:'Nähe',flirt:'Flirtverhalten',initiative:'Initiative',length:'Antwortlänge'};
  for(const [key,example]of data.examples)d.append(card(names[key],example));
  d.append(node('p','Die Beispiele erläutern die Einstellungen. Gespeicherte Vorlieben ergänzen die fiktionale Rolle und sind keine automatisch ermittelten Tatsachen.'));
  const form=node('form'),title=field(form,'Titel der Vorliebe'),text=area(form,'Vorliebe für Sofias Rolle','',500);form.append(button('Vorliebe speichern',async()=>{await edit(data,'preference_add',{title:title.value,text:text.value});reopen(d,personality);},p));d.append(form);
  for(const row of data.state.experiences.preferences){const s=card(row.title+(row.archived?' · Archiviert':''),row.text);s.append(archive(row,'preferences',d,p,data,personality));d.append(s);}
 });}
 async function wardrobe(lookId=null){return surface('Kleiderschrank und Looks','wardrobe:'+(lookId||'new'),(d,p,data)=>{
  const e=data.state.experiences,form=node('form');d.append(node('p','Ein Look kombiniert gespeicherte Kleidungsstücke. Archivierte Bestandteile werden nicht stillschweigend ersetzt.'));
  const title=field(form,'Name des Kleidungsstücks'),category=field(form,'Kategorie','top',Object.entries(labels)),description=area(form,'Beschreibung des Kleidungsstücks','',400);
  form.append(button('Kleidungsstück speichern',async()=>{await edit(data,'garment_add',{title:title.value,category:category.value,text:description.value});reopen(d,wardrobe);},p));d.append(form);
  const selected=e.looks.find(x=>x.id===lookId&&!x.archived),lookForm=node('form');lookForm.append(node('h3',selected?'Look bearbeiten':'Look zusammenstellen'));
  const name=field(lookForm,'Name des Looks',selected?.title||''),occasion=field(lookForm,'Anlass des Looks',selected?.occasion||''),checks=e.garments.filter(x=>!x.archived).map(x=>{const el=check(lookForm,x.title+' · '+x.text,selected?.garmentIds.includes(x.id));el.dataset.offlineField='garment:'+x.id;return {id:x.id,el};});
  lookForm.append(button('Look speichern',async()=>{await edit(data,'look_save',{title:name.value,occasion:occasion.value,garmentIds:checks.filter(x=>x.el.checked).map(x=>x.id)},selected?.id);reopen(d,wardrobe);},p));d.append(lookForm);
  const duration=field(d,'Look tragen für','4',[['1','Eine Stunde'],['4','Vier Stunden'],['12','Zwölf Stunden']]);
  if(data.state.currentOutfit)d.append(node('p','Aktuelles Outfit: '+data.state.currentOutfit.text+' · bis '+date(data.state.currentOutfit.until)));
  for(const row of e.looks){const parts=row.garmentIds.map(id=>e.garments.find(x=>x.id===id)),valid=parts.length&&parts.every(x=>x&&!x.archived),s=card(row.title+(row.archived?' · Archiviert':''),parts.map(x=>x?.text||'Kleidungsstück fehlt').join('; ')+(row.occasion?' · '+row.occasion:''));
   if(!row.archived){s.append(button('Look bearbeiten: '+row.title,()=>next(d,()=>wardrobe(row.id),wardrobe),p));const wear=button('Diesen Look jetzt tragen',async()=>{await edit(data,'look_wear',{hours:Number(duration.value)},row.id);p.textContent='Look übernommen. Text, Live und neue Fotos verwenden das zeitlich begrenzte Outfit.';},p);wear.disabled=!valid;s.append(wear);if(!valid)s.append(node('p','Mindestens ein Kleidungsstück fehlt oder ist archiviert.'));}
   s.append(archive(row,'looks',d,p,data,wardrobe));d.append(s);
  }
  const stored=node('details');stored.append(node('summary','Gespeicherte Kleidungsstücke'));for(const row of e.garments){const s=card(row.title+(row.archived?' · Archiviert':''),labels[row.category]+' · '+row.text);s.append(archive(row,'garments',d,p,data,wardrobe));stored.append(s);}d.append(stored);
 });}
 async function activities(){return surface('Gemeinsame Aktivitäten','activities',(d,p,data)=>{
  for(const [kind,t]of Object.entries(data.templates)){const s=card(t.title,t.steps.length+' Schritte, mit eigenen Notizen und gespeichertem Fortschritt.');s.append(button('Starten: '+t.title,async()=>{await edit(data,'activity_start',{kind});next(d,()=>activity(data.state.experiences.activeActivityId),activities);},p));d.append(s);}
  for(const row of [...data.state.experiences.activities].reverse()){const s=card(row.title+(row.archived?' · Archiviert':''),({active:'Aktiv',paused:'Pausiert',done:'Abgeschlossen'})[row.status]+' · '+row.cursor+'/'+row.steps.length+' Schritte');if(!row.archived)s.append(button('Öffnen: '+row.title,()=>next(d,()=>activity(row.id),activities),p));s.append(archive(row,'activities',d,p,data,activities));d.append(s);}
  p.textContent='Das sind begleitete Gesprächsaktivitäten. Reale Handlungen führt der Nutzer selbst aus. Es entstehen keine automatischen Fotos oder Termine.';
 });}
 async function activity(id){return surface('Aktivität fortsetzen','activity:'+id,(d,p,data)=>{
  const a=data.state.experiences.activities.find(x=>x.id===id&&!x.archived);if(!a)throw Error('Aktivität fehlt.');window.SofiaOffline?.scope(d,'experiences:activity:'+id+':'+a.cursor,a.title);d.append(card(a.title,({active:'Aktiv',paused:'Pausiert',done:'Abgeschlossen'})[a.status]));
  for(const [i,s]of a.steps.entries()){const box=card((i+1)+'. '+s.title,s.note||s.prompt);if(s.doneAt)box.append(node('small','Von dir abgeschlossen: '+date(s.doneAt)));d.append(box);}
  if(a.status==='paused')d.append(button('Hier fortsetzen',async()=>{await edit(data,'activity_resume',{},a.id);reopen(d,()=>activity(id));},p));
  if(a.status==='active'){
   const step=a.steps[a.cursor],note=area(d,'Notiz zum aktuellen Schritt','',1200);
   d.append(button('Diesen Schritt im Chat besprechen',()=>{const message='Begleite mich bei unserer Aktivität „'+a.title+'“, Schritt „'+step.title+'“. '+step.prompt;if(window.SofiaChatSend){d.close();window.SofiaChatSend(message);}else{p.textContent='Aktivität ist gespeichert. Bitte frage Sofia im Chat nach diesem Schritt.';}},p));
   d.append(button('Schritt abschließen',async()=>{await edit(data,'activity_step',{cursor:a.cursor,note:note.value},a.id);reopen(d,()=>activity(id));},p),button('Aktivität pausieren',async()=>{await edit(data,'activity_pause',{},a.id);reopen(d,()=>activity(id));},p));
  }
 });}
 async function connections(){return surface('Gemeinsame Bezüge','connections',(d,p,data)=>{
  const form=node('form'),title=field(form,'Titel des Bezugs'),text=area(form,'Gespeicherter Bezug','',800),source=field(form,'Herkunft','manual',[['manual','Von mir eingetragen'],...data.sources.map(x=>[x.role+'@'+x.createdAt,date(x.createdAt)+' · '+(x.role==='user'?'Du':'Sofia')+': '+x.content.slice(0,70)])]);
  const candidates=[...data.state.moments,...data.state.experiences.connections].filter(x=>!x.archived),refs=candidates.map(x=>{const el=check(form,'Verknüpfen: '+x.title);el.dataset.offlineField='relation:'+x.id;return {id:x.id,el};});
  form.append(button('Bezug speichern',async()=>{await edit(data,'connection_add',{title:title.value,text:text.value,relatedIds:refs.filter(x=>x.el.checked).map(x=>x.id),...(source.value==='manual'?{}:{sourceRef:data.sources.find(x=>x.role+'@'+x.createdAt===source.value)})});reopen(d,connections);},p));d.append(form);
  for(const row of data.state.experiences.connections){const s=card(row.title+(row.archived?' · Archiviert':''),row.text);s.append(node('small',(row.source.kind==='conversation'?'Gespräch vom ':'Manuell eingetragen am ')+date(row.source.at)));if(row.source.message)s.append(node('blockquote',row.source.message));
   if(row.relatedIds.length)s.append(node('p','Verknüpft: '+row.relatedIds.map(id=>candidates.find(x=>x.id===id)?.title||'Bezug fehlt oder ist archiviert').join(', ')));
   if(!row.archived){const update=area(s,'Das hat sich geändert: '+row.title,row.text,800);update.dataset.offlineField='connection:'+row.id;s.append(button('Diesen Bezug korrigieren',async()=>{await edit(data,'connection_update',{text:update.value},row.id);reopen(d,connections);},p));}
   if(row.history.length){const h=node('details');h.append(node('summary','Frühere Fassungen'));for(const x of row.history)h.append(node('p',date(x.at)+' · '+x.text));s.append(h);}s.append(archive(row,'connections',d,p,data,connections));d.append(s);
  }p.textContent='Quellen zeigen den damaligen Wortlaut. Eine gespeicherte Aussage ist keine automatische Bestätigung ihrer Richtigkeit.';
 });}
 async function series(){return surface('Bildgeschichten','series',(d,p,data)=>{
  const e=data.state.experiences,form=node('form'),title=field(form,'Titel der Bildgeschichte'),motifs=area(form,'Motive – zwei bis vier Zeilen','',1204),look=field(form,'Look für alle Motive','',[['','Aktuelles Outfit beim Start'],...e.looks.filter(x=>!x.archived).map(x=>[x.id,x.title])]);
  form.append(button('Bildgeschichte speichern',async()=>{await edit(data,'series_save',{title:title.value,motifs:motifs.value.split('\n').map(x=>x.trim()).filter(Boolean),lookId:look.value||null});reopen(d,series);},p));d.append(form);
  d.append(node('p','Start bestellt jedes aufgeführte Motiv einmal. Alle Motive werden gemeinsam angelegt und nacheinander ausgeführt; Kleidung und Aufnahmezeit stammen vom Start. Jedes Bild wird einzeln geprüft und kann Kosten verursachen, auch bei Fehlschlag.'));
  for(const row of e.series){const s=card(row.title+(row.archived?' · Archiviert':''),row.motifs.map((m,i)=>(i+1)+'. '+m).join('\n'));
   if(!row.archived){const key='sofia-series-ticket:'+row.id,signature=JSON.stringify([row.motifs,row.lookId]);
    async function start(fresh){let ticket;try{ticket=JSON.parse(localStorage.getItem(key)||'null');}catch{}if(!fresh&&ticket&&ticket.signature===signature&&(!Number.isFinite(ticket.at)||Date.now()-ticket.at>86400000))throw Error('Diese Auftragskennung ist abgelaufen. Prüfe den Verlauf; eine weitere Bildgeschichte muss ausdrücklich neu bestellt werden.');if(fresh||!ticket||ticket.signature!==signature){ticket={token:crypto.randomUUID(),signature,at:Date.now()};localStorage.setItem(key,JSON.stringify(ticket));}p.textContent='Bildgeschichte wird vorbereitet …';const result=await request('experiences_series',{id:row.id,revision:data.state.revision,token:ticket.token});window.dispatchEvent(new CustomEvent('sofia-companion-photo',{detail:result.imageRequest}));p.textContent=result.imageRequest.existingChoice?'Die vorhandenen Aufträge wurden wiedergefunden. Es wurden keine zusätzlichen Bilder bestellt.':row.motifs.length+' Bildaufträge angenommen. Fortschritt unter Aufträge und Status.';}
    s.append(button('Starten / vorhandenen Auftrag wiederfinden',()=>start(false),p),button('Weitere Bildgeschichte mit diesen Motiven bestellen',()=>start(true),p));
   }s.append(archive(row,'series',d,p,data,series));d.append(s);
  }
 });}
 async function initiative(){return surface('Passende Initiative','initiative',(d,p,data)=>{
  const prefs=data.state.experiences.initiative,form=node('form'),kinds=Object.entries(data.templates).map(([id,t])=>({id,el:check(form,'Vorschläge: '+t.title,prefs.activityKinds.includes(id))})),resume=check(form,'Eine pausierte Aktivität gelegentlich zum Fortsetzen vorschlagen',prefs.resume),refs=check(form,'Gespeicherte gemeinsame Bezüge passend aufgreifen',prefs.sharedReferences);
  form.append(button('Initiative speichern',async()=>{await edit(data,'initiative',{activityKinds:kinds.filter(x=>x.el.checked).map(x=>x.id),resume:resume.checked,sharedReferences:refs.checked});p.textContent='Gespeichert. Kontaktfrequenz, Ruhezeiten und Pausen gelten weiterhin.';},p));d.append(form,button('Kontaktfrequenz und Ruhezeiten öffnen',()=>next(d,()=>C.initiative(),initiative),p));
  p.textContent='Diese Auswahl erlaubt Vorschläge. Sie startet keine Aktivität und keine kostenpflichtigen Bilder automatisch. Für Vorschläge außerhalb eines laufenden Chats muss Kontaktaufnahme ebenfalls erlaubt sein.';
 });}
 window.SofiaExperiences={home,personality,wardrobe,activities,activity,connections,series,initiative};
})();
