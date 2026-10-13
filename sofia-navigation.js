/* Sofia 4.99 — three main areas. Opening an area never submits a draft. */
(() => {
 const host=document.querySelector('.chatPanel');if(!host)return;
 const nav=document.createElement('nav');nav.className='sofia-main-nav';nav.setAttribute('aria-label','Hauptbereiche');
 const paths={chat:'M4 4h16v12H8l-4 4V4Z',today:'M7 3v4m10-4v4M4 9h16M4 5h16v16H4V5Zm4 8h2m4 0h2m-8 4h2',gallery:'M4 4h16v16H4V4Zm0 13 5-6 4 4 3-3 4 5M16 8h.01',settings:'m9 4 1-2h4l1 2 2 1 2-.2 2 3-1.2 1.8V12l1.2 1.8-2 3-2-.2-2 1-1 2h-4l-1-2-2-1-2 .2-2-3L4.2 12V9.6L3 7.8l2-3L7 5l2-1ZM12 8a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6',mic:'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5Zm-3 6v1a6 6 0 0 0 12 0v-1m-6 7v4m-4 0h8',full:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',half:'M4 4h16v16H4V4Zm0 8h16',hide:'m6 8 6 6 6-6'};
 function icon(button,key){button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="'+(paths[key]||paths.chat)+'"/></svg>';}
 window.SofiaIcons={set:icon};
 const buttons=new Map();
 const active=()=>document.getElementById('sofia-gallery')?.open?'gallery':document.getElementById('sofia-today')?.open?'today':'chat';
 function refresh(){const area=active();for(const [key,b]of buttons){b.setAttribute('aria-current',key===area?'page':'false');b.classList.toggle('active',key===area);}}
 function open(area){
  // A photo edit, settings dialog or live session is never implicitly dismissed.
  const blocking=[...document.querySelectorAll('dialog[open]')].some(d=>!['sofia-gallery','sofia-today'].includes(d.id));
  if(blocking){window.SofiaWorkspace?.notice?.('Bitte zuerst die geöffnete Ansicht schließen.');return;}
  const target=area==='gallery'?'sofia-gallery':area==='today'?'sofia-today':null;
  for(const id of ['sofia-gallery','sofia-today'])if(id!==target)document.getElementById(id)?.close();
  if(area==='gallery')window.SofiaImages?.openGallery();
  else if(area==='today')window.SofiaToday?.open();
  else window.SofiaChatViewport?.reveal?.();
  refresh();
 }
 for(const [key,label]of [['chat','Chat'],['today','Heute'],['gallery','Galerie']]){const b=document.createElement('button');b.type='button';b.title=label;b.setAttribute('aria-label',label);icon(b,key);b.onclick=()=>open(key);buttons.set(key,b);nav.append(b);}
 for(const [id,key]of [['workspaceAction','settings'],['chatToolsAction','search'],['voiceToggle','mic'],['chatMinimize','half']]){const b=document.getElementById(id);if(b){icon(b,key);nav.append(b);}}
 host.insertBefore(nav,host.firstChild);refresh();
 if(typeof MutationObserver!=='undefined')new MutationObserver(refresh).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
 window.SofiaNavigation={open,refresh};
})();
