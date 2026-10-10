(() => {
  const active = new Map();
  const pending = new Set();
  const completed = new Set();
  const remotePending = new Set();
  function updatePhotoStatus() {
    const mode=document.getElementById('mode');
    if(!mode)return;
    if(pending.size || remotePending.size)mode.textContent='nimmt ein Foto auf';
    else if(mode.textContent==='nimmt ein Foto auf')mode.textContent='bereit';
  }
  let selectionVersion=0;
  const failureReply = 'Ich bin gerade nicht in der passenden Umgebung für ein Foto. Frag mich gern gleich noch einmal.';
  let referenceId = null;
  try { referenceId=localStorage.getItem('sofia-photo-reference'); } catch {}
  function rememberReference(id) { referenceId=id;try { localStorage.setItem('sofia-photo-reference',id); } catch {} }
  function hideAcknowledgment(image, anchorNode) {
    const node=anchorNode || document.getElementById('messages')?.querySelector(`[data-portrait-request-id="${image.anchorId || image.id}"]`);
    if(!node)return;
    const text=(node.dataset.messageText || node.textContent).trim();
    if(/^Gib mir einen kleinen Moment[.!]?$/i.test(text))node.hidden=true;
    else if(/\s+Gib mir einen kleinen Moment[.!]?$/i.test(text)){node.textContent=text.replace(/\s+Gib mir einen kleinen Moment[.!]?$/i,'');node.dataset.messageText=node.textContent;window.SofiaTimeline?.decorate(node,node.dataset.createdAt);}
  }
  const valid = id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);
  function slotFor(id) {
    if (!valid(id)) return null;
    let slot = document.getElementById('portrait-slot-' + id);
    if (!slot) {
      slot = document.createElement('div'); slot.id='portrait-slot-' + id; slot.hidden=true;
      document.getElementById('messages')?.append(slot);
    }
    return slot;
  }
  function anchor(id, node) {
    const slot=slotFor(id);
    const first=document.getElementById('messages')?.querySelector(`[data-portrait-request-id="${id}"]`);
    if (slot && node?.parentNode && (!first || first===node)) node.parentNode.insertBefore(slot,node.nextSibling);
    hideAcknowledgment({id},node);
  }
  function legacyPhotoAnchor(image){
    // Modern photos have an exact receipt; never replace it with text matching.
    if(image.anchorId)return null;
    const requestedAt=Date.parse(image.requestedAt);
    if(!Number.isFinite(requestedAt))return null;
    const messages=document.getElementById('messages');if(!messages)return null;
    const candidates=[...messages.querySelectorAll('.msg.user')].filter(node=>image.requestMessage&&(node.dataset.messageText||node.textContent)===image.requestMessage&&Number.isFinite(Date.parse(node.dataset.createdAt))&&Math.abs(Date.parse(node.dataset.createdAt)-requestedAt)<=120000);
    if(candidates.length!==1)return null;
    const user=candidates[0],reply=user.nextSibling;
    if(reply?.classList?.contains('sofia'))return !reply.dataset.portraitRequestId||reply.dataset.portraitRequestId===image.id?reply:null;
    return user;
  }
  function locate(event) {
    const messages=document.getElementById('messages');
    if (!messages) return null;
    const slot=slotFor(event.id);
    let node=messages.querySelector(`[data-portrait-request-id="${event.anchorId || event.id}"]`);
    if(!node)node=legacyPhotoAnchor(event);
    if (node) anchor(event.id,node);
    else if (!pending.has(event.id)) {
      // Truncated history: retained older photographs belong BEFORE newer turns.
      let older=document.getElementById('portrait-older');
      if (!older) { older=document.createElement('div'); older.id='portrait-older'; messages.insertBefore(older,messages.firstChild); }
      older.append(slot);
    }
    return slot;
  }
  function openPhoto(image, gallerySequence=null) {
    gallerySequence ||= ()=>[...galleryItems.values()].filter(x=>!['pending','failed','expired'].includes(x.status)&&retained(x)).sort((a,b)=>sentTime(b)-sentTime(a));
    let url='/api/chat?image='+image.id;

      selectionVersion++;rememberReference(image.id);
      const dialog = document.createElement('dialog');dialog.id='sofia-photo-'+image.id;dialog.className='sofia-photo-view';window.SofiaUI?.enhanceDialog(dialog,'Foto von Sofia');
      dialog.style.cssText = 'max-width:92vw;max-height:92vh;border:0;border-radius:16px;padding:16px;background:#171722;color:white';
      const full = document.createElement('img'); full.src = url; full.alt = image.caption || 'Sofia';
      full.style.cssText = 'display:block;max-width:85vw;max-height:75vh;object-fit:contain';
      const close = document.createElement('button'); close.textContent = 'Schließen'; close.type='button'; close.onclick=()=>dialog.close();
      const mobile=typeof navigator!=='undefined' && (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent||'') || (/Mac/i.test(navigator.userAgent||'') && navigator.maxTouchPoints>1));
      const download=document.createElement('button');download.type='button';download.textContent=mobile?'Bild speichern / teilen':'Herunterladen';download.style.cssText='margin-left:16px';download.disabled=true;
      const status=document.createElement('p');status.setAttribute('role','status');status.style.cssText='font-size:13px;margin-bottom:0';status.textContent='Bild wird zum Speichern vorbereitet.';
      let blob=null,file=null,objectUrl=null,closed=false,downloadVersion=0;
      // Prepare before the click: iOS share requires an immediate user gesture.
      async function prepareDownload() {
        const version=++downloadVersion,requestedImage=image,requestedUrl=url;
        download.disabled=true;status.textContent='Bild wird zum Speichern vorbereitet.';
        try {
          const response=await fetch(requestedUrl,{credentials:'same-origin',cache:'no-store'});
          if(!response.ok)throw new Error('download_failed');
          const preparedBlob=await response.blob();if(!preparedBlob.size || !/^image\/jpeg(?:;|$)/i.test(preparedBlob.type))throw new Error('download_invalid');
          if(closed || version!==downloadVersion)return;
          blob=preparedBlob;
          if(typeof File!=='undefined')file=new File([blob],'sofia-'+requestedImage.id+'.jpg',{type:'image/jpeg'});
          download.disabled=false;status.textContent='';
        } catch {if(version!==downloadVersion)return;blob=null;file=null;if(!closed){download.disabled=false;status.textContent='Bild konnte nicht vorbereitet werden. Bitte noch einmal versuchen.';}}
      }
      download.onclick=async()=>{
        if(!blob){await prepareDownload();return;}
        download.disabled=true;
        try {
          if(mobile && file && typeof navigator.share==='function' && typeof navigator.canShare==='function' && navigator.canShare({files:[file]})) {
            await navigator.share({files:[file]});status.textContent='Teilen abgeschlossen. Ob das Foto gespeichert wurde, bestimmt die gewählte App.';
          } else {
            if(mobile){status.textContent='Teilen wird hier nicht unterstützt. Halte das Bild gedrückt und wähle „In Fotos sichern“.';return;}
            objectUrl ||= URL.createObjectURL(blob);
            const link=document.createElement('a');link.href=objectUrl;link.download='sofia-'+image.id+'.jpg';document.body.append(link);link.click();link.remove();status.textContent='Download gestartet. Prüfe den Downloadordner deines Browsers.';
          }
        } catch(error) {status.textContent=error?.name==='AbortError'?'Teilen abgebrochen.':'Speichern oder Teilen ist gerade nicht möglich. Bitte erneut versuchen.';}
        finally {download.disabled=false;}
      };
      const remove=document.createElement('button');remove.type='button';remove.textContent='Bild löschen';remove.style.cssText='margin-left:16px';remove.onclick=async()=>{
        if(!window.confirm('Dieses Foto endgültig aus Galerie und Chat löschen?'))return;
        const deleting=image;remove.disabled=true;try{const response=await fetch('/api/session?social=1',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'delete_image',imageId:deleting.id})});if(!response.ok)throw Error();show({...deleting,status:'expired'});if(referenceId===deleting.id){referenceId=null;try{localStorage.removeItem('sofia-photo-reference');}catch{}}dialog.close();const gallery=document.getElementById('sofia-gallery');if(gallery){gallery.close();openGallery();}}catch{status.textContent='Das Bild konnte nicht gelöscht werden.';remove.disabled=false;}
      };
      const navigation=document.createElement('div');const counter=document.createElement('span');counter.className='photo-count';counter.setAttribute('role','status');const photoDate=document.createElement('time');photoDate.className='photo-date';
      navigation.style.cssText='display:flex;justify-content:space-between;gap:16px;margin:12px 0';
      const previous=document.createElement('button'),next=document.createElement('button');previous.type=next.type='button';previous.textContent='‹ Vorheriges';next.textContent='Nächstes ›';previous.setAttribute('aria-label','Vorheriges Foto');next.setAttribute('aria-label','Nächstes Foto');
      const sequence=()=>typeof gallerySequence==='function'?gallerySequence().filter(x=>!['pending','failed','expired'].includes(x.status)&&retained(x)):[];
      function updateNavigation(){const items=sequence(),index=items.findIndex(x=>x.id===image.id);previous.disabled=index<=0;next.disabled=index<0 || index>=items.length-1;counter.textContent=(index>=0?index+1:1)+' / '+Math.max(1,items.length);photoDate.textContent=Number.isFinite(sentTime(image))?new Date(sentTime(image)).toLocaleString('de-DE',{timeZone:'Europe/Berlin',dateStyle:'medium',timeStyle:'short'}):'Datum unbekannt';}
      function changePhoto(offset){const items=sequence(),index=items.findIndex(x=>x.id===image.id),target=index<0?null:items[index+offset];if(!target)return;
        image=target;url='/api/chat?image='+image.id;dialog.id='sofia-photo-'+image.id;full.src=url;full.alt=image.caption||'Sofia';selectionVersion++;rememberReference(image.id);
        if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}blob=null;file=null;chatVisibility.hidden=!image.chatHidden;updateNavigation();updateCompare();updateChat();updateSource();paintLineage();compass.hidden=true;perspective.setAttribute('aria-expanded','false');detailBox.hidden=true;customBox.hidden=true;detail.setAttribute('aria-expanded','false');custom.setAttribute('aria-expanded','false');combinedBox.hidden=true;combinedToggle.setAttribute('aria-expanded','false');for(const select of changeSelects)select.value='';paintChangeSummary();void prepareDownload();
      }
      previous.onclick=()=>changePhoto(-1);next.onclick=()=>changePhoto(1);navigation.append(previous,counter,next);
      if(gallerySequence){
        full.style.touchAction='pan-y pinch-zoom';let touch=null;
        full.addEventListener('touchstart',event=>{touch=event.touches?.length===1?{x:event.touches[0].clientX,y:event.touches[0].clientY,id:event.touches[0].identifier}:null;},{passive:true});
        full.addEventListener('touchcancel',()=>{touch=null;},{passive:true});
        full.addEventListener('touchend',event=>{const start=touch;touch=null;const end=[...(event.changedTouches||[])].find(x=>x.identifier===start?.id);if(!start||!end||event.touches?.length)return;const dx=end.clientX-start.x,dy=end.clientY-start.y;if(Math.abs(dx)>=50 && Math.abs(dx)>Math.abs(dy)*1.4)changePhoto(dx<0?1:-1);},{passive:true});
        dialog.addEventListener('keydown',event=>{if(['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName))return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();changePhoto(event.key==='ArrowLeft'?-1:1);}});
      }
      const toolbar=document.createElement('div');toolbar.className='photo-toolbar';remove.className='photo-delete';toolbar.append(download,remove);
      const header=document.createElement('div');header.className='photo-header';header.append(photoDate,close);
      const follow=document.createElement('div');follow.className='photo-follow-ups';follow.setAttribute('aria-label','Foto ändern und vergleichen');
      const lineage=document.createElement('div');lineage.className='photo-series-nav';lineage.setAttribute('aria-label','Fotoreihe');
      function showRelative(target){if(!target||!retained(target))return;dialog.dataset.returnToLatest='true';dialog.close();openPhoto(target,gallerySequence);}
      function paintLineage(){lineage.replaceChildren();const parent=galleryItems.get(image.sourceId);if(parent&&retained(parent))lineage.append(nodeButton('Vorgänger öffnen',()=>showRelative(parent)));const rootPhoto=seriesRoot();if(rootPhoto&&rootPhoto.id!==image.id&&rootPhoto.id!==parent?.id)lineage.append(nodeButton('Ursprung öffnen',()=>showRelative(rootPhoto)));for(const child of [...galleryItems.values()].filter(x=>x.sourceId===image.id&&retained(x)).slice(-4))lineage.append(nodeButton('Folgevariante · '+new Date(sentTime(child)).toLocaleTimeString('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'}),()=>showRelative(child)));}
      function nodeButton(text,action){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=action;return b;}
      const perspective=document.createElement('button'),detail=document.createElement('button');perspective.type=detail.type='button';perspective.textContent='Andere Perspektive';detail.textContent='Detail ansehen';
      const detailBox=document.createElement('div');detailBox.className='photo-detail-controls';detailBox.hidden=true;
      const detailInput=document.createElement('input');detailInput.maxLength=160;detailInput.placeholder='Welches Detail möchtest du sehen?';detailInput.setAttribute('aria-label','Gewünschtes Fotodetail');
      const detailSend=document.createElement('button');detailSend.type='button';detailSend.textContent='Detail zeigen';const regions=document.createElement('div');regions.className='photo-detail-selector';regions.setAttribute('aria-label','Bildbereich auswählen');for(const [label,value]of [['Gesicht','das Gesicht'],['Oberteil','das Oberteil'],['Hände','die Hände'],['Hintergrund','den Hintergrund']]){const region=document.createElement('button');region.type='button';region.textContent=label;region.onclick=()=>{detailInput.value=value;detailInput.focus();};regions.append(region);}detailBox.append(regions,detailInput,detailSend);
      function requestPhoto(message){const selected=sourcePhoto();if(!selected){status.textContent='Das ausgewählte Ausgangsfoto ist nicht mehr verfügbar.';return false;}const selectedId=selected.id;rememberReference(selectedId);if(!window.SofiaPhotoAction?.(message,selectedId)){status.textContent='Bitte warte, bis die laufende Aktion beendet ist, und prüfe die Verbindung.';return false;}dialog.dataset.returnToLatest='true';const gallery=document.getElementById('sofia-gallery');if(gallery)gallery.dataset.returnToLatest='true';dialog.close();gallery?.close();window.SofiaChatViewport?.latest?.();return true;}
      const sourceBox=document.createElement('label');sourceBox.className='photo-source-choice';sourceBox.textContent='Ausgangsfoto für die Änderung';
      const sourceChoice=document.createElement('select');sourceChoice.setAttribute('aria-label','Ausgangsfoto auswählen');
      const sourcePreview=document.createElement('img');sourcePreview.className='photo-source-preview';sourcePreview.alt='Ausgewähltes Ausgangsfoto';
      function seriesRoot(){let current=image;const seen=new Set();while(current?.sourceId&&!seen.has(current.id)){seen.add(current.id);const parent=galleryItems.get(current.sourceId);if(!parent||!retained(parent))return null;current=parent;}return current;}
      function sourcePhoto(){const selected=galleryItems.get(sourceChoice.value);return selected&&retained(selected)&&!['pending','failed','expired'].includes(selected.status)?selected:null;}
      function previewSource(){const selected=sourcePhoto();sourcePreview.hidden=!selected;sourcePreview.src=selected?'/api/chat?image='+selected.id:'';}
      function updateSource(){sourceChoice.replaceChildren();const choices=[[image,'Dieses Foto'],[galleryItems.get(image.sourceId),'Vorheriges Ausgangsfoto'],[seriesRoot(),'Ursprung der Fotoreihe']];const seen=new Set();for(const [item,label]of choices){if(!item||!retained(item)||seen.has(item.id))continue;seen.add(item.id);const option=document.createElement('option');option.value=item.id;option.textContent=label;sourceChoice.append(option);}sourceChoice.value=image.id;previewSource();if(typeof sourceStamp!=='undefined')previewWithDate();}
      const sourceStamp=document.createElement('small');sourceStamp.className='photo-source-stamp';
      const variantInfo=document.createElement('p');variantInfo.className='photo-variant-info';
      function paintVariantInfo(){const names={'camera-angle':'Kamera','head-pose':'Kopfhaltung',gesture:'Gestik',expression:'Mimik',pose:'Körperhaltung',lighting:'Licht',framing:'Ausschnitt',distance:'Abstand',background:'Hintergrund',outfit:'Kleidung',hairstyle:'Frisur',time:'Tageszeit'};variantInfo.textContent=image.sourceId?'Fotovariante · Bezug: unmittelbar vorheriges Ausgangsfoto'+((image.dimensions||[]).length?' · Angefordert: '+image.dimensions.map(x=>names[x]||x).join(', '):''):'Originalfoto · Noch keine Variante';}
      const quotePhoto=document.createElement('button');quotePhoto.type='button';quotePhoto.textContent='Auf dieses Foto antworten';quotePhoto.onclick=()=>{window.SofiaWorkspace?.selectReply({role:'assistant',content:'Foto vom '+new Date(image.sentAt||image.createdAt).toLocaleString('de-DE',{timeZone:'Europe/Berlin'}),createdAt:image.sentAt||image.createdAt,imageId:image.id});dialog.dataset.returnToLatest='true';const gallery=document.getElementById('sofia-gallery');if(gallery)gallery.dataset.returnToLatest='true';dialog.close();gallery?.close();document.getElementById('input')?.focus();};sourceBox.append(quotePhoto);
      const chatVisibility=document.createElement('button');chatVisibility.type='button';chatVisibility.textContent='Im Chat wieder anzeigen';chatVisibility.hidden=!image.chatHidden;chatVisibility.onclick=async()=>{chatVisibility.disabled=true;try{const r=await fetch('/api/chat',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'show_photo_chat',imageId:image.id})});if(!r.ok)throw Error();image.chatHidden=false;galleryItems.set(image.id,image);show(image);chatVisibility.hidden=true;}catch{status.textContent='Das Foto konnte nicht im Chat eingeblendet werden.';chatVisibility.disabled=false;}};sourceBox.append(chatVisibility);
      const originalPreviewSource=previewSource;function previewWithDate(){originalPreviewSource();const selected=sourcePhoto();sourceBox.dataset.sourceRelation=selected?.id===image.id?'current':selected?.id===image.sourceId?'parent':'root';sourceStamp.textContent=selected?'Aufnahme: '+new Date(selected.capturedAt||selected.sentAt||selected.createdAt).toLocaleString('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Ausgangsfoto nicht verfügbar.';paintVariantInfo();}
      sourceChoice.onchange=()=>{previewWithDate();paintChangeSummary();};sourceBox.append(sourceChoice,sourcePreview,sourceStamp,variantInfo);updateSource();previewWithDate();
      const compass=document.createElement('section');compass.className='photo-perspective-controls';compass.id='photo-perspective-'+image.id;compass.hidden=true;compass.setAttribute('aria-label','Kameraperspektive auswählen');
      const compassTitle=document.createElement('p');compassTitle.textContent='Von welcher Seite möchtest du das Foto sehen?';
      const compassNote=document.createElement('p');compassNote.className='photo-perspective-note';compassNote.textContent='Ausgehend vom bisherigen Kamerastandpunkt. Die Kamera bewegt sich um das Motiv; die Situation bleibt erhalten.';
      const directions=document.createElement('div');directions.className='photo-perspective-compass';
      const origin=document.createElement('span');origin.className='photo-perspective-origin';origin.textContent='Bisheriger Blick · 0°';directions.append(origin);
      for(const [position,label,angle,side] of [['front-left','↖ Vorne links',45,'nach links'],['front-right','Vorne rechts ↗',45,'nach rechts'],['left','← Links',90,'nach links'],['rear','180° · Von hinten',180,'auf die gegenüberliegende Seite'],['right','Rechts →',90,'nach rechts'],['back-left','↙ Hinten links',135,'nach links'],['back-right','Hinten rechts ↘',135,'nach rechts']]){
        const choice=document.createElement('button');choice.type='button';choice.className='photo-perspective-'+position;choice.textContent=label+(angle===180?'':' · '+angle+'°');choice.setAttribute('aria-label',angle===180?'180 Grad: Foto von hinten':label.replace(/[↖↗←→↙↘]/g,'').trim()+', '+angle+' Grad');
        choice.onclick=()=>requestPhoto('Zeig dieses Foto bitte aus einer anderen Perspektive. Kamerastandpunkt: '+angle+'° '+side+' um das Motiv, relativ zur ursprünglichen Kamera. '+(angle===180?'Das Motiv von hinten aufnehmen, als hätte jemand das ursprüngliche Foto von der Rückseite aufgenommen. ':'')+'Nur den Kamerastandpunkt ändern. Die ursprüngliche Situation bleibt erhalten.');directions.append(choice);
      }
      const cancelPerspective=document.createElement('button');cancelPerspective.type='button';cancelPerspective.textContent='Abbrechen';
      function hidePerspective(){compass.hidden=true;perspective.setAttribute('aria-expanded','false');perspective.focus();}
      cancelPerspective.onclick=hidePerspective;compass.append(compassTitle,compassNote,directions,cancelPerspective);
      compass.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();hidePerspective();}else if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.stopPropagation();}});
      perspective.setAttribute('aria-expanded','false');perspective.setAttribute('aria-controls',compass.id);
      perspective.onclick=()=>{compass.hidden=!compass.hidden;perspective.setAttribute('aria-expanded',String(!compass.hidden));if(!compass.hidden){directions.children[4].focus();compass.scrollIntoView?.({block:'nearest'});}};
      detail.onclick=()=>{detailBox.hidden=!detailBox.hidden;detail.setAttribute('aria-expanded',String(!detailBox.hidden));if(!detailBox.hidden)detailInput.focus();};detail.setAttribute('aria-expanded','false');
      detailSend.onclick=()=>{const text=detailInput.value?.trim();if(!text){detailInput.focus();return;}requestPhoto('Zeig mir bitte eine Nahaufnahme dieses Fotos, um '+text.replace(/[„“\"»«]/g,'')+' genauer zu sehen.');};
      detailInput.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();detailSend.onclick();}});
      const lighting=document.createElement('button'),framing=document.createElement('button'),custom=document.createElement('button');
      lighting.type=framing.type=custom.type='button';lighting.textContent='Anderes Licht';framing.textContent='Weiterer Ausschnitt';custom.textContent='Änderungswunsch';
      lighting.onclick=()=>requestPhoto('Dieses Foto bitte nur bei etwas anderer Beleuchtung zeigen. Alles andere beibehalten.');
      framing.onclick=()=>requestPhoto('Zeig dieses Foto bitte mit einem weiteren Ausschnitt und mehr Umgebung. Alles andere beibehalten.');
      const customBox=document.createElement('div');customBox.className='photo-detail-controls';customBox.hidden=true;
      const customInput=document.createElement('textarea');customInput.maxLength=300;customInput.rows=2;customInput.placeholder='Zum Beispiel: etwas seitlicher, alles andere beibehalten';customInput.setAttribute('aria-label','Änderungswunsch zum Foto');
      const customSend=document.createElement('button');customSend.type='button';customSend.textContent='Foto anpassen';customBox.append(customInput,customSend);
      custom.setAttribute('aria-expanded','false');custom.onclick=()=>{customBox.hidden=!customBox.hidden;custom.setAttribute('aria-expanded',String(!customBox.hidden));if(!customBox.hidden)customInput.focus();};
      customSend.onclick=()=>{const text=customInput.value.trim().replace(/[„“\"»«]/g,'');if(!text){customInput.focus();return;}requestPhoto('Dieses Foto bitte entsprechend anpassen: '+text+'. Alle nicht genannten Merkmale beibehalten.');};
      const combinedToggle=document.createElement('button');combinedToggle.type='button';combinedToggle.textContent='Mehrere Änderungen';combinedToggle.setAttribute('aria-expanded','false');
      const combinedBox=document.createElement('section');combinedBox.className='photo-change-options';combinedBox.hidden=true;combinedBox.setAttribute('aria-label','Fotoänderungen kombinieren');
      const changeOptions=[
        ['Kamera',[['','Beibehalten'],['Kamerastandpunkt: 90° nach links um das Motiv.','90° links'],['Kamerastandpunkt: 90° nach rechts um das Motiv.','90° rechts'],['Kamerastandpunkt: 180° auf die gegenüberliegende Seite um das Motiv.','Von hinten']]],
        ['Licht',[['','Beibehalten'],['Etwas wärmere Beleuchtung.','Wärmer'],['Etwas kühlere Beleuchtung.','Kühler'],['Weichere Beleuchtung.','Weicher']]],
        ['Ausschnitt',[['','Beibehalten'],['Weiterer Ausschnitt, mehr Umgebung.','Weiter'],['Engerer Bildausschnitt.','Enger']]],
        ['Mimik',[['','Beibehalten'],['Ein leichtes natürliches Lächeln.','Leichtes Lächeln'],['Ein ernsterer Gesichtsausdruck.','Ernster']]],
        ['Kopfhaltung',[['','Beibehalten'],['Kopf gerade halten.','Gerade'],['Kopf leicht zur Seite neigen.','Leicht geneigt']]],
        ['Körperhaltung',[['','Beibehalten'],['Körperhaltung: entspannter sitzen.','Entspannter sitzen'],['Körperhaltung: entspannt stehen.','Entspannt stehen']]]
      ];
      const changeSelects=[];const changeSummary=document.createElement('p');changeSummary.className='photo-change-summary';changeSummary.setAttribute('aria-live','polite');
      function paintChangeSummary(){const selected=sourcePhoto();const names=changeSelects.flatMap((field,i)=>field.value?[changeOptions[i][0]+': '+changeOptions[i][1].find(x=>x[0]===field.value)?.[1]]:[]);changeSummary.textContent=(selected?'Ausgangsfoto: '+new Date(selected.sentAt||selected.createdAt).toLocaleString('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Ausgangsfoto nicht verfügbar.')+' · '+(names.length?names.join(' · '):'Noch keine Änderungen ausgewählt.')+' · Übrige Merkmale beibehalten.';}
      for(const [name,options]of changeOptions){const label=document.createElement('label');label.textContent=name;const select=document.createElement('select');select.setAttribute('aria-label','Fotoänderung: '+name);for(const [value,text]of options){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}select.value='';select.onchange=paintChangeSummary;changeSelects.push(select);label.append(select);combinedBox.append(label);}
      const presets=document.createElement('div');presets.className='photo-edit-presets';presets.setAttribute('aria-label','Bearbeitbare Foto-Vorschläge');
      for(const [label,index,value]of [['Kopf gerade',4,'Kopf gerade halten.'],['Dezentes Lächeln',3,'Ein leichtes natürliches Lächeln.'],['Seitliche Kamera',0,'Kamerastandpunkt: 90° nach links um das Motiv.'],['Näherer Ausschnitt',2,'Engerer Bildausschnitt.']]){const preset=document.createElement('button');preset.type='button';preset.textContent=label;preset.onclick=()=>{changeSelects[index].value=value;paintChangeSummary();};presets.append(preset);}
      const combinedNote=document.createElement('p');combinedNote.textContent='Nur ausgewählte Merkmale ändern. Gesicht, Haarfarbe und alle übrigen Merkmale bleiben erhalten. Eine Haltungswahl darf die ursprüngliche Haltung ausdrücklich ändern.';
      const applyChanges=document.createElement('button');applyChanges.type='button';applyChanges.textContent='Änderungen als ein Foto zeigen';applyChanges.onclick=()=>{const changes=changeSelects.map(s=>s.value).filter(Boolean);if(!changes.length){status.textContent='Bitte wähle mindestens eine Änderung.';return;}requestPhoto('Dieses Foto bitte entsprechend anpassen: '+changes.join(' ')+' Alle nicht genannten Merkmale beibehalten.');};
      const cancelChanges=document.createElement('button');cancelChanges.type='button';cancelChanges.textContent='Abbrechen';cancelChanges.onclick=()=>{combinedBox.hidden=true;combinedToggle.setAttribute('aria-expanded','false');combinedToggle.focus();};
      combinedBox.append(presets,changeSummary,combinedNote,applyChanges,cancelChanges);paintChangeSummary();combinedToggle.onclick=()=>{combinedBox.hidden=!combinedBox.hidden;combinedToggle.setAttribute('aria-expanded',String(!combinedBox.hidden));if(!combinedBox.hidden){paintChangeSummary();changeSelects[0].focus();}};
      combinedBox.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancelChanges.onclick();}});
      const chat=document.createElement('button');chat.type='button';chat.textContent='Zur Nachricht im Chat';
      function chatTarget(){const messages=document.getElementById('messages');if(!messages)return null;
        return messages.querySelector(`[data-portrait-request-id="${image.anchorId||image.id}"]`)||legacyPhotoAnchor(image);}
      function updateChat(){chat.disabled=!chatTarget();chat.title=chat.disabled?'Die ursprüngliche Nachricht ist nicht mehr im geladenen Verlauf.':'Zur ursprünglichen Fotoanfrage';}
      chat.onclick=()=>{const target=chatTarget();if(!target){status.textContent='Die ursprüngliche Nachricht ist nicht mehr im geladenen Verlauf.';updateChat();return;}
        dialog.close();document.getElementById('sofia-gallery')?.close();window.SofiaChatViewport?.reveal?.();target.scrollIntoView?.({block:'center',behavior:'smooth'});target.setAttribute('tabindex','-1');target.focus?.({preventScroll:true});};
      const compare=document.createElement('button');compare.type='button';compare.textContent='Mit Original vergleichen';
      function updateCompare(){compare.hidden=!valid(image.sourceId)||!galleryItems.has(image.sourceId)||!retained(galleryItems.get(image.sourceId));}
      compare.onclick=()=>{const original=galleryItems.get(image.sourceId);if(!original||!retained(original)){status.textContent='Das Ausgangsfoto ist nicht mehr verfügbar.';return;}
        const comparison=document.createElement('dialog');comparison.className='photo-comparison';window.SofiaUI?.enhanceDialog(comparison,'Fotovergleich');const heading=document.createElement('h2');heading.textContent='Ausgangsfoto und Variante';const closeComparison=document.createElement('button');closeComparison.type='button';closeComparison.textContent='Schließen';closeComparison.onclick=()=>comparison.close();
        const pair=document.createElement('div');pair.className='photo-comparison-slider';const before=document.createElement('img'),after=document.createElement('img');before.src='/api/chat?image='+original.id;before.alt='Ausgangsfoto';after.src='/api/chat?image='+image.id;after.alt='Variante';pair.append(before,after);
        const control=document.createElement('input');control.type='range';control.min='0';control.max='100';control.value='50';control.setAttribute('aria-label','Fotovergleich: Anteil der Variante');const labels=document.createElement('p');labels.textContent='Ausgangsfoto links · Variante rechts · '+new Date(original.sentAt||original.createdAt).toLocaleString('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});const paint=()=>{after.style.clipPath='inset(0 0 0 '+(100-Number(control.value))+'%)';control.setAttribute('aria-valuetext',control.value+' Prozent Variante');};control.oninput=paint;paint();const boundaries=document.createElement('div');boundaries.className='photo-comparison-boundaries';for(const [value,text]of [['0','Ausgangsfoto'],['50','Halb / halb'],['100','Variante']]){const button=document.createElement('button');button.type='button';button.textContent=text;button.onclick=()=>{control.value=value;paint();control.focus();};boundaries.append(button);}const closeEnd=document.createElement('button');closeEnd.type='button';closeEnd.textContent='Schließen';closeEnd.onclick=()=>comparison.close();comparison.append(heading,closeComparison,pair,control,labels,boundaries,closeEnd);document.body.append(comparison);comparison.addEventListener('close',()=>comparison.remove(),{once:true});comparison.showModal();control.focus();};
      updateCompare();updateChat();
      paintLineage();follow.append(sourceBox,lineage,perspective,detail,lighting,framing,custom,combinedToggle,compare,chat,compass,detailBox,customBox,combinedBox);
      full.addEventListener('error',()=>{status.textContent='Foto konnte nicht geladen werden. Bitte Verbindung prüfen.';});
      dialog.append(header,full);if(gallerySequence){dialog.append(navigation);updateNavigation();}dialog.append(toolbar,follow,status); document.body.append(dialog);
      dialog.addEventListener('close',()=>{closed=true;if(objectUrl)URL.revokeObjectURL(objectUrl);dialog.remove();},{once:true});
      prepareDownload();
      dialog.showModal(); close.focus();
  }
  const galleryItems=new Map();
  let clockOffset=0;
  const serverNow=()=>Date.now()-clockOffset;
  const sentTime=image=>Date.parse(image.sentAt||image.createdAt||image.requestedAt);
  function observeTime(image){const at=Date.parse(image.availabilityAt);if(Number.isFinite(at))clockOffset=Date.now()-at;}
  const retained=image=>image.status!=='expired'&&(!Number.isFinite(sentTime(image))||serverNow()-sentTime(image)<30*86400000);
  function presentation(image) {
    if(image.status==='expired')return 'expired';
    return image.archived===true||(Number.isFinite(sentTime(image))&&serverNow()-sentTime(image)>=12*3600000)?'archived':'chat';
  }
  function photoArchive(files) {
    const encoder=new TextEncoder(),parts=[],directory=[];let offset=0;
    const crc=bytes=>{let value=0xffffffff;for(const byte of bytes){value^=byte;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);}return (value^0xffffffff)>>>0;};
    const record=(length,signature)=>{const bytes=new Uint8Array(length);new DataView(bytes.buffer).setUint32(0,signature,true);return bytes;};
    for(const file of files){const name=encoder.encode(file.name),data=file.bytes,checksum=crc(data),header=record(30,0x04034b50),view=new DataView(header.buffer);view.setUint16(4,20,true);view.setUint16(12,33,true);view.setUint32(14,checksum,true);view.setUint32(18,data.length,true);view.setUint32(22,data.length,true);view.setUint16(26,name.length,true);
      const central=record(46,0x02014b50),cv=new DataView(central.buffer);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(14,33,true);cv.setUint32(16,checksum,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);directory.push(central,name);parts.push(header,name,data);offset+=header.length+name.length+data.length;
    }
    const size=directory.reduce((sum,x)=>sum+x.length,0),end=record(22,0x06054b50),view=new DataView(end.buffer);view.setUint16(8,files.length,true);view.setUint16(10,files.length,true);view.setUint32(12,size,true);view.setUint32(16,offset,true);return new Blob([...parts,...directory,end],{type:'application/zip'});
  }
  let galleryView={date:'',type:'all',order:'newest',favorites:false,scroll:0};
  try{const saved=JSON.parse(localStorage.getItem('sofia-gallery-view-v463')||'null');if(saved)galleryView={date:/^\d{4}-\d{2}-\d{2}$/.test(saved.date)?saved.date:'',type:['all','selfie','mirror','full_selfie','portrait','full_portrait','environment','detail'].includes(saved.type)?saved.type:'all',order:saved.order==='oldest'?'oldest':'newest',favorites:saved.favorites===true,scroll:Math.max(0,Math.min(Number(saved.scroll)||0,100000))};}catch{}
  function openGallery(selectedId=null) {
    const dialog=document.createElement('dialog');dialog.id='sofia-gallery';window.SofiaUI?.enhanceDialog(dialog,'Galerie');dialog.style.cssText='width:680px;max-width:92vw;max-height:85vh;border:0;border-radius:16px;padding:20px;background:#171722;color:white';
    const title=document.createElement('h2');title.textContent='Galerie';const note=document.createElement('p');note.textContent='Fotos bleiben 30 Tage ab Versand erhalten.';
    const close=document.createElement('button');close.type='button';close.textContent='Schließen';close.onclick=()=>dialog.close();
    const weatherCredit=document.createElement('a');weatherCredit.href='https://open-meteo.com/';weatherCredit.target='_blank';weatherCredit.rel='noopener noreferrer';weatherCredit.textContent='Wetterbezug: Open-Meteo';weatherCredit.style.cssText='display:block;font-size:11px;opacity:.65;color:inherit;margin:8px 0';
    const closeBottom=document.createElement('button');closeBottom.type='button';closeBottom.textContent='Schließen';closeBottom.onclick=()=>dialog.close();
    const grid=document.createElement('div');grid.className='gallery-grid';grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:12px;margin:16px 0';
    const filters=document.createElement('div');filters.className='gallery-filters';filters.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
    const date=document.createElement('input');date.type='date';date.setAttribute('aria-label','Galerie nach Datum filtern');date.style.cssText='flex:0 1 170px;min-width:0;color-scheme:dark';
    const type=document.createElement('select');type.setAttribute('aria-label','Galerie nach Bildart filtern');type.value='all';for(const [value,label]of [['all','Alle Bildarten'],['selfie','Selfies'],['mirror','Spiegelselfies'],['full_selfie','Ganzkörperselfies'],['portrait','Porträtfotos'],['full_portrait','Ganzkörperfotos'],['environment','Umgebung'],['detail','Alltagsdetails']]){const option=document.createElement('option');option.value=value;option.textContent=label;type.append(option);}
    const onlyFavorites=document.createElement('button');onlyFavorites.type='button';onlyFavorites.textContent='Nur Favoriten';onlyFavorites.setAttribute('aria-pressed','false');let favoritesOnly=false;
    const dateLabel=document.createElement('label');dateLabel.textContent='Datum ';dateLabel.append(date);
    const kindLabel=document.createElement('label');kindLabel.textContent='Fototyp ';kindLabel.append(type);
    const order=document.createElement('select');order.setAttribute('aria-label','Galerie sortieren');for(const [value,label]of [['newest','Neueste zuerst'],['oldest','Älteste zuerst']]){const option=document.createElement('option');option.value=value;option.textContent=label;order.append(option);}order.value='newest';
    const orderLabel=document.createElement('label');orderLabel.textContent='Reihenfolge ';orderLabel.append(order);
    const clear=document.createElement('button');clear.type='button';clear.textContent='Filter zurücksetzen';clear.onclick=()=>{selected.clear();void prepareBatch();date.value='';type.value='all';order.value='newest';favoritesOnly=false;onlyFavorites.setAttribute('aria-pressed','false');render();};
    const feedback=document.createElement('p');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
    filters.append(dateLabel,kindLabel,orderLabel,onlyFavorites,clear);
    const photoDate=image=>!Number.isFinite(sentTime(image))?'Datum unbekannt':new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(sentTime(image)));
    date.value=galleryView.date;type.value=galleryView.type;order.value=galleryView.order;favoritesOnly=galleryView.favorites;onlyFavorites.setAttribute('aria-pressed',String(favoritesOnly));
    dialog.addEventListener('close',()=>{galleryView={date:date.value,type:type.value,order:order.value,favorites:favoritesOnly,scroll:dialog.scrollTop};try{localStorage.setItem('sofia-gallery-view-v463',JSON.stringify(galleryView));}catch{}},{once:true});
    let visibleItems=[];
    const selected=new Set(),selection=nodeButton('Mehrere auswählen'),downloadMany=nodeButton('Auswahl herunterladen / teilen'),selectionStatus=document.createElement('p');selectionStatus.setAttribute('role','status');downloadMany.disabled=true;let selecting=false,batchVersion=0,prepared=null,batchUrl=null;
    function nodeButton(text){const b=document.createElement('button');b.type='button';b.textContent=text;return b;}
    selection.setAttribute('aria-pressed','false');selection.onclick=()=>{selecting=!selecting;selected.clear();selection.setAttribute('aria-pressed',String(selecting));selection.textContent=selecting?'Auswahl beenden':'Mehrere auswählen';void prepareBatch();render();};
    async function prepareBatch(){const version=++batchVersion;prepared=null;downloadMany.disabled=true;if(batchUrl){URL.revokeObjectURL(batchUrl);batchUrl=null;}if(!selected.size){selectionStatus.textContent='';return;}selectionStatus.textContent=selected.size+' Fotos werden zum Speichern vorbereitet …';
      try {const files=[];for(const id of selected){const image=galleryItems.get(id);if(!image||!retained(image))throw Error();const response=await fetch('/api/chat?image='+id,{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Error();const blob=await response.blob();if(!/^image\/jpeg(?:;|$)/i.test(blob.type)||!blob.size||blob.size>700000)throw Error();files.push({name:'sofia-'+id+'.jpg',bytes:new Uint8Array(await blob.arrayBuffer()),blob});if(version!==batchVersion)return;}
        if(version!==batchVersion||!dialog.isConnected)return;const shareFiles=typeof File!=='undefined'?files.map(x=>new File([x.blob],x.name,{type:'image/jpeg'})):[];prepared={files:shareFiles,zip:photoArchive(files)};downloadMany.disabled=false;selectionStatus.textContent=files.length+' Fotos ausgewählt.';
      }catch{if(version===batchVersion)selectionStatus.textContent='Die Auswahl konnte nicht vollständig vorbereitet werden. Bitte neu auswählen.';}
    }
    downloadMany.onclick=async()=>{if(!prepared)return;const current=prepared;downloadMany.disabled=true;try{if(current.files.length&&typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&navigator.canShare({files:current.files})){await navigator.share({files:current.files});selectionStatus.textContent='';}else{batchUrl ||= URL.createObjectURL(current.zip);const link=document.createElement('a');link.href=batchUrl;link.download='sofia-fotos.zip';document.body.append(link);link.click();link.remove();selectionStatus.textContent='Die ausgewählten Fotos wurden als ZIP heruntergeladen.';}}catch(e){selectionStatus.textContent=e?.name==='AbortError'?'':'Die Auswahl konnte nicht gespeichert werden.';}finally{downloadMany.disabled=!prepared;}};
    dialog.addEventListener('close',()=>{batchVersion++;prepared=null;if(batchUrl)URL.revokeObjectURL(batchUrl);},{once:true});

    function render(){const top=dialog.scrollTop;grid.replaceChildren();const items=[...galleryItems.values()].reverse().filter(x=>!['pending','failed','expired'].includes(x.status)&&retained(x)&&(!date.value||photoDate(x)===date.value)&&(type.value==='all'||x.kind===type.value)&&(!favoritesOnly||x.favorite)).sort((a,b)=>order.value==='oldest'?sentTime(a)-sentTime(b):sentTime(b)-sentTime(a));visibleItems=items;note.textContent=items.length+' '+(items.length===1?'Foto':'Fotos')+' in dieser Ansicht · Im Chat 12 Stunden, in der Galerie bis zu 30 Tage.';if(!items.length){const empty=document.createElement('p');empty.textContent='Für diese Auswahl sind keine Fotos vorhanden. Passe die Filter an oder öffne die Galerie später erneut.';grid.append(empty);}let lastGroup='';
     for(const image of items){const group=photoDate(image);if(group!==lastGroup){const heading=document.createElement('h3');heading.textContent=/^\d{4}-\d{2}-\d{2}$/.test(group)?group.split('-').reverse().join('.'):group;heading.style.cssText='grid-column:1/-1;font-size:14px;margin:12px 0 0';grid.append(heading);lastGroup=group;}const card=document.createElement('div');card.dataset.galleryPhotoId=image.id;const button=document.createElement('button');button.type='button';button.setAttribute('aria-label','Foto vom '+new Date(sentTime(image)).toLocaleString('de-DE',{timeZone:'Europe/Berlin'}));button.style.cssText='width:100%;padding:0;border:0;border-radius:12px;background:transparent;cursor:pointer';const img=document.createElement('img');img.src='/api/chat?image='+image.id;img.alt='Sofia';img.loading='lazy';img.style.cssText='width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:12px';button.append(img);button.onclick=()=>{const top=dialog.scrollTop;openPhoto(image,()=>visibleItems);const viewer=document.getElementById('sofia-photo-'+image.id);viewer?.addEventListener('close',()=>{if(dialog.isConnected)dialog.scrollTop=top;},{once:true});};const stamp=document.createElement('time');stamp.textContent=new Date(sentTime(image)).toLocaleTimeString('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'});stamp.style.cssText='display:block;font-size:11px;opacity:.65;margin:4px 0';card.append(stamp);if(image.sourceId){const series=document.createElement('small');series.className='photo-series-label';const origin=galleryItems.get(image.seriesId);series.textContent=origin?'Variante · Fotoreihe vom '+new Date(sentTime(origin)).toLocaleString('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Variante · Fotoreihe';card.append(series);}
      const favorite=document.createElement('button');favorite.type='button';favorite.textContent=image.favorite?'★ Favorit':'☆ Favorit';favorite.setAttribute('aria-label','Favorit für Foto vom '+new Date(sentTime(image)).toLocaleString('de-DE',{timeZone:'Europe/Berlin'}));favorite.setAttribute('aria-pressed',String(!!image.favorite));favorite.onclick=async()=>{favorite.disabled=true;try{const r=await fetch('/api/session?social=1',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'favorite',imageId:image.id,favorite:!image.favorite})});if(!r.ok)throw Error();image.favorite=!image.favorite;galleryItems.set(image.id,image);feedback.textContent='Favorit gespeichert. Aufbewahrung bleibt 30 Tage.';render();}catch{feedback.textContent='Favorit konnte nicht gespeichert werden. Bitte Verbindung prüfen.';favorite.disabled=false;}};card.append(button,favorite);if(selecting){const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=selected.has(image.id);check.setAttribute('aria-label','Foto vom '+new Date(sentTime(image)).toLocaleString('de-DE',{timeZone:'Europe/Berlin'})+' auswählen');check.onchange=()=>{if(check.checked&&selected.size>=10){check.checked=false;selectionStatus.textContent='Bitte höchstens zehn Fotos auf einmal auswählen.';return;}if(check.checked)selected.add(image.id);else selected.delete(image.id);void prepareBatch();};label.append(check,document.createTextNode(' Auswählen'));card.append(label);}grid.append(card);
     }
     feedback.textContent=items.length?items.length+' Fotos':'Keine Fotos für diese Auswahl.';dialog.scrollTop=top;
    }
    date.onchange=type.onchange=order.onchange=()=>{selected.clear();void prepareBatch();render();};onlyFavorites.onclick=()=>{selected.clear();void prepareBatch();favoritesOnly=!favoritesOnly;onlyFavorites.setAttribute('aria-pressed',String(favoritesOnly));render();};
    const filterSection=document.createElement('details');filterSection.className='gallery-filter-section';const filterSummary=document.createElement('summary');filterSummary.textContent='Filter und Auswahl';filterSection.append(filterSummary,filters,selection,downloadMany,selectionStatus);
    dialog.append(title,close,note,filterSection,feedback,grid,weatherCredit,closeBottom);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();render();dialog.scrollTop=galleryView.scroll;close.focus();
    let openedSelection=false;
    if(selectedId){const selected=galleryItems.get(selectedId);if(selected&&!['expired','failed','pending'].includes(selected.status)){openPhoto(selected,()=>visibleItems);openedSelection=true;}}
    void (async()=>{try{const r=await fetch('/api/chat',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();if(!Array.isArray(d.images))throw Error();for(const image of d.images){if(valid(image.id)&&!['pending','failed'].includes(image.status)){observeTime(image);galleryItems.set(image.id,image);}}if(!dialog.isConnected)return;render();if(selectedId&&!openedSelection&&!document.getElementById('sofia-photo-'+selectedId)){const image=galleryItems.get(selectedId);if(image&&retained(image)&&!['failed','pending'].includes(image.status))openPhoto(image,()=>visibleItems);}}catch{if(dialog.isConnected)feedback.textContent='Galerie konnte nicht aktualisiert werden. Bereits geladene Fotos bleiben verfügbar.';}})();
  }
  function show(image) {
    if (!image || !valid(image.id)) return;
    observeTime(image);
    if(image.status!=='pending')galleryItems.set(image.id,{...galleryItems.get(image.id),...image});
    const messages=document.getElementById('messages');
    if (!messages) return;
    if(image.chatHidden){document.getElementById('portrait-slot-'+image.id)?.remove();document.getElementById('portrait-'+image.id)?.remove();return;}
    const slot=locate(image);
    if (!slot) return;
    hideAcknowledgment(image);
    if(image.status==='pending')return;
    remotePending.delete(image.id);
    galleryItems.set(image.id,image);
    const mode=presentation(image);
    const existing=document.getElementById('portrait-' + image.id);
    if (existing && existing.dataset.presentation===mode && (existing.dataset.portraitStatus !== 'failed' || image.status === 'failed')) return;
    const viewport=window.SofiaChatViewport?.capture();
    existing?.remove();
    if (image.status === 'failed') {
      const notice=document.createElement('div'); notice.id='portrait-' + image.id;
      notice.className='msg sofia'; notice.dataset.portraitStatus='failed';notice.dataset.presentation=mode; notice.textContent=image.failureCode==='test_image_limit'?'Das Foto-Limit der Testversion ist für heute erreicht. Morgen kann ich wieder ein Foto schicken.':typeof image.message==='string'&&image.message.trim()?image.message.trim().slice(0,500):failureReply;
      if(image.failureCode==='portrait_source_unavailable')notice.textContent='Das Ausgangsfoto ist nicht mehr verfügbar. Bitte wähle ein anderes Foto in der Galerie.';
      if(image.failureCode==='portrait_context_mismatch')notice.textContent='Die gewünschte Änderung wurde im Foto nicht zuverlässig umgesetzt. Du kannst einen neuen Versuch mit diesem Ausgangsfoto starten.';
      if(image.failureCode==='portrait_reference_mismatch')notice.textContent='Die Bildreferenz passt nicht zum ausgewählten Foto. Bitte öffne das gewünschte Foto erneut und wähle dort die Perspektive.';
      const retry=document.createElement('button');retry.type='button';retry.className='photo-retry';retry.textContent='Erneut versuchen';retry.disabled=['test_image_limit','portrait_reference_mismatch','portrait_source_unavailable'].includes(image.failureCode);retry.onclick=()=>{if(window.SofiaPhotoAction?.(image.requestMessage||'nochmal',image.expectedSourceId||image.sourceId||undefined))retry.disabled=true;};notice.append(retry);
      window.SofiaTimeline?.decorate(notice,image.createdAt||new Date().toISOString());slot.append(notice); slot.hidden=false; window.SofiaChatViewport?.restore(viewport); return;
    }
    if(mode==='archived'||mode==='expired') {
      const marker=document.createElement(mode==='archived'?'button':'div');marker.id='portrait-'+image.id;marker.className='msg sofia';marker.dataset.presentation=mode;marker.dataset.portraitStatus='done';marker.textContent=mode==='archived'?'Bild in der Galerie':'Bild nicht mehr verfügbar';
      if(mode==='archived'){marker.type='button';marker.onclick=()=>openGallery(image.id);}
      slot.append(marker);slot.hidden=false;window.SofiaChatViewport?.restore(viewport);return;
    }
    const figure = document.createElement('figure');
    figure.className = 'msg sofia'; figure.dataset.portraitStatus='done';figure.dataset.presentation=mode; figure.id = 'portrait-' + image.id;
    figure.dataset.imageId=image.id;
    figure.dataset.messageText='Foto vom '+new Date(image.sentAt||image.createdAt).toLocaleString('de-DE',{timeZone:'Europe/Berlin'});
    figure.style.margin = '8px 0';
    const button = document.createElement('button'); button.type = 'button';
    button.style.cssText = 'border:0;background:transparent;padding:0;cursor:pointer';
    button.setAttribute('aria-label','Bild öffnen: ' + (image.caption || 'Sofia'));
    const img = document.createElement('img');
    const url = '/api/chat?image=' + image.id;
    img.src = url; img.alt = image.caption || 'Sofia'; img.loading = 'lazy';
    img.width=1024; img.height=1536;
    img.style.cssText = 'display:block;width:180px;height:auto;aspect-ratio:2/3;max-width:100%;border-radius:12px;object-fit:cover';
    button.append(img);
    button.onclick = () => openPhoto(image);
    figure.append(button); slot.append(figure); slot.hidden=false;
    window.SofiaTimeline?.decorate(figure,image.sentAt||image.createdAt);window.SofiaWorkspace?.added(figure,true);window.SofiaUI?.refreshDays(messages);
    window.SofiaChatViewport?.restore(viewport);
  }
  function refreshExpiry(){for(const image of galleryItems.values()){const expired=!retained(image);show({...image,...(expired?{status:'expired'}:{})});if(expired){document.getElementById('sofia-photo-'+image.id)?.close();document.getElementById('sofia-gallery')?.querySelector('[data-gallery-photo-id="'+image.id+'"]')?.remove();}}}
  let reconciling=false;
  if(typeof setInterval==='function')setInterval(async()=>{
    refreshExpiry();
    if(!remotePending.size || pending.size || reconciling)return;
    reconciling=true;
    try {
      const state=await fetch('/api/chat',{method:'GET',credentials:'same-origin',cache:'no-store',signal:typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function'?AbortSignal.timeout(15000):undefined});
      if(state.ok)window.SofiaImages.restore((await state.json()).images);
    }catch{}finally{reconciling=false;}
  },10000);
  document.addEventListener?.('visibilitychange',()=>{if(document.visibilityState==='visible')refreshExpiry();});
  window.SofiaImages = {
    anchor, openGallery, photoArchive,
    items:()=>[...galleryItems.values()].filter(x=>!['pending','failed','expired'].includes(x.status)&&retained(x)).map(x=>({...x})),
    get isGenerating() { return pending.size>0 || remotePending.size>0; },
    get referenceId() { return referenceId; },
    restore(events) {
      if (!Array.isArray(events)) return;
      remotePending.clear();
      events.filter(x=>x.status==='pending' && valid(x.id)).forEach(x=>remotePending.add(x.id));
      // Associate legacy photographs with their old acknowledgments where possible.
      const old=events.filter(x=>!x.anchorId && valid(x.id));
      old.forEach(image=>{const node=legacyPhotoAnchor(image);if(node&&!node.dataset.portraitRequestId)node.dataset.portraitRequestId=image.id;});
      events.forEach(show);
      events.filter(x=>x.status==='pending' && x.jobStatus==='ready').forEach(x=>window.SofiaImages.generate(x));
      updatePhotoStatus();
      const successful=events.filter(x=>x.status !== 'failed' && x.status !== 'pending' && x.status !== 'expired' && valid(x.id));
      if (!successful.some(x=>x.id===referenceId)){referenceId=null;try{localStorage.removeItem('sofia-photo-reference');}catch{}}
      if (!referenceId && successful.length) rememberReference(successful.at(-1).id);
    },
    generate(request) {
      if (!valid(request?.id)) return Promise.resolve();
      if (active.has(request.id)) return active.get(request.id);
      if(completed.has(request.id))return Promise.resolve();
      const selectionAtStart=selectionVersion;
      pending.add(request.id);
      updatePhotoStatus();
      slotFor(request.id); // Reserve the original turn without showing progress UI.
      const job = (async () => {
        try {
          if(request.expectedSourceId && request.sourceId!==request.expectedSourceId)throw Object.assign(new Error('portrait_reference_mismatch'),{code:'portrait_reference_mismatch'});
          const response = await fetch('/api/chat',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'generate_image',requestId:request.id}),signal:typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(250000) : undefined});
          const data = await response.json();
          if (!response.ok || !valid(data.image?.id) || data.image.id!==request.id || request.expectedSourceId && data.image.sourceId!==request.expectedSourceId) {const error=new Error('portrait_failed');error.code=data.image?.id===request.id && request.expectedSourceId && data.image.sourceId!==request.expectedSourceId?'portrait_reference_mismatch':data.code;throw error;}
          show(data.image); if(selectionVersion===selectionAtStart)rememberReference(data.image.id);
        } catch (error) {
          // A lost response may follow a successful write: reconcile by GET only.
          let recovered=null;
          try {
            const state=await fetch('/api/chat',{method:'GET',credentials:'same-origin',cache:'no-store',signal:typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function'?AbortSignal.timeout(15000):undefined});
            if(state.ok){const data=await state.json();recovered=data.images?.find(x=>x.id===request.id && (!request.expectedSourceId || x.sourceId===request.expectedSourceId));}
          }catch{}
          if(recovered){show({...recovered,failureCode:recovered.failureCode||error?.code});if(recovered.status==='pending')remotePending.add(request.id);else if(recovered.status!=='failed' && selectionVersion===selectionAtStart)rememberReference(recovered.id);}
          else show({...request,anchorId:request.id,status:'failed',failureCode:error?.code});
        } finally {
          pending.delete(request.id);
          updatePhotoStatus();
          completed.add(request.id);if(completed.size>100)completed.delete(completed.values().next().value);
          active.delete(request.id);
        }
      })();
      active.set(request.id,job); return job;
    }
  };
})();



