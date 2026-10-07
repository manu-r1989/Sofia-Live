(() => {
  const active = new Map();
  const pending = new Set();
  const failureReply = 'Ich bin gerade nicht in der passenden Umgebung für ein Foto. Frag mich gern gleich noch einmal.';
  let referenceId = null;
  try { referenceId=localStorage.getItem('sofia-photo-reference'); } catch {}
  function rememberReference(id) { referenceId=id;try { localStorage.setItem('sofia-photo-reference',id); } catch {} }
  function hideAcknowledgment(image) {
    const node=document.getElementById('messages')?.querySelector(`[data-portrait-request-id="${image.anchorId || image.id}"]`);
    if(node && /^Gib mir einen kleinen Moment[.!]?$/i.test(node.textContent.trim()))node.hidden=true;
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
  function show(image) {
    if (!image || !valid(image.id)) return;
    const messages=document.getElementById('messages');
    if (!messages) return;
    const slot=locate(image);
    if (!slot) return;
    if(image.status==='pending')return;
    if(image.status!=='failed')hideAcknowledgment(image);
    const existing=document.getElementById('portrait-' + image.id);
    if (existing && (existing.dataset.portraitStatus !== 'failed' || image.status === 'failed')) return;
    const viewport=window.SofiaChatViewport?.capture();
    existing?.remove();
    if (image.status === 'failed') {
      const notice=document.createElement('div'); notice.id='portrait-' + image.id;
      notice.className='msg sofia'; notice.dataset.portraitStatus='failed'; notice.textContent=failureReply;
      slot.append(notice); slot.hidden=false; window.SofiaChatViewport?.restore(viewport); return;
    }
    const figure = document.createElement('figure');
    figure.className = 'msg sofia'; figure.dataset.portraitStatus='done'; figure.id = 'portrait-' + image.id;
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
    button.onclick = () => {
      rememberReference(image.id);
      const dialog = document.createElement('dialog');
      dialog.style.cssText = 'max-width:92vw;max-height:92vh;border:0;border-radius:16px;padding:16px;background:#171722;color:white';
      const full = document.createElement('img'); full.src = url; full.alt = img.alt;
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
      dialog.append(full,close,download,status); document.body.append(dialog);
      dialog.addEventListener('close',()=>{closed=true;if(objectUrl)URL.revokeObjectURL(objectUrl);dialog.remove();},{once:true});
      prepareDownload();
      dialog.showModal(); close.focus();
    };
    figure.append(button); slot.append(figure); slot.hidden=false;
    window.SofiaChatViewport?.restore(viewport);
  }
  window.SofiaImages = {
    anchor,
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
      const successful=events.filter(x=>x.status !== 'failed' && x.status !== 'pending' && valid(x.id));
      if (!successful.some(x=>x.id===referenceId))referenceId=null;
      if (!referenceId && successful.length) rememberReference(successful.at(-1).id);
    },
    generate(request) {
      if (!valid(request?.id)) return Promise.resolve();
      if (active.has(request.id)) return active.get(request.id);
      pending.add(request.id);
      slotFor(request.id); // Reserve the original turn without showing progress UI.
      const job = (async () => {
        try {
          const response = await fetch('/api/chat',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'generate_image',requestId:request.id}),signal:typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(250000) : undefined});
          const data = await response.json();
          if (!response.ok) throw new Error('portrait_failed');
          show(data.image); rememberReference(data.image.id);
        } catch {
          show({...request,anchorId:request.id,status:'failed'});
        } finally {
          pending.delete(request.id);
        }
      })();
      active.set(request.id,job); return job;
    }
  };
})();
