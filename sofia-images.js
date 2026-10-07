(() => {
  const active = new Map();
  const pending = new Set();
  const completed = new Set();
  let selectionVersion=0;
  const failureReply = 'Ich bin gerade nicht in der passenden Umgebung für ein Foto. Frag mich gern gleich noch einmal.';
  let referenceId = null;
  try { referenceId=localStorage.getItem('sofia-photo-reference'); } catch {}
  function rememberReference(id) { referenceId=id;try { localStorage.setItem('sofia-photo-reference',id); } catch {} }
  function hideAcknowledgment(image) {
    const node=document.getElementById('messages')?.querySelector(`[data-portrait-request-id="${image.anchorId || image.id}"]`);
    if(!node)return;
    const text=node.textContent.trim();
    if(/^Gib mir einen kleinen Moment[.!]?$/i.test(text))node.hidden=true;
    else if(/\s+Gib mir einen kleinen Moment[.!]?$/i.test(text))node.textContent=text.replace(/\s+Gib mir einen kleinen Moment[.!]?$/i,'');
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
    if (slot && node?.parentNode) node.parentNode.insertBefore(slot,node.nextSibling);
  }
  function locate(event) {
    const messages=document.getElementById('messages');
    if (!messages) return null;
    const slot=slotFor(event.id);
    let node=messages.querySelector(`[data-portrait-request-id="${event.anchorId || event.id}"]`);
    if (!node && event.requestMessage) {
      const users=[...messages.querySelectorAll('.msg.user')];
      node=users.reverse().find(x=>x.textContent === event.requestMessage);
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
  function openPhoto(image) {
    const url='/api/chat?image='+image.id;

      selectionVersion++;rememberReference(image.id);
      const dialog = document.createElement('dialog');dialog.id='sofia-photo-'+image.id;
      dialog.style.cssText = 'max-width:92vw;max-height:92vh;border:0;border-radius:16px;padding:16px;background:#171722;color:white';
      const full = document.createElement('img'); full.src = url; full.alt = image.caption || 'Sofia';
      full.style.cssText = 'display:block;max-width:85vw;max-height:75vh;object-fit:contain';
      const close = document.createElement('button'); close.textContent = 'Schließen'; close.type='button'; close.onclick=()=>dialog.close();
      const mobile=typeof navigator!=='undefined' && (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent||'') || (/Mac/i.test(navigator.userAgent||'') && navigator.maxTouchPoints>1));
      const download=document.createElement('button');download.type='button';download.textContent=mobile?'Bild speichern / teilen':'Herunterladen';download.style.cssText='margin-left:16px';download.disabled=true;
      const status=document.createElement('p');status.setAttribute('role','status');status.style.cssText='font-size:13px;margin-bottom:0';status.textContent='Bild wird zum Speichern vorbereitet.';
      let blob=null,file=null,objectUrl=null,closed=false;
      // Prepare before the click: iOS share requires an immediate user gesture.
      async function prepareDownload() {
        download.disabled=true;status.textContent='Bild wird zum Speichern vorbereitet.';
        try {
          const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});
          if(!response.ok)throw new Error('download_failed');
          blob=await response.blob();if(!blob.size || !/^image\/jpeg(?:;|$)/i.test(blob.type))throw new Error('download_invalid');
          if(closed)return;
          if(typeof File!=='undefined')file=new File([blob],'sofia-'+image.id+'.jpg',{type:'image/jpeg'});
          download.disabled=false;status.textContent='';
        } catch {blob=null;file=null;if(!closed){download.disabled=false;status.textContent='Bild konnte nicht vorbereitet werden. Bitte noch einmal versuchen.';}}
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
        remove.disabled=true;try{const response=await fetch('/api/social',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'delete_image',imageId:image.id})});if(!response.ok)throw Error();show({...image,status:'expired'});if(referenceId===image.id){referenceId=null;try{localStorage.removeItem('sofia-photo-reference');}catch{}}dialog.close();const gallery=document.getElementById('sofia-gallery');if(gallery){gallery.close();openGallery();}}catch{status.textContent='Das Bild konnte nicht gelöscht werden.';remove.disabled=false;}
      };
      dialog.append(full,close,download,status,remove); document.body.append(dialog);
      dialog.addEventListener('close',()=>{closed=true;if(objectUrl)URL.revokeObjectURL(objectUrl);dialog.remove();},{once:true});
      prepareDownload();
      dialog.showModal(); close.focus();
  }
  const galleryItems=new Map();
  function presentation(image) {
    if(image.status==='expired')return 'expired';
    return image.archived || Date.now()-Date.parse(image.createdAt)>=12*3600000?'archived':'chat';
  }
  function openGallery(selectedId=null) {
    const dialog=document.createElement('dialog');dialog.id='sofia-gallery';dialog.style.cssText='width:680px;max-width:92vw;max-height:85vh;border:0;border-radius:16px;padding:20px;background:#171722;color:white';
    const title=document.createElement('h2');title.textContent='Galerie';const note=document.createElement('p');note.textContent='Fotos bleiben 30 Tage ab Versand erhalten.';
    const close=document.createElement('button');close.type='button';close.textContent='Schließen';close.onclick=()=>dialog.close();
    const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:12px;margin:16px 0';
    const items=[...galleryItems.values()].filter(x=>!['pending','failed','expired'].includes(x.status)).reverse();
    for(const image of items){const button=document.createElement('button');button.dataset.galleryPhotoId=image.id;button.type='button';button.setAttribute('aria-label','Foto vom '+new Date(image.createdAt).toLocaleString('de-DE'));button.style.cssText='padding:0;border:0;border-radius:12px;background:transparent;cursor:pointer';const img=document.createElement('img');img.src='/api/chat?image='+image.id;img.alt='Sofia';img.loading='lazy';img.style.cssText='width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:12px';button.append(img);button.onclick=()=>openPhoto(image);grid.append(button);}
    if(!items.length)note.textContent='Noch keine Fotos in der Galerie. Fotos bleiben 30 Tage ab Versand erhalten.';
    dialog.append(title,note,grid,close);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();close.focus();
    if(selectedId){const selected=galleryItems.get(selectedId);if(selected&&!['expired','failed','pending'].includes(selected.status))openPhoto(selected);}
  }
  function show(image) {
    if (!image || !valid(image.id)) return;
    const messages=document.getElementById('messages');
    if (!messages) return;
    const slot=locate(image);
    if (!slot) return;
    if(image.status==='pending')return;
    if(image.status!=='failed')hideAcknowledgment(image);
    galleryItems.set(image.id,image);
    const mode=presentation(image);
    const existing=document.getElementById('portrait-' + image.id);
    if (existing && existing.dataset.presentation===mode && (existing.dataset.portraitStatus !== 'failed' || image.status === 'failed')) return;
    const viewport=window.SofiaChatViewport?.capture();
    existing?.remove();
    if (image.status === 'failed') {
      const notice=document.createElement('div'); notice.id='portrait-' + image.id;
      notice.className='msg sofia'; notice.dataset.portraitStatus='failed';notice.dataset.presentation=mode; notice.textContent=failureReply;
      slot.append(notice); slot.hidden=false; window.SofiaChatViewport?.restore(viewport); return;
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
    window.SofiaChatViewport?.restore(viewport);
  }
  function refreshExpiry(){for(const image of galleryItems.values()){const expired=Date.now()-Date.parse(image.createdAt)>=30*86400000;show({...image,...(expired?{status:'expired'}:{})});if(expired){document.getElementById('sofia-photo-'+image.id)?.close();document.getElementById('sofia-gallery')?.querySelector('[data-gallery-photo-id="'+image.id+'"]')?.remove();}}}
  if(typeof setInterval==='function')setInterval(refreshExpiry,60000);
  document.addEventListener?.('visibilitychange',()=>{if(document.visibilityState==='visible')refreshExpiry();});
  window.SofiaImages = {
    anchor, openGallery,
    get referenceId() { return referenceId; },
    restore(events) {
      if (!Array.isArray(events)) return;
      // Associate legacy photographs with their old acknowledgments where possible.
      const old=events.filter(x=>!x.anchorId && valid(x.id));
      const acknowledgments=[...document.getElementById('messages')?.querySelectorAll('.msg.sofia') || []]
        .filter(x=>x.textContent === 'Gib mir einen kleinen Moment.' && !x.dataset.portraitRequestId).slice(-old.length);
      old.forEach((image,index)=>{const node=acknowledgments[index];if(node)node.dataset.portraitRequestId=image.id;});
      events.forEach(show);
      events.filter(x=>x.status==='pending' && x.jobStatus==='ready').forEach(x=>window.SofiaImages.generate(x));
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
      slotFor(request.id); // Reserve the original turn without showing progress UI.
      const job = (async () => {
        try {
          const response = await fetch('/api/chat',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'generate_image',requestId:request.id}),signal:typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(250000) : undefined});
          const data = await response.json();
          if (!response.ok || !valid(data.image?.id)) throw new Error('portrait_failed');
          show(data.image); if(selectionVersion===selectionAtStart)rememberReference(data.image.id);
        } catch {
          // A lost response may follow a successful write: reconcile by GET only.
          let recovered=null;
          try {
            const state=await fetch('/api/chat',{method:'GET',credentials:'same-origin',cache:'no-store',signal:typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function'?AbortSignal.timeout(15000):undefined});
            if(state.ok){const data=await state.json();recovered=data.images?.find(x=>x.id===request.id&&x.status!=='failed'&&x.status!=='pending');}
          }catch{}
          if(recovered){show(recovered);if(selectionVersion===selectionAtStart)rememberReference(recovered.id);}
          else show({...request,anchorId:request.id,status:'failed'});
        } finally {
          pending.delete(request.id);
          completed.add(request.id);if(completed.size>100)completed.delete(completed.values().next().value);
          active.delete(request.id);
        }
      })();
      active.set(request.id,job); return job;
    }
  };
})();


