// Check the service worker on each launch. Reload only an idle, untouched startup.
(() => {
 const sw=navigator.serviceWorker;if(!sw)return;
 const asset=document.querySelector('script[src*="app.js?v="]')?.getAttribute('src')?.split('v=')[1];
 let untouched=true,reloading=false,checking=false;const deadline=Date.now()+60000;
 const touched=()=>{untouched=false;};document.addEventListener('pointerdown',touched,{capture:true,once:true});document.addEventListener('keydown',touched,{capture:true,once:true});
 function version(controller){return new Promise(resolve=>{if(!controller||typeof MessageChannel==='undefined'){resolve(null);return;}const channel=new MessageChannel(),finish=value=>{clearTimeout(timer);channel.port1.close();resolve(value);},timer=setTimeout(()=>finish(null),1500);channel.port1.onmessage=e=>finish(e.data?.version);try{controller.postMessage({type:'SOFIA_VERSION'},[channel.port2]);}catch{finish(null);}});}
 async function changed(){if(checking||reloading)return;checking=true;try{const target=await version(sw.controller);if(!target||!asset||target===asset)return;if(!untouched||Date.now()>deadline){window.SofiaWorkspace?.notice('Neue Version bereit. Unter App und Hilfe kannst du sie laden.');return;}if(sessionStorage.getItem('sofia_auto_update_target')===target)return;
  // Store before reload; a mismatched cache must never cause a reload loop.
  sessionStorage.setItem('sofia_auto_update_target',target);reloading=true;const applied=await window.SofiaWorkspace?.applyUpdate({automatic:true});if(applied!==true){reloading=false;sessionStorage.removeItem('sofia_auto_update_target');}
 }catch{reloading=false;}finally{checking=false;}}
 sw.addEventListener('controllerchange',()=>void changed());
 async function start(){try{const registration=await sw.register('./sw.js',{updateViaCache:'none'});if(registration.waiting)registration.waiting.postMessage({type:'SKIP_WAITING'});await changed();await registration.update();}catch{/* Offline startup keeps the existing version and all drafts. */}}
 if(document.readyState==='complete')void start();else window.addEventListener('load',()=>void start(),{once:true});
})();
