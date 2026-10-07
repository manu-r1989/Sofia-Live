(() => {
  function decorate(node,createdAt) {
    if(!node || !createdAt || !Number.isFinite(Date.parse(createdAt)))return;
    const date=new Date(createdAt);
    node.dataset.messageText ||= node.textContent;
    node.dataset.createdAt=date.toISOString();
    node.querySelector?.('time.message-time')?.remove();
    const time=document.createElement('time');time.className='message-time';time.dateTime=date.toISOString();
    time.textContent=new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'}).format(date);
    time.title=new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',dateStyle:'medium',timeStyle:'short'}).format(date);
    time.setAttribute('aria-label','Gesendet am '+time.title);node.append(time);
  }
  window.SofiaTimeline={decorate};
})();
