(() => {
 let state=null,reading=false,syncing=false;
 const visible=()=>document.visibilityState==='visible';
 async function request(operation,extra={}){
  const r=await fetch('/api/session?social=1',{method:operation?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:operation?{'Content-Type':'application/json'}:undefined,body:operation?JSON.stringify({operation,...extra}):undefined});
  const d=await r.json();if(!r.ok)throw Error(d.error||'Nicht erreichbar.');return d;
 }
 async function badge(count){try{if(count>0)await navigator.setAppBadge?.(count);else await navigator.clearAppBadge?.();}catch{}}
 async function markRead(){
  if(!state?.unread||reading||!visible())return;
  const messages=document.getElementById('messages');if(!messages||messages.scrollHeight-messages.scrollTop-messages.clientHeight>100)return;
  const ids=new Set([...messages.querySelectorAll('[data-contact-id]')].map(x=>x.dataset.contactId));
  const seq=Math.max(0,...(state.contacts||[]).filter(x=>ids.has(x.id)).map(x=>x.sequence));
  if(!seq||seq<=state.read)return;
  reading=true;try{state=await request('read',{sequence:seq});await badge(state.unread);renderBadge();}catch{}finally{reading=false;}
 }
 function renderBadge(){const node=document.getElementById('socialAction')?.querySelector('span');if(node)node.textContent=state?.unread?'Nachrichten ('+state.unread+')':'Nachrichten';}
 async function sync(){if(syncing)return;syncing=true;try{state=await request();await badge(state.unread);renderBadge();await markRead();}catch{}finally{syncing=false;}}
 async function preferences(){
  const dialog=document.createElement('dialog');dialog.style.cssText='max-width:90vw;width:400px;background:#171722;color:white;border:0;border-radius:16px;padding:20px';
  const title=document.createElement('h2');title.textContent='Sofias Eigeninitiative';
  const label=document.createElement('label');label.textContent='Wie häufig darf Sofia sich melden?';const select=document.createElement('select');select.setAttribute('aria-label',label.textContent);select.style.cssText='display:block;width:100%;margin:12px 0;padding:10px';
  for(const [value,text]of [['off','Aus'],['quiet','Zurückhaltend · 1–3 pro Tag'],['natural','Natürlich · 3–7 pro Tag'],['active','Aktiv · 5–9 pro Tag']]){const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o);}
  const photoLabel=document.createElement('label');const photos=document.createElement('input');photos.type='checkbox';photos.setAttribute('aria-label','Eigenständige Fotos erlauben');photoLabel.append(photos,document.createTextNode(' Eigenständige Fotos erlauben'));
  const note=document.createElement('p');note.style.fontSize='13px';note.textContent='Mindestens zwei Stunden Abstand. Ruhezeit 23–8 Uhr (Hamburg). Fotos zählen mit; das Tagesbudget muss nicht ausgeschöpft werden.';
  const status=document.createElement('p');status.setAttribute('role','status');const save=document.createElement('button');save.textContent='Speichern';save.type='button';
  const push=document.createElement('button');push.textContent='Mitteilungen auf diesem Gerät aktivieren';push.type='button';push.style.cssText='display:block;margin:16px 0';
  const disable=document.createElement('button');disable.textContent='Mitteilungen auf diesem Gerät deaktivieren';disable.type='button';disable.style.cssText='display:block;margin:12px 0';
  const close=document.createElement('button');close.textContent='Schließen';close.type='button';close.onclick=()=>dialog.close();
  dialog.append(title,label,select,photoLabel,note,save,push,disable,status,close);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();close.focus();
  let registration=null;
  try{state=await request();select.value=state.preferences.level;photos.checked=state.preferences.photos;
   if('serviceWorker' in navigator)registration=await navigator.serviceWorker.ready;
   if(!state.backgroundConfigured)status.textContent='Hintergrundversand ist noch nicht eingerichtet. Bei geöffneter App kann Sofia sich bereits melden.';
  }catch(e){status.textContent=e.message;save.disabled=true;push.disabled=true;}
  if(!registration?.pushManager||typeof Notification==='undefined'){push.disabled=true;disable.disabled=true;status.textContent+=' Mitteilungen werden in diesem Browser nicht unterstützt. Auf dem iPhone Sofia vom Home-Bildschirm öffnen.';}
  save.onclick=async()=>{save.disabled=true;try{state=await request('preferences',{preferences:{level:select.value,photos:photos.checked}});status.textContent='Gespeichert.';renderBadge();}catch(e){status.textContent=e.message;}finally{save.disabled=false;}};
  push.onclick=async()=>{
   push.disabled=true;try{
    // Browser permission is requested only in this explicit user click.
    const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Mitteilungen wurden nicht erlaubt.');
    let sub=await registration.pushManager.getSubscription();if(!sub){const raw=atob(state.publicKey.replace(/-/g,'+').replace(/_/g,'/'));sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(raw,c=>c.charCodeAt(0))});}
    await request('subscribe',{subscription:sub.toJSON()});status.textContent='Mitteilungen auf diesem Gerät aktiviert.';
   }catch(e){status.textContent=e.message;}finally{push.disabled=false;}
  };
  disable.onclick=async()=>{disable.disabled=true;try{const sub=await registration.pushManager.getSubscription();if(sub){await request('unsubscribe',{subscription:sub.toJSON()});await sub.unsubscribe();}status.textContent='Mitteilungen auf diesem Gerät deaktiviert.';}catch(e){status.textContent=e.message;}finally{disable.disabled=false;}};
 }
 window.SofiaSocial={sync};
 document.getElementById('galleryAction')?.addEventListener('click',()=>window.SofiaImages?.openGallery());
 document.getElementById('socialAction')?.addEventListener('click',preferences);
 document.getElementById('messages')?.addEventListener('scroll',()=>void markRead(),{passive:true});
 document.addEventListener('visibilitychange',()=>{if(visible())void sync();});
 setInterval(()=>{if(visible())void sync();},60000);
 // Fallback while open; no automatic replay of a failed paid request.
 setInterval(()=>{if(visible())void request('tick').then(()=>window.dispatchEvent(new Event('sofia-social-updated'))).catch(()=>{});},30*60000);
})();
