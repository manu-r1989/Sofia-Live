/* Sofia 4.48.7 — local reading tools; no provider, voice or memory mutations. */
(() => {
  const KEYS={draft:'sofia_draft_v448',prefs:'sofia_ui_v448',pins:'sofia_pins_v448',read:'sofia_read_at_v448'};
  const defaults={font:'normal',density:'comfortable',motion:'auto'};
  const get=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
  const put=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}};
  const normalize=value=>({font:['small','normal','large'].includes(value?.font)?value.font:defaults.font,density:value?.density==='compact'?'compact':'comfortable',motion:['auto','reduced','off'].includes(value?.motion)?value.motion:'auto'});
  const keyFor=turn=>JSON.stringify([turn.role,turn.createdAt||'',turn.content]);
  const safeRetry=(text,uncertain,image)=>!uncertain&&!image&&!/aufgab|erinner|termin|kalender|erledig|lösch|verschieb|priorität|änder|mach das|nochmal|foto|bild|selfie|zeig|schick/i.test(text);
  let prefs=normalize(get(KEYS.prefs,defaults)),pins=get(KEYS.pins,[]),unread=new Map(),initialized=false,lastRead=get(KEYS.read,Date.now()),pendingDraft=null;
  if(!Array.isArray(pins))pins=[];pins=pins.filter(x=>x&&typeof x.content==='string'&&['user','assistant'].includes(x.role)).slice(-50);
  const root=document.getElementById('messages'),input=document.getElementById('input');
  function applyPreferences(){document.documentElement.dataset.chatFont=prefs.font;document.documentElement.dataset.chatDensity=prefs.density;document.documentElement.dataset.uiMotion=prefs.motion;}
  applyPreferences();
  function motion(){return prefs.motion!=='auto'||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';}
  let settled=[],draftRevision=null,lastSavedInput='',replyTo=null;
  const newIdentity=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  const pendingKey=value=>value?(value.id||JSON.stringify([value.text,value.at])):'';
  function mergeDelivery(){const disk=get(KEYS.draft,{});settled=[...settled,...(Array.isArray(disk.settled)?disk.settled:[])].filter(x=>typeof x?.text==='string'&&Number.isFinite(x.at)&&Date.now()-x.at<2*86400000);settled=[...new Map(settled.map(x=>[pendingKey(x),x])).values()].slice(-20);if(pendingDraft&&settled.some(x=>pendingKey(x)===pendingKey(pendingDraft)))pendingDraft=null;const other=disk.pending;if(typeof other?.text==='string'&&Number.isFinite(other.at)&&!settled.some(x=>pendingKey(x)===pendingKey(other))&&(!pendingDraft||other.at>pendingDraft.at))pendingDraft=other;}
  function saveDraft(){const disk=get(KEYS.draft,{});if(input&&(disk.rev||null)!==draftRevision&&input.value===lastSavedInput&&typeof disk.text==='string'){input.value=disk.text.slice(0,20000);replyTo=validReply(disk.replyTo);paintReply();window.SofiaUI?.resizeComposer(input);}mergeDelivery();const rev=newIdentity(),text=input?.value||'';const saved=put(KEYS.draft,{text,at:Date.now(),rev,settled,...(replyTo?{replyTo}:{}),...(pendingDraft?{pending:pendingDraft}:{})});if(saved){draftRevision=rev;lastSavedInput=text;}return saved;}
  function settlePending(){if(pendingDraft)settled.push({...pendingDraft});pendingDraft=null;}

  const draft=get(KEYS.draft,null);
  if(typeof draft?.pending?.text==='string'&&Number.isFinite(draft.pending.at))pendingDraft={...draft.pending,text:draft.pending.text.slice(0,20000),at:draft.pending.at};
  if(input&&typeof draft?.text==='string'&&!input.value){input.value=draft.text.slice(0,20000);window.SofiaUI?.resizeComposer(input);}
  replyTo=validReply(draft?.replyTo);paintReply();draftRevision=draft?.rev||null;lastSavedInput=input?.value||'';
  input?.addEventListener('input',saveDraft);window.addEventListener('pagehide',saveDraft);
  window.addEventListener('storage',event=>{if(event.key===KEYS.draft)mergeDelivery();});
  function clearDraft(){settlePending();saveDraft();const node=document.getElementById('connectionStatus');if(node&&/^(?:Letzter Versand|Versand noch unbestätigt)/.test(node.textContent)){node.hidden=true;node.textContent='';}}
  function beginSubmission(text,reference=null){pendingDraft={text,at:Date.now(),id:newIdentity(),...(validReply(reference)?{replyTo:validReply(reference)}:{})};saveDraft();}
  function confirmSubmission(text){if(pendingDraft?.text===text){clearDraft();}}
  function failSubmission(text,{uncertain=false}={}){if(pendingDraft?.text!==text)return;if(uncertain){saveDraft();notice('Versand noch unbestätigt. Bitte zuerst den Verlauf prüfen; der Text ist unter Einstellungen → Letzten Versand prüfen gesichert.');return;}if(input&&!input.value){input.value=pendingDraft.text;replyTo=validReply(pendingDraft.replyTo);paintReply();window.SofiaUI?.resizeComposer(input);}settlePending();saveDraft();}
  function reconcileSubmission(history){
    if(!pendingDraft||!Array.isArray(history))return false;
    const delivered=history.some((turn,i)=>turn.role==='user'&&turn.content===pendingDraft.text&&Date.parse(turn.createdAt)>=pendingDraft.at-3000&&Date.parse(turn.createdAt)<=pendingDraft.at+90000&&history[i+1]?.role==='assistant');
    if(!delivered)return false;
    clearDraft();return true;
  }
  function pendingSubmission(){if(!pendingDraft)return;const d=panel('Letzter Versand'),text=document.createElement('p');text.textContent=pendingDraft.text;const hint=document.createElement('p');hint.textContent='Die Antwort wurde auf diesem Gerät noch nicht bestätigt. Prüfe zuerst den Chatverlauf. Es wird nichts automatisch erneut gesendet.';const status=statusNode(d);d.append(hint,text,button('Als Entwurf übernehmen',()=>{if(input?.value.trim()){status.textContent='Es ist bereits ein Entwurf vorhanden.';return;}if(!pendingDraft){status.textContent='Der Versand ist inzwischen bestätigt.';return;}input.value=pendingDraft.text;replyTo=validReply(pendingDraft.replyTo);paintReply();window.SofiaUI?.resizeComposer(input);settlePending();saveDraft();d.close();input.focus();}));}
  function validReply(value){return value&&['user','assistant'].includes(value.role)&&typeof value.content==='string'&&value.content.trim()&&value.content.length<=20000&&Number.isFinite(Date.parse(value.createdAt))?{role:value.role,content:value.content,createdAt:value.createdAt}:null;}
  function paintReply(){const bar=document.getElementById('replyPreview');if(!bar)return;bar.replaceChildren();bar.hidden=!replyTo;if(!replyTo)return;const text=document.createElement('span');text.textContent='Antwort auf '+(replyTo.role==='user'?'deine Nachricht':'Sofia')+': '+replyTo.content.slice(0,180);bar.append(text,button('×',()=>{replyTo=null;paintReply();saveDraft();input?.focus();}));bar.querySelector('button')?.setAttribute('aria-label','Antwortbezug entfernen');}
  function selectReply(turn){const value=validReply(turn);if(!value)return false;replyTo=value;paintReply();saveDraft();window.SofiaChatViewport?.reveal?.();input?.focus();return true;}
  function takeReply(){const selected=replyTo;replyTo=null;paintReply();return selected;}
  function decorateReply(node,value){const turn=validReply(value);if(!node||!turn||node.querySelector('.message-quote'))return;const quote=button((turn.role==='user'?'Du':'Sofia')+' · '+turn.content.slice(0,180),()=>{if(!jump(turn))notice('Die zitierte Nachricht ist im aktuell geladenen Verlauf nicht mehr enthalten.');});quote.className='message-quote';quote.setAttribute('aria-label','Zitierte Nachricht im Chat anzeigen');node.insertBefore(quote,node.firstChild||null);}
  function nodeTurn(node){return {role:node.classList.contains('user')?'user':'assistant',content:node.dataset.messageText||node.textContent,createdAt:node.dataset.createdAt||'',...(node.dataset.contactId?{contactId:node.dataset.contactId}:{})};}
  function turnNodes(){return root?[...root.querySelectorAll('.msg[data-created-at]')].filter(n=>!n.dataset.portraitStatus&&n.dataset.messageText):[];}
  function viewportAtLatest(){return !!root&&root.scrollHeight-root.clientHeight-root.scrollTop<=64;}
  function canRead(){return document.visibilityState==='visible'&&viewportAtLatest()&&!document.querySelector('dialog[open],.memoryOverlay.open,.chatPanel.chat-hidden');}
  function paintUnread(){
    root?.querySelectorAll('.message-unread').forEach(n=>n.remove());
    if(typeof Event!=='undefined')window.dispatchEvent?.(new Event('sofia-unread-updated'));
    const first=turnNodes().find(n=>unread.has(keyFor(nodeTurn(n))));
    if(first){const line=document.createElement('div');line.className='message-unread';line.textContent='Neue Nachrichten';root.insertBefore(line,first);}
    const button=document.getElementById('chatLatest');if(button){button.textContent='↓';const label=unread.size?'Zur neuesten Nachricht · '+unread.size+' ungelesen':'Zur neuesten Nachricht';button.setAttribute('aria-label',label);button.title=label;button.hidden=viewportAtLatest()&&unread.size===0;}
  }
  function readVisible(){if(!canRead())return;unread.clear();lastRead=Math.max(lastRead,...turnNodes().map(n=>Date.parse(n.dataset.createdAt)||0));put(KEYS.read,lastRead);paintUnread();}
  function acknowledgeContacts(ids){const read=new Set(ids);let changed=false;for(const [key,turn]of unread){if(turn.contactId&&read.has(turn.contactId)){unread.delete(key);changed=true;}}if(changed)paintUnread();}
  function reconcile(next,previous){
    reconcileSubmission(next);
    const known=new Set((previous||[]).map(keyFor));
    for(const turn of next||[]){if(turn.role!=='assistant')continue;const time=Date.parse(turn.createdAt);if(Number.isFinite(time)&&time>lastRead&&(!initialized||!known.has(keyFor(turn))))unread.set(keyFor(turn),turn);}
    initialized=true;
  }
  function decorate(node){
    if(!node||node.querySelector('.message-menu')||node.dataset.portraitStatus||!node.dataset.messageText||!node.dataset.createdAt)return;
    const menu=document.createElement('button');menu.type='button';menu.className='message-menu';menu.textContent='⋯';menu.setAttribute('aria-label','Nachrichtenaktionen');menu.onclick=()=>messageMenu(node);let meta=node.querySelector('.message-meta');if(!meta){meta=document.createElement('div');meta.className='message-meta';const time=node.querySelector('time.message-time');if(time)meta.append(time);node.append(meta);}meta.append(menu);
    let timer;node.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;timer=setTimeout(()=>{timer=null;messageMenu(node);},650);});for(const name of ['pointerup','pointercancel','pointerleave','pointermove'])node.addEventListener(name,()=>{clearTimeout(timer);timer=null;});
  }
  function refresh(){turnNodes().forEach(decorate);paintUnread();}
  function added(node,restoring){decorate(node);if(!restoring&&node.classList.contains('sofia')){const turn=nodeTurn(node);if(Date.parse(turn.createdAt)>lastRead)unread.set(keyFor(turn),turn);}paintUnread();}
  root?.addEventListener('scroll',readVisible,{passive:true});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveDraft();else readVisible();});
  document.addEventListener('close',()=>requestAnimationFrame(readVisible),true);
  function button(label,action){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;return b;}
  function panel(title){const d=document.createElement('dialog');d.className='workspace-dialog';const h=document.createElement('h2');h.textContent=title;const close=button('Schließen',()=>d.close());d.append(h,close);document.body.append(d);window.SofiaUI?.enhanceDialog(d,title);d.addEventListener('close',()=>d.remove(),{once:true});d.showModal();close.focus();return d;}
  function statusNode(dialog){const p=document.createElement('p');p.setAttribute('role','status');dialog.append(p);return p;}
  function jump(turn){const node=turnNodes().find(n=>keyFor(nodeTurn(n))===keyFor(turn));if(!node)return false;node.scrollIntoView({block:'center',behavior:motion()});node.classList.add('message-found');setTimeout(()=>node.classList.remove('message-found'),2200);return true;}
  function messageMenu(node){const turn=nodeTurn(node),dialog=panel('Nachrichtenaktionen'),status=statusNode(dialog);
    dialog.append(button('Antworten / Zitieren',()=>{dialog.close();selectReply(turn);}));
    dialog.append(button('Text kopieren',async()=>{try{await navigator.clipboard.writeText(turn.content);status.textContent='Text kopiert.';}catch{status.textContent='Kopieren ist hier nicht verfügbar. Du kannst den Nachrichtentext markieren.';}}));
    const pinButton=button('',()=>{const marked=pins.some(p=>keyFor(p)===keyFor(turn));if(marked)pins=pins.filter(p=>keyFor(p)!==keyFor(turn));else if(pins.length>=50){status.textContent='Bitte zuerst eine der 50 angehefteten Nachrichten lösen.';return;}else pins.push(turn);status.textContent=put(KEYS.pins,pins)?(marked?'Markierung entfernt.':'Nachricht auf diesem Gerät angeheftet.'):'Die Markierung konnte auf diesem Gerät nicht gespeichert werden.';paintPin();});function paintPin(){pinButton.textContent=pins.some(p=>keyFor(p)===keyFor(turn))?'Nicht mehr anheften':'Nachricht anheften';}paintPin();dialog.append(pinButton);
  }
  function resultRow(turn,dialog){const row=document.createElement('div');row.className='workspace-result';const time=document.createElement('small');time.textContent=(turn.role==='user'?'Du':'Sofia')+' · '+(turn.createdAt?new Date(turn.createdAt).toLocaleString('de-DE',{timeZone:'Europe/Berlin',dateStyle:'medium',timeStyle:'short'}):'Ohne Zeitstempel');const text=document.createElement('p');text.textContent=turn.content;row.append(time,text);row.append(button('Im Chat anzeigen',()=>{dialog.dataset.returnToLatest='true';dialog.close();requestAnimationFrame(()=>{if(!jump(turn))window.SofiaWorkspace.notice('Diese Nachricht ist im aktuell geladenen Verlauf nicht mehr enthalten.');});}));return row;}
  function search(){const dialog=panel('Im Chat suchen'),field=document.createElement('input');field.type='search';field.placeholder='Suchbegriff';field.setAttribute('aria-label','Chat durchsuchen');const note=document.createElement('p');note.textContent='Suche im aktuell geladenen Gesprächsverlauf.';const results=document.createElement('div');results.className='workspace-results';dialog.append(field,note,results);field.focus();field.oninput=()=>{results.replaceChildren();const term=field.value.trim().toLocaleLowerCase('de-DE');if(!term){note.textContent='Suche im aktuell geladenen Gesprächsverlauf.';return;}const turns=turnNodes().map(nodeTurn).filter(t=>t.content.toLocaleLowerCase('de-DE').includes(term));note.textContent=turns.length+' Treffer';for(const turn of turns)results.append(resultRow(turn,dialog));};}
  function pinned(){const dialog=panel('Angeheftete Nachrichten'),note=document.createElement('p');note.textContent='Auf diesem Gerät gespeichert. Diese Markierungen ändern Sofias Gedächtnis nicht.';dialog.append(note);const list=document.createElement('div');dialog.append(list);const render=()=>{list.replaceChildren();if(!pins.length){const empty=document.createElement('p');empty.textContent='Noch keine Nachrichten angeheftet.';list.append(empty);}for(const turn of [...pins].reverse()){const row=resultRow(turn,dialog);row.append(button('Markierung entfernen',()=>{pins=pins.filter(t=>keyFor(t)!==keyFor(turn));put(KEYS.pins,pins);render();}));list.append(row);}};render();}
  function settings(){const dialog=panel('Einstellungen'),note=document.createElement('p');note.textContent='Darstellung und Entwürfe gelten auf diesem Gerät.';dialog.append(note);const status=statusNode(dialog);
    if(pendingDraft)dialog.append(button('Letzten Versand prüfen',()=>{dialog.close();pendingSubmission();}));
    function select(label,name,options){const wrapper=document.createElement('label');wrapper.textContent=label;const field=document.createElement('select');field.setAttribute('aria-label',label);for(const [value,text]of options){const o=document.createElement('option');o.value=value;o.textContent=text;field.append(o);}field.value=prefs[name];field.onchange=()=>{prefs=normalize({...prefs,[name]:field.value});applyPreferences();status.textContent=put(KEYS.prefs,prefs)?'Darstellung gespeichert.':'Darstellung konnte nicht gespeichert werden.';};wrapper.append(field);dialog.append(wrapper);}
    select('Schriftgröße','font',[['small','Klein'],['normal','Normal'],['large','Groß']]);select('Chatdichte','density',[['comfortable','Angenehm'],['compact','Kompakt']]);select('Oberflächenbewegung','motion',[['auto','Systemeinstellung'],['reduced','Reduziert'],['off','Aus']]);
    if(updateAvailable)dialog.append(button('Neue Version laden',applyUpdate));
    const preview=document.createElement('p');preview.className='chat-preview';preview.textContent='Sofia: Na, wie läuft dein Tag?';dialog.append(preview);
    const hint=document.createElement('p');hint.textContent='Diese Bewegungsauswahl betrifft die Oberfläche. Sofias Haltungswechsel bleiben eigenständig.';dialog.append(hint);
    const mute=button('',()=>{document.getElementById('mute')?.click();paintMute();});function paintMute(){mute.textContent=localStorage.getItem('sofia_audio_muted')==='true'?'Tonausgabe einschalten':'Tonausgabe stummschalten';}paintMute();dialog.append(mute);
    dialog.append(button('Mitteilungen und Eigeninitiative',()=>{dialog.close();window.SofiaSocial?.preferences?.();}),button('Sofia einstellen · Gespräch, Fotos und Erinnerungen',()=>{dialog.close();if(window.SofiaCharacterSettings?.open)window.SofiaCharacterSettings.open();else document.getElementById('memoryAction')?.click();}));
  }
  let updateAvailable=false;
  let controlled=!!navigator.serviceWorker?.controller;
  navigator.serviceWorker?.addEventListener?.('controllerchange',()=>{
    if(controlled){updateAvailable=true;notice('Eine neue Version ist verfügbar. Du kannst sie in den Einstellungen laden; dein Entwurf bleibt erhalten.');}
    controlled=true;
  });
  async function applyUpdate(){
    const phase=document.getElementById('mode')?.dataset.phase;
    if(window.SofiaImages?.isGenerating||document.getElementById('voiceToggle')?.checked||['thinking','photo','listening','speaking'].includes(phase)){notice('Bitte beende zuerst die laufende Aktion oder Live-Unterhaltung.');return;}
    if(!saveDraft()){notice('Dein Entwurf konnte nicht gesichert werden. Bitte kopiere ihn vor dem Aktualisieren.');return;}
    if(window.SofiaCharacterSettings?.flush&&!await window.SofiaCharacterSettings.flush()){notice('Bitte zuerst die ungespeicherten Einstellungen sichern.');return;}
    window.location.reload();
  }
  function connection(){const offline=navigator.onLine===false,node=document.getElementById('connectionStatus');if(node){node.hidden=!offline;node.textContent=offline?'Offline · Dein Entwurf bleibt erhalten. Nachrichten werden nicht automatisch gesendet.':'';}document.getElementById('mode')?.setAttribute('data-connection',offline?'offline':'online');}
  window.addEventListener('offline',connection);window.addEventListener('online',()=>{connection();const mode=document.getElementById('mode');if(mode?.textContent.trim()==='Verbindungsfehler')mode.textContent='bereit';notice('Wieder verbunden. Ausstehende Nachrichten werden nicht automatisch erneut gesendet.');});connection();
  function notice(text){const node=document.getElementById('connectionStatus');if(node){node.hidden=false;node.textContent=text;}}
  function failed(node,text,{uncertain=false,image=false,knownRejected=false}={}){if(!node)return;const retry=safeRetry(text,uncertain,image)&&knownRejected;const action=button(retry?'Nachricht erneut senden':'Entwurf wiederherstellen',()=>{if(retry){if(window.SofiaChatSend?.(text)){action.disabled=true;}}else if(input){if(input.value.trim()){notice('Es ist bereits ein Entwurf vorhanden. Kopiere bei Bedarf die frühere Nachricht.');return;}input.value=text;if(pendingDraft?.text===text){replyTo=validReply(pendingDraft.replyTo);paintReply();settlePending();}saveDraft();window.SofiaUI?.resizeComposer(input);input.focus();notice(uncertain?'Ausgang unbestätigt. Aufgabenstand vor einer Wiederholung prüfen.':'Entwurf wiederhergestellt. Prüfe vor dem Senden den bisherigen Gesprächsstand.');}});action.className='message-retry';node.append(action);}
  const menuButton=document.getElementById('workspaceAction');menuButton?.addEventListener('click',()=>{const d=panel('Chatwerkzeuge');d.append(button('Heute',()=>{d.close();window.SofiaToday?.open();}),button('Einstellungen',()=>{d.close();settings();}),button('Im Chat suchen',()=>{d.close();search();}),button('Angeheftete Nachrichten',()=>{d.close();pinned();}));});
  const mode=document.getElementById('mode');
  function paintPhase(){if(!mode)return;const text=mode.textContent.trim();mode.dataset.phase=/Foto/.test(text)?'photo':/denkt/.test(text)?'thinking':/hört/.test(text)?'listening':/spricht/.test(text)?'speaking':/fehl|Fehler|Pause|warten/i.test(text)?'attention':'ready';}
  if(mode&&typeof MutationObserver!=='undefined')new MutationObserver(paintPhase).observe(mode,{childList:true,characterData:true,subtree:true});paintPhase();
  window.SofiaWorkspace={selectReply,takeReply,decorateReply,replyReference:()=>replyTo,acknowledgeContacts,messages:()=>turnNodes().map(nodeTurn),unreadMessages:()=>[...unread.values()],showMessage:turn=>{window.SofiaChatViewport?.reveal?.();return jump(turn);},motion,clearDraft,beginSubmission,confirmSubmission,failSubmission,reconcileSubmission,pendingSubmission,saveDraft,refresh,reconcile,added,readVisible,notice,failed,settings,search,pinned,normalize,keyFor,safeRetry};
  if(pendingDraft)notice('Letzter Versand noch unbestätigt. Du kannst ihn in den Einstellungen prüfen; es erfolgt kein automatisches Senden.');
  mergeDelivery();refresh();
})();

