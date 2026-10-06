(() => {
  const active = new Map();
  let referenceId = null;
  function show(image) {
    if (!image || !/^[a-f0-9-]{36}$/.test(image.id)) return;
    const messages = document.getElementById('messages');
    if (!messages || document.getElementById('portrait-' + image.id)) return;
    const figure = document.createElement('figure');
    figure.className = 'msg sofia'; figure.id = 'portrait-' + image.id;
    figure.style.margin = '8px 0';
    const button = document.createElement('button'); button.type = 'button';
    button.style.cssText = 'border:0;background:transparent;padding:0;cursor:pointer';
    button.setAttribute('aria-label','Bild öffnen: ' + (image.caption || 'Sofia'));
    const img = document.createElement('img');
    const url = '/api/chat?image=' + image.id;
    img.src = url; img.alt = image.caption || 'Sofia'; img.loading = 'lazy';
    img.style.cssText = 'display:block;width:180px;max-width:100%;border-radius:12px';
    button.append(img);
    const caption = document.createElement('figcaption'); caption.textContent = image.caption || 'Ein Bild von mir.';
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
    figure.append(button,caption); messages.append(figure);
    messages.scrollTop = messages.scrollHeight;
  }
  window.SofiaImages = {
    get referenceId() { return referenceId; },
    restore(images) { if (Array.isArray(images)) { images.forEach(show); if (!referenceId && images.length) referenceId=images.at(-1).id; } },
    generate(request) {
      if (!request?.id) return Promise.resolve();
      if (active.has(request.id)) return active.get(request.id);
      const job = (async () => {
        try {
          const response = await fetch('/api/chat',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'generate_image',requestId:request.id})});
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Das Bild konnte gerade nicht erstellt werden.');
          show(data.image); referenceId=data.image.id;
        } catch (error) {
          const message=document.createElement('div'); message.className='msg sofia'; message.textContent=error.message;
          document.getElementById('messages')?.append(message);
        }
      })();
      active.set(request.id,job); return job;
    }
  };
})();
