(() => {
 const KEY='sofia-form-drafts-v4142',TTL=7*86400000;
 function reconcile(base,local,remote){return {changed:JSON.stringify(local)!==JSON.stringify(base),conflict:JSON.stringify(remote)!==JSON.stringify(base)&&JSON.stringify(remote)!==JSON.stringify(local)};}
 function validDrafts(value,now=Date.now()){
  if(!value||typeof value!=='object'||Array.isArray(value))return {};return Object.fromEntries(Object.entries(value).filter(([k,v])=>k.length<=160&&v&&Number.isFinite(v.at)&&v.at<=now&&now-v.at<TTL&&Array.isArray(v.fields)&&v.fields.length<=160&&v.fields.every(x=>x&&typeof x.label==='string'&&x.label.length<=250&&['string','boolean'].includes(typeof x.value)&&String(x.value).length<=6000&&['string','boolean'].includes(typeof x.base))).slice(-30));
 }
 window.SofiaOffline={reconcile,validDrafts};if(typeof document==='undefined')return;
 const read=()=>{try{return validDrafts(JSON.parse(localStorage.getItem(KEY)));}catch{return {};}};
 const write=value=>{try{const data=JSON.stringify(value);if(data.length>500000)throw Error();localStorage.setItem(KEY,data);return true;}catch{return false;}};
 const bases=new WeakMap(),offered=new WeakSet(),editedHere=new WeakSet(),restoring=new WeakSet();
 const controls=d=>[...d.querySelectorAll('input[aria-label],textarea[aria-label],select[aria-label]')].filter(x=>!['password','file','hidden','range'].includes(x.type)&&!x.closest('[data-offline-banner]'));
 const value=x=>x.type==='checkbox'?x.checked:x.value;
 const key=d=>d.dataset?.offlineKey||d.getAttribute('aria-label')||d.querySelector('h2')?.textContent||'';
 const title=d=>d.dataset?.offlineTitle||d.getAttribute('aria-label')||d.querySelector('h2')?.textContent||'';
 function entries(d){const seen=new Map();return controls(d).map(el=>{const label=el.getAttribute('aria-label'),n=seen.get(label)||0;seen.set(label,n+1);return {el,label,field:el.dataset?.offlineField||label+'#'+n};});}
 function snapshot(d){const fields=entries(d).map(({el:x,label,field})=>{if(!bases.has(x))bases.set(x,value(x));return {label,field,value:value(x),base:bases.get(x)};});return {at:Date.now(),title:title(d),fields};}
 const same=(a,b)=>a.field?b.field===a.field:b.label===a.label;
 function remember(d){if(!d.open||restoring.has(d)||!key(d)||/Anmeldung|Entsperr/i.test(key(d)))return true;editedHere.add(d);const draft=snapshot(d),map=read();if(!draft.fields.some(x=>reconcile(x.base,x.value,x.base).changed))delete map[key(d)];else map[key(d)]=draft;const ok=write(map);if(!ok)window.SofiaWorkspace?.notice('Lokaler Entwurf konnte nicht gesichert werden. Bitte wichtige Eingaben vor dem Schließen kopieren.');return ok;}

 function offer(d){
  if(!d.open||editedHere.has(d))return;const current=snapshot(d),saved=read()[key(d)];if(!saved||offered.has(d)||!saved.fields.some(x=>current.fields.some(y=>same(x,y))))return;
  const changed=saved.fields.filter(x=>current.fields.some(y=>same(x,y)&&JSON.stringify(y.value)!==JSON.stringify(x.value)));if(!changed.length)return;offered.add(d);
  const C=window.SofiaCompanion,banner=C.node('section');banner.dataset.offlineBanner='true';banner.className='offline-draft-banner';banner.append(C.node('h3','Lokaler Formularentwurf vorhanden'),C.node('p','Vom '+new Date(saved.at).toLocaleString('de-DE')+'. Bitte mit dem geladenen Stand vergleichen. Noch nichts übertragen.'));
  const comparison=C.node('details');comparison.append(C.node('summary','Entwurf und geladenen Stand vergleichen'));for(const f of changed){const remote=current.fields.find(x=>same(f,x)),match=reconcile(f.base,f.value,remote.value);comparison.append(C.node('p',f.label+(match.conflict?' · Zwischenzeitlich geändert':'')+'\nGeladener Stand: '+String(remote.value)+'\nLokaler Entwurf: '+String(f.value)));}banner.append(comparison);
  const apply=C.button('Lokalen Entwurf in dieses Formular übernehmen',()=>{restoring.add(d);for(const entry of entries(d)){const el=entry.el,f=saved.fields.find(x=>same(x,entry));if(!f)continue;bases.set(el,value(el));if(el.type==='checkbox')el.checked=f.value===true;else if(typeof f.value==='string'){if(el.tagName==='SELECT'&&![...el.options].some(x=>x.value===f.value))continue;el.value=f.value;}el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}restoring.delete(d);remember(d);banner.replaceChildren(C.node('p','Entwurf ins Formular übernommen. Prüfen und mit dem jeweiligen Speichern-Button bestätigen.'));});
  const keep=C.button('Geladenen Stand behalten',()=>{const map=read();delete map[key(d)];write(map);banner.remove();});banner.append(apply,keep);const header=d.querySelector('.dialog-header');if(header)header.after(banner);else d.prepend(banner);
 }
 function scan(){for(const d of document.querySelectorAll('dialog[open]')){controls(d).forEach(x=>{if(!bases.has(x))bases.set(x,value(x));});offer(d);}}
 document.addEventListener('input',e=>{const d=e.target.closest?.('dialog[open]');if(d)remember(d);});document.addEventListener('change',e=>{const d=e.target.closest?.('dialog[open]');if(d)remember(d);});
 window.addEventListener('pagehide',()=>document.querySelectorAll('dialog[open]').forEach(remember));window.addEventListener('online',()=>window.SofiaWorkspace?.notice('Verbindung wiederhergestellt. Lokale Entwürfe werden nicht automatisch gesendet.'));window.addEventListener('storage',e=>{if(e.key===KEY)document.querySelectorAll('dialog[open]').forEach(d=>{offered.delete(d);offer(d);});});
 if(typeof MutationObserver!=='undefined')new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});
 function open(){const C=window.SofiaCompanion,d=C.panel('Lokale Formularentwürfe');d.classList.add('features-dialog');d.append(C.node('p','Nur auf diesem Browser, bis zu sieben Tage. Keine Bilddateien, Audiodaten oder Zugangsdaten. Den zugehörigen Menübereich öffnen, um Entwurf und geladenen Stand zu vergleichen.'));for(const [key,draft]of Object.entries(read())){const s=C.node('section');s.className='companion-card';s.append(C.node('h3',draft.title||key),C.node('p',new Date(draft.at).toLocaleString('de-DE')+' · '+draft.fields.length+' Eingabefelder'));const details=C.node('details');details.append(C.node('summary','Lokalen Inhalt ansehen'));draft.fields.forEach(x=>details.append(C.node('p',x.label+': '+String(x.value))));s.append(details,C.button('Diesen lokalen Entwurf verwerfen',()=>s.append(C.button('Verwerfen jetzt bestätigen',()=>{const map=read();delete map[key];write(map);s.remove();}))));d.append(s);}return d;}
 window.SofiaOffline.flush=()=>[...document.querySelectorAll('dialog[open]')].every(remember);
 window.SofiaOffline.submission=fields=>{const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);return dialog?{dialog,key:key(dialog),partial:Array.isArray(fields),fields:snapshot(dialog).fields.filter(x=>!Array.isArray(fields)||fields.includes(x.field)).map(x=>[x.field,x.value])}:null;};

 window.SofiaOffline.scope=(d,id,label=title(d))=>{if(!d.dataset||d.dataset.offlineKey===id)return;d.dataset.offlineKey=String(id).slice(0,160);d.dataset.offlineTitle=String(label).slice(0,200);editedHere.delete(d);offered.delete(d);d.querySelector('[data-offline-banner]')?.remove();controls(d).forEach(x=>bases.set(x,value(x)));};
 window.SofiaOffline.saved=(operation,data,started,context)=>{
  const action=data?.edit?.action||data?.edit?.operation||'',accepted=['preference_add','garment_add','look_save','look_wear','activity_start','activity_step','activity_pause','activity_resume','connection_add','connection_update','note_save','practice_save','role_create','edge_save','outing_save','preset_save','series_save','idea_save','decision_save','recap_save','session_create','situation','contact','followup','focus_start','focus_finish','card_save','focus','initiative','audio','template_save','wish_save','contact_topic_save','diary_save','upsert','conversation','preferences','profile','limits','livePreferences','run_step','path_answer','path_finish','training_create','world_save','album_save','meeting_step','folder_save','project_save','research_add','research_apply','study_answer','track_save','timeline_save','branch_create','flow_save','flow_step','review_apply','path_refresh','study_save','track_session','training_config','project_record','project_step','assign'];
  if(!(operation==='experiences_edit'&&action==='archive')&&!accepted.includes(action)&&operation!=='topic_save'&&operation!=='studio_import'&&operation!=='expansion_turn'&&!(['studio_edit','journey_edit','continuity_edit','hub_edit'].includes(operation)&&action==='apply'))return;
  const d=context?.dialog||[...document.querySelectorAll('dialog[open]')].at(-1);if(!d)return;
  const k=context?.key||key(d),map=read(),draft=map[k],current=snapshot(d).fields,submitted=context?.fields;
  if(context?.partial){if(!submitted.length||submitted.some(([field,value])=>!current.some(x=>x.field===field&&x.value===value)))return;const names=new Set(submitted.map(x=>x[0]));if(draft){draft.fields=draft.fields.filter(x=>!names.has(x.field));if(draft.fields.some(x=>x.value!==x.base))map[k]=draft;else delete map[k];}write(map);setTimeout(()=>{if(key(d)!==k)return;for(const entry of entries(d))if(names.has(entry.field))bases.set(entry.el,value(entry.el));},0);return;}
  if(draft&&draft.at>started||context&&JSON.stringify(submitted)!==JSON.stringify(current.map(x=>[x.field,x.value])))return;
  delete map[k];write(map);editedHere.add(d);setTimeout(()=>{if(key(d)!==k)return;controls(d).forEach(x=>bases.set(x,value(x)));d.querySelector('[data-offline-banner]')?.remove();},0);
 };

 window.SofiaOffline.open=open;
})();
