(() => {
  const motion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';
  let pendingReturnMenu=null;
  function navigateFrom(parent,open,reopen,close){
    const scroll=parent.scrollTop||0,ancestor=parent._returnMenu||null;
    parent.dataset ||= {};
    parent.dataset.menuForward='true';
    const proceed=ok=>{if(ok===false){delete parent.dataset.menuForward;return false;}pendingReturnMenu=()=>{pendingReturnMenu=ancestor;const restored=reopen();if(restored)restored.scrollTop=scroll;};open();return true;};
    const result=close?close():parent.close();
    return result?.then?result.then(proceed):proceed(result);
  }
  function enhanceDialog(element,label,close){
    const trigger=document.activeElement,viewport=window.SofiaChatViewport?.capture();
    element.classList.add('sofia-dialog');element.setAttribute('aria-label',label);
    element.dataset ||= {};
    delete element.dataset.menuForward;
    element._returnMenu=pendingReturnMenu;pendingReturnMenu=null;
    const native=element.tagName==='DIALOG';if(!native){element.setAttribute('role','dialog');element.setAttribute('aria-modal','true');}
    const restore=()=>{if(element.dataset?.menuForward==='true')return;if(element.dataset?.returnToLatest!=='true'&&element._returnMenu){const back=element._returnMenu;element._returnMenu=null;back();return;}const parent=[...(document.querySelectorAll?.('dialog[open]')||[])].at(-1)||document.querySelector?.('dialog[open]');if(!parent&&element.dataset?.returnToLatest!=='true')window.SofiaChatViewport?.restore(viewport);if(trigger?.isConnected&&(!parent||parent.contains?.(trigger)))trigger.focus?.({preventScroll:true});};
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
  function bindSendButton(button,submit,input){
    let pressed=null,suppressClickUntil=0;
    const touch=event=>event.pointerType==='touch'||event.pointerType==='pen';
    button.addEventListener('pointerdown',event=>{
      if(!touch(event)||event.isPrimary===false||event.button>0||button.disabled||document.activeElement!==input)return;
      // Keep the textarea focused until the tap is complete: blur would move the
      // keyboard-anchored panel out from underneath the finger before click.
      event.preventDefault();pressed={id:event.pointerId,x:event.clientX,y:event.clientY};
    });
    button.addEventListener('pointercancel',()=>{pressed=null;});
    button.addEventListener('pointerup',event=>{
      if(!pressed||event.pointerId!==pressed.id)return;
      const start=pressed;pressed=null;event.preventDefault();suppressClickUntil=Date.now()+750;
      const rect=button.getBoundingClientRect?.();
      if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>20||rect&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))return;
      submit(event);
    });
    button.addEventListener('click',event=>{
      event.preventDefault();
      if(Date.now()<suppressClickUntil&&(touch(event)||!event.pointerType&&event.detail>0))return;
      submit(event);
    });
  }
  function focusEditor(editor){
    if(!editor)return;
    // Keep this synchronous with the user gesture for the iOS keyboard. A newly
    // revealed field needs layout/scroll before native focus, not a delayed focus.
    editor.scrollIntoView?.({block:'nearest',behavior:'auto'});
    editor.getBoundingClientRect?.();
    editor.focus?.({preventScroll:true});
  }
  window.SofiaUI={enhanceDialog,navigateFrom,resizeComposer,refreshDays,motion,bindSendButton,focusEditor};
  const input=document.getElementById('input');input?.addEventListener('input',()=>resizeComposer(input));resizeComposer(input);
  const viewport=window.visualViewport;
  let layoutHeight=Math.max(window.innerHeight||0,document.documentElement.clientHeight||0,viewport?.height||0);
  let layoutWidth=window.innerWidth||0,lastHeight=null,lastEditor=null;
  function resize(){const focused=document.activeElement===input,height=viewport?.height||window.innerHeight;
    const width=window.innerWidth||0;
    if(width&&layoutWidth&&Math.abs(width-layoutWidth)>80)layoutHeight=Math.max(window.innerHeight||0,document.documentElement.clientHeight||0,height||0);
    if(width)layoutWidth=width;
    if(!focused)layoutHeight=Math.max(layoutHeight,window.innerHeight||0,document.documentElement.clientHeight||0,height||0);
    const top=Math.max(0,viewport?.offsetTop||0),bottom=top+height;
    const baseline=Math.max(layoutHeight,document.documentElement.clientHeight||0,window.innerHeight||0);
    const keyboardOpen=focused&&(viewport?.scale||1)<=1.01&&baseline-height>Math.max(160,baseline*.2);
    const editor=document.activeElement!==input&&document.activeElement?.tagName==='TEXTAREA'?document.activeElement:null;
    document.documentElement.dataset.editorFocused=String(!!editor);
    document.documentElement.dataset.composerFocused=String(focused);document.documentElement.dataset.compactViewport=String(focused&&height<320);
    document.documentElement.dataset.keyboardOpen=String(keyboardOpen);
    const inset=keyboardOpen?Math.max(0,layoutHeight-bottom):0;
    document.documentElement.style.setProperty('--sofia-keyboard-inset',inset+'px');document.documentElement.style.setProperty('--sofia-visible-height',height+'px');document.documentElement.style.setProperty('--sofia-visible-top',top+'px');resizeComposer(input,false);
    if(editor&&(lastHeight!==height||lastEditor!==editor))editor.scrollIntoView?.({block:'nearest',behavior:'auto'});
    lastHeight=height;lastEditor=editor;
  }
  document.addEventListener?.('focusin',resize);document.addEventListener?.('focusout',()=>{if(window.requestAnimationFrame)window.requestAnimationFrame(resize);else resize();});
  viewport?.addEventListener('resize',resize);viewport?.addEventListener('scroll',resize);window.addEventListener('resize',resize);input?.addEventListener('focus',resize);input?.addEventListener('blur',resize);resize();
})();

