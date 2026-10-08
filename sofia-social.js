(() => {
 let state=null,reading=false,syncing=false;
 let requestSequence=0,stateSequence=0;
 function acceptState(next){
  if(!next||!Number.isSafeInteger(next.sequence))return next;
  if(state&&next.sequence<state.sequence)return state;
  const read=Math.min(next.sequence,Math.max(state?.read||0,next.read||0));
  const base=state&&next.sequence===state.sequence&&next.requestSequence<stateSequence?state:next;
  stateSequence=Math.max(stateSequence,next.requestSequence||0);return {...base,read,unread:Math.max(0,next.sequence-read)};
 }
 const deviceLabel=()=>/iPhone|iPad/.test(navigator.userAgent)?'iPhone / iPad':/Android/.test(navigator.userAgent)?'Android':/Mac/.test(navigator.userAgent)?'Mac':'Web-App';
 async function localDeviceId(endpoint){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint)))].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,24);}
 const visible=()=>document.visibilityState==='visible';
 const chatVisible=()=>visible()&&!document.querySelector('.chatPanel.chat-hidden, dialog[open]');
 async function request(operation,extra={}){
  const sequence=++requestSequence;
  const r=await fetch('/api/session?social=1',{method:operation?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:operation?{'Content-Type':'application/json'}:undefined,body:operation?JSON.stringify({operation,...extra}):undefined});
  const d=await r.json();if(!r.ok)throw Error(d.error||'Nicht erreichbar.');return acceptState({...d,requestSequence:sequence});
 }
 async function badge(count){try{if(count>0)await navigator.setAppBadge?.(count);else await navigator.clearAppBadge?.();}catch{}}
 async function markRead(){
  if(!state?.unread||reading||!chatVisible())return;
  const messages=document.getElementById('messages');if(!messages||(messages.getClientRects&&messages.getClientRects().length===0)||messages.scrollHeight-messages.scrollTop-messages.clientHeight>100)return;
  const ids=new Set([...messages.querySelectorAll('[data-contact-id]')].map(x=>x.dataset.contactId));
  const seq=Math.max(0,...(state.contacts||[]).filter(x=>ids.has(x.id)).map(x=>x.sequence));
  if(!seq||seq<=state.read)return;
  reading=true;try{state=await request('read',{sequence:seq});await badge(state.unread);renderBadge();}catch{}finally{reading=false;}
 }
 function renderBadge(){const node=document.getElementById('socialAction')?.querySelector('span');if(node)node.textContent=state?.unread?'Nachrichten ('+state.unread+')':'Nachrichten';}
 async function sync(){if(syncing)return;syncing=true;try{state=await request();await badge(state.unread);renderBadge();await markRead();}catch{}finally{syncing=false;}}
 async function preferences(){
  const dialog=document.createElement('dialog');dialog.style.cssText='max-width:90vw;width:400px;max-height:85dvh;overflow:auto;background:#171722;color:white;border:0;border-radius:16px;padding:20px';
  const title=document.createElement('h2');title.textContent='Sofias Eigeninitiative';
  const label=document.createElement('label');label.textContent='Wie häufig darf Sofia sich melden?';const select=document.createElement('select');select.setAttribute('aria-label',label.textContent);select.style.cssText='display:block;width:100%;margin:12px 0;padding:10px';
  for(const [value,text]of [['off','Aus'],['quiet','Zurückhaltend · 1–3 pro Tag'],['natural','Natürlich · 3–7 pro Tag'],['active','Aktiv · 5–9 pro Tag']]){const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o);}
  const photoLabel=document.createElement('label');const photos=document.createElement('input');photos.type='checkbox';photos.setAttribute('aria-label','Eigenständige Fotos erlauben');photoLabel.append(photos,document.createTextNode(' Eigenständige Fotos erlauben'));
  const quiet=document.createElement('fieldset'),quietLegend=document.createElement('legend');quietLegend.textContent='Ruhezeit in Hamburg';quiet.append(quietLegend);
  const quietStart=document.createElement('input'),quietEnd=document.createElement('input');quietStart.type=quietEnd.type='time';quietStart.setAttribute('aria-label','Ruhezeit beginnt');quietEnd.setAttribute('aria-label','Ruhezeit endet');quietStart.disabled=quietEnd.disabled=true;quiet.append(quietStart,document.createTextNode(' bis '),quietEnd);
  const pause=document.createElement('fieldset'),pauseLegend=document.createElement('legend'),pauseStatus=document.createElement('p');pauseLegend.textContent='Eigeninitiative pausieren';pause.append(pauseLegend,pauseStatus);
  function paintPause(){const until=Date.parse(state?.preferences.pausedUntil);pauseStatus.textContent=until>Date.now()?'Pausiert bis '+new Date(until).toLocaleString('de-DE',{timeZone:'Europe/Berlin'})+' (Hamburg).':'Keine zusätzliche Pause aktiv.';}
  const pauseButtons=[];for(const [duration,text]of [['hour','Eine Stunde pausieren'],['today','24 Stunden pausieren'],['resume','Pause beenden']]){const button=document.createElement('button');button.type='button';button.textContent=text;button.disabled=true;pauseButtons.push(button);button.onclick=async()=>{for(const b of pauseButtons)b.disabled=true;try{state=await request('pause',{duration});paintPause();status.textContent=duration==='resume'?'Pause beendet. Ruhezeiten gelten weiterhin.':'Pause gespeichert.';}catch(e){status.textContent=e.message;}finally{for(const b of pauseButtons)b.disabled=false;}};pause.append(button);}
  const note=document.createElement('p');note.style.fontSize='13px';note.textContent='Zwei bis drei Stunden variierender Abstand, passend zu Sofias Alltag; bei unbeantworteten Nachrichten längere Pausen. Fotos zählen mit; das Tagesbudget muss nicht ausgeschöpft werden.';
  const status=document.createElement('p');status.id='sofia-push-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');status.style.cssText='display:block;min-height:44px;padding:12px;background:#252535;color:#fff;border-radius:10px;font-size:14px;line-height:1.4';status.textContent='Mitteilungsstatus wird geprüft …';const save=document.createElement('button');save.textContent='Speichern';save.type='button';save.disabled=true;select.disabled=true;photos.disabled=true;
  const push=document.createElement('button');push.textContent='Mitteilungen auf diesem Gerät aktivieren';push.type='button';push.style.cssText='display:block;margin:16px 0';
  const disable=document.createElement('button');disable.textContent='Mitteilungen auf diesem Gerät deaktivieren';disable.type='button';disable.style.cssText='display:block;margin:12px 0';
  const today=document.createElement('fieldset');const legend=document.createElement('legend');legend.textContent='Nur für heute (Hamburg)';today.append(legend);
  const dayButtons=[];for(const [mode,text]of [['less','Heute weniger'],['normal','Wie gewohnt'],['more','Heute mehr']]){const button=document.createElement('button');button.type='button';button.textContent=text;button.disabled=true;dayButtons.push([mode,button]);button.onclick=async()=>{button.disabled=true;try{state=await request('today',{mode});paintToday();status.textContent='Tagesauswahl gespeichert. Gilt bis Mitternacht in Hamburg.';}catch(e){status.textContent=e.message;}finally{paintToday();}};today.append(button);}
  function paintToday(){for(const [mode,button]of dayButtons){button.disabled=!state||state.preferences.level==='off';button.setAttribute('aria-pressed',String((state?.preferences.today||'normal')===mode));button.style.cssText='margin:3px;padding:8px;border-radius:8px;border:1px solid #555;background:'+((state?.preferences.today||'normal')===mode?'#4b496a':'#252535')+';color:white';}}
  const devices=document.createElement('section');devices.setAttribute('aria-label','Mitteilungsgeräte');
  function paintDevices(){devices.replaceChildren();const heading=document.createElement('h3');heading.textContent='Mitteilungsgeräte';devices.append(heading);const labels={registered:'Eingerichtet',delivered:'Zuletzt zugestellt',expired:'Abonnement abgelaufen',delivery_failed:'Letzte Zustellung fehlgeschlagen'};
   if(!state?.devices?.length){const empty=document.createElement('p');empty.textContent='Noch kein Gerät eingerichtet.';devices.append(empty);}
   for(const device of state?.devices||[]){const row=document.createElement('p');const text=document.createElement('span');text.textContent=device.label+' · '+(labels[device.status]||'Eingerichtet')+(device.lastDeliveryAt?' · '+new Date(device.lastDeliveryAt).toLocaleString('de-DE'):'');row.append(text);
    const remove=document.createElement('button');remove.type='button';remove.textContent='Entfernen';remove.setAttribute('aria-label',device.label+' aus Mitteilungsgeräten entfernen');remove.style.marginLeft='8px';remove.onclick=async()=>{remove.disabled=true;try{state=await request('remove_device',{deviceId:device.id});paintDevices();status.textContent='Gerät für weitere Mitteilungen deaktiviert. Erneute Aktivierung ist auf dem Gerät möglich.';}catch(e){status.textContent=e.message;remove.disabled=false;}};row.append(remove);devices.append(row);
   }
   const help=document.createElement('p');help.style.fontSize='12px';help.textContent='Bei abgelaufenem Abonnement auf dem betroffenen Gerät erneut aktivieren. Eine Gerätefreigabe allein bestätigt noch keine tatsächliche Zustellung.';devices.append(help);
  }
  const close=document.createElement('button');close.textContent='Schließen';close.type='button';close.onclick=()=>dialog.close();
  const openUnread=document.createElement('button');openUnread.type='button';openUnread.textContent='Neue Nachrichten ansehen';openUnread.disabled=true;openUnread.onclick=()=>{const contact=state?.contacts?.find(x=>x.sequence>state.read);dialog.close();if(contact)window.dispatchEvent(new CustomEvent('sofia-contact-open',{detail:{contactId:contact.id}}));};
  dialog.append(title,openUnread,label,select,photoLabel,note,quiet,pause,today,status,save,push,disable,devices,close);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();close.focus();
  let registration=null;push.disabled=true;disable.disabled=true;
  const within=(promise)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Die Einrichtung dauert zu lange. Bitte schließe dieses Fenster und versuche es erneut.')),20000);})]).finally(()=>clearTimeout(timer));};
  try{state=await request();openUnread.disabled=!state.unread;select.value=state.preferences.level;photos.checked=state.preferences.photos;quietStart.value=state.preferences.quietStart||'23:00';quietEnd.value=state.preferences.quietEnd||'08:00';quietStart.disabled=quietEnd.disabled=false;for(const b of pauseButtons)b.disabled=false;paintPause();save.disabled=false;select.disabled=false;photos.disabled=false;paintToday();paintDevices();
   if('serviceWorker' in navigator)registration=await within(navigator.serviceWorker.ready);
   const sub=registration?.pushManager?await within(registration.pushManager.getSubscription()):null;
   status.textContent=typeof Notification!=='undefined'&&Notification.permission==='denied'?'Mitteilungen sind im Browser blockiert. Bitte erlaube sie in den Website-Einstellungen.':sub&&Notification.permission==='granted'?'Mitteilungen auf diesem Gerät eingerichtet.':'Mitteilungen auf diesem Gerät noch nicht aktiviert.';
   if(sub){const id=await localDeviceId(sub.endpoint),device=state.devices?.find(x=>x.id===id);if(!device||device.status==='expired')status.textContent='Lokale Freigabe vorhanden, aber das Abonnement ist nicht aktiv. Bitte erneut aktivieren.';}
   if(!state.backgroundConfigured)status.textContent+=' Hintergrundversand ist noch nicht eingerichtet. Bei geöffneter App kann Sofia sich bereits melden.';
  }catch(e){status.textContent=e.message;push.disabled=true;}
  push.disabled=!registration?.pushManager;disable.disabled=!registration?.pushManager;
  if(!registration?.pushManager||typeof Notification==='undefined'){push.disabled=true;disable.disabled=true;status.textContent+=' Mitteilungen sind derzeit nicht verfügbar. Auf dem iPhone Sofia vom Home-Bildschirm öffnen.';}
  save.onclick=async()=>{save.disabled=true;try{state=await request('preferences',{preferences:{level:select.value,photos:photos.checked,quietStart:quietStart.value,quietEnd:quietEnd.value}});status.textContent='Gespeichert.';paintToday();paintPause();renderBadge();}catch(e){status.textContent=e.message;}finally{save.disabled=false;}};
  push.onclick=async()=>{
   push.disabled=true;push.textContent='Aktivierung läuft …';status.textContent='Bitte bestätige die Mitteilungsfreigabe deines Browsers.';try{
    // Browser permission is requested only in this explicit user click.
    const permission=await Notification.requestPermission();if(permission!=='granted')throw Error(permission==='denied'?'Mitteilungen wurden blockiert. Bitte erlaube sie in den Website-Einstellungen.':'Aktivierung abgebrochen. Mitteilungen sind nicht aktiviert.');
    status.textContent='Freigabe erteilt. Mitteilungen werden eingerichtet …';
    let sub=await within(registration.pushManager.getSubscription());
    if(sub){const currentId=await localDeviceId(sub.endpoint),server=state.devices?.find(x=>x.id===currentId);const key=sub.options?.applicationServerKey;const expected=atob(state.publicKey.replace(/-/g,'+').replace(/_/g,'/'));if(!server||server.status==='expired'||(key&&[...new Uint8Array(key)].some((x,i)=>x!==expected.charCodeAt(i)))){await within(sub.unsubscribe());sub=null;}}
    if(!sub){const raw=atob(state.publicKey.replace(/-/g,'+').replace(/_/g,'/'));sub=await within(registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(raw,c=>c.charCodeAt(0))}));}
    await within(request('subscribe',{subscription:sub.toJSON(),label:deviceLabel()}));state=await request();paintDevices();status.textContent='✓ Mitteilungen auf diesem Gerät aktiviert.'+(state.backgroundConfigured?'':' Der Hintergrundversand muss noch eingerichtet werden.');
   }catch(e){status.textContent=e.message;}finally{push.disabled=false;push.textContent='Mitteilungen auf diesem Gerät aktivieren';}
  };
  disable.onclick=async()=>{disable.disabled=true;try{const sub=await registration.pushManager.getSubscription();if(sub){await request('unsubscribe',{subscription:sub.toJSON()});await sub.unsubscribe();}state=await request();paintDevices();status.textContent='Mitteilungen auf diesem Gerät deaktiviert.';}catch(e){status.textContent=e.message;}finally{disable.disabled=false;}};
 }
 window.SofiaSocial={sync};
 document.getElementById('galleryAction')?.addEventListener('click',()=>window.SofiaImages?.openGallery());
 document.getElementById('socialAction')?.addEventListener('click',preferences);
 document.getElementById('messages')?.addEventListener('scroll',()=>void markRead(),{passive:true});
 document.addEventListener('visibilitychange',()=>{if(visible())void sync();});
 window.addEventListener('online',()=>void sync());
 navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='sofia-chat-open'){void sync();window.dispatchEvent(new Event('sofia-social-updated'));if(/^[0-9a-f-]{36}$/i.test(event.data.contactId||''))window.dispatchEvent(new CustomEvent('sofia-contact-open',{detail:{contactId:event.data.contactId}}));}});
 window.addEventListener('sofia-contact-visible',event=>{const id=event.detail?.contactId;void (async()=>{try{if(!state?.contacts?.some(x=>x.id===id))state=await request();const contact=state?.contacts?.find(x=>x.id===id);if(contact&&chatVisible()){state=await request('read',{sequence:contact.sequence});await badge(state.unread);renderBadge();}}catch{}})();});
 setInterval(()=>{if(visible())void sync();},60000);
 // Fallback while open; no automatic replay of a failed paid request.
 setInterval(()=>{if(visible())void request('tick').then(()=>window.dispatchEvent(new Event('sofia-social-updated'))).catch(()=>{});},30*60000);
})();

