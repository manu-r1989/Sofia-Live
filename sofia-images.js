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
  function locate(event) {
    const messages=document.getElementById('messages');
    if (!messages) return null;
    const slot=slotFor(event.id);
    let node=messages.querySelector(`[data-portrait-request-id="${event.anchorId || event.id}"]`);
    if (!node && event.requestMessage) {
      const users=[...messages.querySelectorAll('.msg.user')];
      node=users.reverse().find(x=>(x.dataset.messageText||x.textContent) === event.requestMessage);
      if (node?.nextSibling?.classList?.contains('sofia')) node=node.nextSibling;
    }
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
            await navigator.share({files:[file]});status.textContent='';
          } else {
            if(mobile){status.textContent='Teilen wird hier nicht unterstützt. Halte das Bild gedrückt und wähle „In Fotos sichern“.';return;}
            objectUrl ||= URL.createObjectURL(blob);
            const link=document.createElement('a');link.href=objectUrl;link.download='sofia-'+image.id+'.jpg';document.body.append(link);link.click();link.remove();status.textContent='';
          }
        } catch(error) {status.textContent=error?.name==='AbortError'?'':'Speichern oder Teilen ist gerade nicht möglich. Bitte erneut versuchen.';}
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
        if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}blob=null;file=null;updateNavigation();void prepareDownload();
      }
      previous.onclick=()=>changePhoto(-1);next.onclick=()=>changePhoto(1);navigation.append(previous,counter,next);
      if(gallerySequence){
        full.style.touchAction='pan-y pinch-zoom';let touch=null;
        full.addEventListener('touchstart',event=>{touch=event.touches?.length===1?{x:event.touches[0].clientX,y:event.touches[0].clientY,id:event.touches[0].identifier}:null;},{passive:true});
        full.addEventListener('touchcancel',()=>{touch=null;},{passive:true});
        full.addEventListener('touchend',event=>{const start=touch;touch=null;const end=[...(event.changedTouches||[])].find(x=>x.identifier===start?.id);if(!start||!end||event.touches?.length)return;const dx=end.clientX-start.x,dy=end.clientY-start.y;if(Math.abs(dx)>=50 && Math.abs(dx)>Math.abs(dy)*1.4)changePhoto(dx<0?1:-1);},{passive:true});
        dialog.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();changePhoto(event.key==='ArrowLeft'?-1:1);}});
      }
      const toolbar=document.createElement('div');toolbar.className='photo-toolbar';remove.className='photo-delete';toolbar.append(download,remove);
      const header=document.createElement('div');header.className='photo-header';header.append(photoDate,close);
      const follow=document.createElement('div');follow.className='photo-follow-ups';
      const perspective=document.createElement('button'),detail=document.createElement('button');perspective.type=detail.type='button';perspective.textContent='Andere Perspektive';detail.textContent='Detail ansehen';
      const detailBox=document.createElement('div');detailBox.className='photo-detail-controls';detailBox.hidden=true;
      const detailInput=document.createElement('input');detailInput.maxLength=160;detailInput.placeholder='Welches Detail möchtest du sehen?';detailInput.setAttribute('aria-label','Gewünschtes Fotodetail');
      const detailSend=document.createElement('button');detailSend.type='button';detailSend.textContent='Detail zeigen';detailBox.append(detailInput,detailSend);
      function requestPhoto(message){rememberReference(image.id);if(!window.SofiaPhotoAction?.(message)){status.textContent='Bitte warte, bis die laufende Aktion beendet ist, und prüfe die Verbindung.';return;}dialog.dataset.returnToLatest='true';const gallery=document.getElementById('sofia-gallery');if(gallery)gallery.dataset.returnToLatest='true';dialog.close();gallery?.close();window.SofiaChatViewport?.latest?.();}
      perspective.onclick=()=>requestPhoto('Wie würde dieses Foto aus einer anderen Perspektive aussehen?');
      detail.onclick=()=>{detailBox.hidden=!detailBox.hidden;detail.setAttribute('aria-expanded',String(!detailBox.hidden));if(!detailBox.hidden)detailInput.focus();};detail.setAttribute('aria-expanded','false');
      detailSend.onclick=()=>{const text=detailInput.value?.trim();if(!text){detailInput.focus();return;}requestPhoto('Zeig mir bitte eine Nahaufnahme dieses Fotos, um '+text.replace(/[„“\"»«]/g,'')+' genauer zu sehen.');};
      detailInput.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();detailSend.onclick();}});
      follow.append(perspective,detail,detailBox);
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
  function openGallery(selectedId=null) {
    const dialog=document.createElement('dialog');dialog.id='sofia-gallery';window.SofiaUI?.enhanceDialog(dialog,'Galerie');dialog.style.cssText='width:680px;max-width:92vw;max-height:85vh;border:0;border-radius:16px;padding:20px;background:#171722;color:white';
    const title=document.createElement('h2');title.textContent='Galerie';const note=document.createElement('p');note.textContent='Fotos bleiben 30 Tage ab Versand erhalten.';
    const close=document.createElement('button');close.type='button';close.textContent='Schließen';close.onclick=()=>dialog.close();
    const weatherCredit=document.createElement('a');weatherCredit.href='https://open-meteo.com/';weatherCredit.target='_blank';weatherCredit.rel='noopener noreferrer';weatherCredit.textContent='Wetterbezug: Open-Meteo';weatherCredit.style.cssText='display:block;font-size:11px;opacity:.65;color:inherit;margin:8px 0';
    const closeBottom=document.createElement('button');closeBottom.type='button';closeBottom.textContent='Schließen';closeBottom.onclick=()=>dialog.close();
    const grid=document.createElement('div');grid.className='gallery-grid';grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:12px;margin:16px 0';
    const filters=document.createElement('div');filters.className='gallery-filters';filters.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
    const date=document.createElement('input');date.type='date';date.setAttribute('aria-label','Galerie nach Datum filtern');date.style.cssText='flex:0 1 170px;min-width:0;color-scheme:dark';
    const type=document.createElement('select');type.setAttribute('aria-label','Galerie nach Bildart filtern');type.value='all';for(const [value,label]of [['all','Alle Bildarten'],['selfie','Selfies'],['mirror','Spiegelselfies'],['environment','Umgebung']]){const option=document.createElement('option');option.value=value;option.textContent=label;type.append(option);}
    const onlyFavorites=document.createElement('button');onlyFavorites.type='button';onlyFavorites.textContent='Nur Favoriten';onlyFavorites.setAttribute('aria-pressed','false');let favoritesOnly=false;
    const clear=document.createElement('button');clear.type='button';clear.textContent='Filter zurücksetzen';clear.onclick=()=>{selected.clear();void prepareBatch();date.value='';type.value='all';favoritesOnly=false;onlyFavorites.setAttribute('aria-pressed','false');render();};
    const feedback=document.createElement('p');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
    filters.append(date,type,onlyFavorites,clear);
    const photoDate=image=>!Number.isFinite(sentTime(image))?'Datum unbekannt':new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(sentTime(image)));
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

    function render(){grid.replaceChildren();const items=[...galleryItems.values()].reverse().filter(x=>!['pending','failed','expired'].includes(x.status)&&retained(x)&&(!date.value||photoDate(x)===date.value)&&(type.value==='all'||x.kind===type.value)&&(!favoritesOnly||x.favorite)).sort((a,b)=>sentTime(b)-sentTime(a));visibleItems=items;let lastGroup='';
     for(const image of items){const group=photoDate(image);if(group!==lastGroup){const heading=document.createElement('h3');heading.textContent=group;heading.style.cssText='grid-column:1/-1;font-size:14px;margin:12px 0 0';grid.append(heading);lastGroup=group;}const card=document.createElement('div');card.dataset.galleryPhotoId=image.id;const button=document.createElement('button');button.type='button';button.setAttribute('aria-label','Foto vom '+new Date(sentTime(image)).toLocaleString('de-DE',{timeZone:'Europe/Berlin'}));button.style.cssText='width:100%;padding:0;border:0;border-radius:12px;background:transparent;cursor:pointer';const img=document.createElement('img');img.src='/api/chat?image='+image.id;img.alt='Sofia';img.loading='lazy';img.style.cssText='width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:12px';button.append(img);button.onclick=()=>openPhoto(image,()=>visibleItems);const stamp=document.createElement('time');stamp.textContent=new Date(sentTime(image)).toLocaleTimeString('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'});stamp.style.cssText='display:block;font-size:11px;opacity:.65;margin:4px 0';card.append(stamp);
      const favorite=document.createElement('button');favorite.type='button';favorite.textContent=image.favorite?'★ Favorit':'☆ Favorit';favorite.setAttribute('aria-label','Favorit für Foto vom '+new Date(sentTime(image)).toLocaleString('de-DE',{timeZone:'Europe/Berlin'}));favorite.setAttribute('aria-pressed',String(!!image.favorite));favorite.onclick=async()=>{favorite.disabled=true;try{const r=await fetch('/api/session?social=1',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'favorite',imageId:image.id,favorite:!image.favorite})});if(!r.ok)throw Error();image.favorite=!image.favorite;galleryItems.set(image.id,image);feedback.textContent='Favorit gespeichert. Aufbewahrung bleibt 30 Tage.';render();}catch{feedback.textContent='Favorit konnte nicht gespeichert werden. Bitte Verbindung prüfen.';favorite.disabled=false;}};card.append(button,favorite);if(selecting){const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=selected.has(image.id);check.setAttribute('aria-label','Foto vom '+new Date(sentTime(image)).toLocaleString('de-DE',{timeZone:'Europe/Berlin'})+' auswählen');check.onchange=()=>{if(check.checked&&selected.size>=10){check.checked=false;selectionStatus.textContent='Bitte höchstens zehn Fotos auf einmal auswählen.';return;}if(check.checked)selected.add(image.id);else selected.delete(image.id);void prepareBatch();};label.append(check,document.createTextNode(' Auswählen'));card.append(label);}grid.append(card);
     }
     feedback.textContent=items.length?items.length+' Fotos':'Keine Fotos für diese Auswahl.';
    }
    date.onchange=type.onchange=()=>{selected.clear();void prepareBatch();render();};onlyFavorites.onclick=()=>{selected.clear();void prepareBatch();favoritesOnly=!favoritesOnly;onlyFavorites.setAttribute('aria-pressed',String(favoritesOnly));render();};
    const filterSection=document.createElement('details');filterSection.className='gallery-filter-section';const filterSummary=document.createElement('summary');filterSummary.textContent='Filter und Auswahl';filterSection.append(filterSummary,filters,selection,downloadMany,selectionStatus);
    dialog.append(title,close,note,filterSection,feedback,grid,weatherCredit,closeBottom);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();render();close.focus();
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
      notice.className='msg sofia'; notice.dataset.portraitStatus='failed';notice.dataset.presentation=mode; notice.textContent=image.failureCode==='test_image_limit'?'Das Foto-Limit der Testversion ist für heute erreicht. Morgen kann ich wieder ein Foto schicken.':failureReply;
      const retry=document.createElement('button');retry.type='button';retry.className='photo-retry';retry.textContent='Erneut versuchen';retry.disabled=image.failureCode==='test_image_limit';retry.onclick=()=>{if(window.SofiaPhotoAction?.(image.requestMessage||'nochmal'))retry.disabled=true;};notice.append(retry);
      window.SofiaTimeline?.decorate(notice,image.createdAt||new Date().toISOString());slot.append(notice); slot.hidden=false; window.SofiaChatViewport?.restore(viewport); return;
    }
    if(mode==='archived'||mode==='expired') {
      const marker=document.createElement(mode==='archived'?'button':'div');marker.id='portrait-'+image.id;marker.className='msg sofia';marker.dataset.presentation=mode;marker.dataset.portraitStatus='done';marker.textContent=mode==='archived'?'Bild in der Galerie':'Bild nicht mehr verfügbar';
      if(mode==='archived'){marker.type='button';marker.onclick=()=>openGallery(image.id);}
      slot.append(marker);slot.hidden=false;window.SofiaChatViewport?.restore(viewport);return;
    }
    const figure = document.createElement('figure');
    figure.className = 'msg sofia'; figure.dataset.portraitStatus='done';figure.dataset.presentation=mode; figure.id = 'portrait-' + image.id;
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
    window.SofiaTimeline?.decorate(figure,image.sentAt||image.createdAt);window.SofiaUI?.refreshDays(messages);
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
    get isGenerating() { return pending.size>0 || remotePending.size>0; },
    get referenceId() { return referenceId; },
    restore(events) {
      if (!Array.isArray(events)) return;
      remotePending.clear();
      events.filter(x=>x.status==='pending' && valid(x.id)).forEach(x=>remotePending.add(x.id));
      // Associate legacy photographs with their old acknowledgments where possible.
      const old=events.filter(x=>!x.anchorId && valid(x.id));
      const acknowledgments=[...document.getElementById('messages')?.querySelectorAll('.msg.sofia') || []]
        .filter(x=>(x.dataset.messageText||x.textContent) === 'Gib mir einen kleinen Moment.' && !x.dataset.portraitRequestId).slice(-old.length);
      old.forEach((image,index)=>{const node=acknowledgments[index];if(node)node.dataset.portraitRequestId=image.id;});
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
          const response = await fetch('/api/chat',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'generate_image',requestId:request.id}),signal:typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(250000) : undefined});
          const data = await response.json();
          if (!response.ok || !valid(data.image?.id)) {const error=new Error('portrait_failed');error.code=data.code;throw error;}
          show(data.image); if(selectionVersion===selectionAtStart)rememberReference(data.image.id);
        } catch (error) {
          // A lost response may follow a successful write: reconcile by GET only.
          let recovered=null;
          try {
            const state=await fetch('/api/chat',{method:'GET',credentials:'same-origin',cache:'no-store',signal:typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function'?AbortSignal.timeout(15000):undefined});
            if(state.ok){const data=await state.json();recovered=data.images?.find(x=>x.id===request.id);}
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


