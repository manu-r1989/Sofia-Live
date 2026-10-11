/* Sofia 4.99 — three main areas. Opening an area never submits a draft. */
(() => {
 const host=document.querySelector('.chatPanel');if(!host)return;
 const nav=document.createElement('nav');nav.className='sofia-main-nav';nav.setAttribute('aria-label','Hauptbereiche');
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
 for(const [key,label]of [['chat','Chat'],['today','Heute'],['gallery','Galerie']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>open(key);buttons.set(key,b);nav.append(b);}
 host.insertBefore(nav,host.firstChild);refresh();
 if(typeof MutationObserver!=='undefined')new MutationObserver(refresh).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
 window.SofiaNavigation={open,refresh};
})();
