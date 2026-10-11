(() => {
  const motion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';
  function enhanceDialog(element,label,close){
    const trigger=document.activeElement,viewport=window.SofiaChatViewport?.capture();
    element.classList.add('sofia-dialog');element.setAttribute('aria-label',label);
    const native=element.tagName==='DIALOG';if(!native){element.setAttribute('role','dialog');element.setAttribute('aria-modal','true');}
    const restore=()=>{const parent=[...(document.querySelectorAll?.('dialog[open]')||[])].at(-1)||document.querySelector?.('dialog[open]');if(!parent&&element.dataset?.returnToLatest!=='true')window.SofiaChatViewport?.restore(viewport);if(trigger?.isConnected&&(!parent||parent.contains?.(trigger)))trigger.focus?.({preventScroll:true});};
    if(native)element.addEventListener('close',restore,{once:true});
    else element.onkeydown=event=>{
      if(event.key==='Escape'){event.preventDefault();close?.();}if(event.key!=='Tab')return;
      const items=[...element.querySelectorAll('button,input,select,textarea,a[href]')].filter(x=>!x.disabled&&x.getClientRects().length);
      if(event.shiftKey&&document.activeElement===items[0]||!event.shiftKey&&document.activeElement===items.at(-1)){event.preventDefault();(event.shiftKey?items.at(-1):items[0])?.focus();}
    };return restore;
  }
  const composerHeights=new WeakMap();
  function resizeComposer(input,measure=true){
    if(!input||input.tagName!=='TEXTAREA')return;
    // A viewport scroll must not repeatedly collapse a focused textarea to auto:
    // WebKit can leave its native caret painted at the previous text position.
    if(measure||!composerHeights.has(input)){input.style.height='auto';composerHeights.set(input,input.scrollHeight);}
    const available=window.visualViewport?.height||window.innerHeight||800,limit=available<320?Math.max(46,Math.floor(available/4)):Math.max(72,Math.min(144,Math.floor(available/3)));
    const height=Math.min(limit,Math.max(46,composerHeights.get(input)))+'px';if(input.style.height!==height)input.style.height=height;
  }
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
  let layoutHeight=Math.max(window.innerHeight||0,document.documentElement.clientHeight||0,viewport?.height||0);
  function resize(){const focused=document.activeElement===input,height=viewport?.height||window.innerHeight;
    if(!focused)layoutHeight=Math.max(layoutHeight,window.innerHeight||0,document.documentElement.clientHeight||0,height||0);
    const top=Math.max(0,viewport?.offsetTop||0),bottom=top+height;
    const keyboardOpen=focused&&(viewport?.scale||1)<=1.01&&Math.max(layoutHeight,document.documentElement.clientHeight||0,window.innerHeight||0)-height>96;
    document.documentElement.dataset.composerFocused=String(focused);document.documentElement.dataset.compactViewport=String(focused&&height<320);
    document.documentElement.dataset.keyboardOpen=String(keyboardOpen);
    const inset=keyboardOpen?Math.max(0,layoutHeight-bottom):0;
    document.documentElement.style.setProperty('--sofia-keyboard-inset',inset+'px');document.documentElement.style.setProperty('--sofia-visible-height',height+'px');document.documentElement.style.setProperty('--sofia-visible-top',top+'px');resizeComposer(input,false);
  }
  viewport?.addEventListener('resize',resize);viewport?.addEventListener('scroll',resize);window.addEventListener('resize',resize);input?.addEventListener('focus',resize);input?.addEventListener('blur',resize);resize();
})();

