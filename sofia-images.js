(() => {
  const active = new Map();
  const pending = new Set();
  const failureReply = 'Ich bin gerade nicht in der passenden Umgebung für ein Foto. Frag mich gern gleich noch einmal.';
  let referenceId = null;
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
    const existing=document.getElementById('portrait-' + image.id);
    if (existing && (existing.dataset.portraitStatus !== 'failed' || image.status === 'failed')) return;
    existing?.remove();
    if (image.status === 'failed') {
      const notice=document.createElement('div'); notice.id='portrait-' + image.id;
      notice.className='msg sofia'; notice.dataset.portraitStatus='failed'; notice.textContent=failureReply;
      slot.append(notice); slot.hidden=false; return;
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
    img.style.cssText = 'display:block;width:180px;max-width:100%;border-radius:12px';
    button.append(img);
    button.onclick = () => {
      referenceId = image.id;
      const dialog = document.createElement('dialog');
      dialog.style.cssText = 'max-width:92vw;max-height:92vh;border:0;border-radius:16px;padding:16px;background:#171722;color:white';
      const full = document.createElement('img'); full.src = url; full.alt = img.alt;
      full.style.cssText = 'display:block;max-width:85vw;max-height:75vh;object-fit:contain';
      const close = document.createElement('button'); close.textContent = 'Schließen'; close.type='button'; close.onclick=()=>dialog.close();
      const download = document.createElement('a'); download.textContent='Herunterladen'; download.href=url + '&download=1'; download.download='sofia-' + image.id + '.jpg'; download.style.cssText='color:inherit;margin-left:16px';
      dialog.append(full,close,download); document.body.append(dialog);
      dialog.addEventListener('close',()=>dialog.remove(),{once:true});
      dialog.showModal(); close.focus();
    };
    figure.append(button); slot.append(figure); slot.hidden=false;
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
      const successful=events.filter(x=>x.status !== 'failed' && valid(x.id));
      if (!referenceId && successful.length) referenceId=successful.at(-1).id;
    },
    generate(request) {
      if (!valid(request?.id)) return Promise.resolve();
      if (active.has(request.id)) return active.get(request.id);
      pending.add(request.id);
      slotFor(request.id); // Reserve the original turn without showing progress UI.
      const job = (async () => {
        try {
          const response = await fetch('/api/chat',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'generate_image',requestId:request.id})});
          const data = await response.json();
          if (!response.ok) throw new Error('portrait_failed');
          show(data.image); referenceId=data.image.id;
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
