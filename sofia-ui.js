(() => {
  const motion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';
  function enhanceDialog(element,label,close){
    const trigger=document.activeElement,viewport=window.SofiaChatViewport?.capture();
    element.classList.add('sofia-dialog');element.setAttribute('aria-label',label);
    const native=element.tagName==='DIALOG';if(!native){element.setAttribute('role','dialog');element.setAttribute('aria-modal','true');}
    const restore=()=>{if(element.dataset?.returnToLatest!=='true')window.SofiaChatViewport?.restore(viewport);if(trigger?.isConnected)trigger.focus?.({preventScroll:true});};
    if(native)element.addEventListener('close',restore,{once:true});
    else element.onkeydown=event=>{
      if(event.key==='Escape'){event.preventDefault();close?.();}if(event.key!=='Tab')return;
      const items=[...element.querySelectorAll('button,input,select,textarea,a[href]')].filter(x=>!x.disabled&&x.getClientRects().length);
      if(event.shiftKey&&document.activeElement===items[0]||!event.shiftKey&&document.activeElement===items.at(-1)){event.preventDefault();(event.shiftKey?items.at(-1):items[0])?.focus();}
    };return restore;
  }
  function resizeComposer(input){if(!input||input.tagName!=='TEXTAREA')return;input.style.height='auto';input.style.height=Math.min(144,Math.max(46,input.scrollHeight))+'px';}
  function refreshDays(root){
    if(!root)return;const viewport=window.SofiaChatViewport?.capture(),top=root.scrollTop;
    root.querySelectorAll('.message-day').forEach(x=>x.remove());let previous='';
    for(const child of [...root.children]){
      if(child.hidden)continue;const stamp=child.dataset.createdAt||child.querySelector('[data-created-at]')?.dataset.createdAt;if(!stamp||!Number.isFinite(Date.parse(stamp)))continue;
      const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(stamp));if(day===previous)continue;previous=day;
      const label=document.createElement('div');label.className='message-day';label.textContent=new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',dateStyle:'medium'}).format(new Date(stamp));root.insertBefore(label,child);
    }if(viewport)window.SofiaChatViewport.restore(viewport);else root.scrollTop=top;
  }
  window.SofiaUI={enhanceDialog,resizeComposer,refreshDays,motion};
  const input=document.getElementById('input');input?.addEventListener('input',()=>resizeComposer(input));resizeComposer(input);
  const viewport=window.visualViewport;
  function resize(){const focused=document.activeElement===input,height=viewport?.height||window.innerHeight;
    const inset=focused&&height<window.innerHeight*.8?Math.max(0,window.innerHeight-height-(viewport?.offsetTop||0)):0;
    document.documentElement.style.setProperty('--sofia-keyboard-inset',inset+'px');document.documentElement.style.setProperty('--sofia-visible-height',height+'px');
  }
  viewport?.addEventListener('resize',resize);viewport?.addEventListener('scroll',resize);window.addEventListener('resize',resize);input?.addEventListener('focus',resize);input?.addEventListener('blur',resize);resize();
})();
