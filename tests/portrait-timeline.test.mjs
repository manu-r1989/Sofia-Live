import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../sofia-images.js',import.meta.url),'utf8');
const id='11111111-1111-4111-8111-111111111111';
const id2='22222222-2222-4222-8222-222222222222';
function harness(fetchImpl,extras={}) {
 class Node {
  constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.style={};this.hidden=false;this.className='';this.ownText='';}
  get textContent(){return this.ownText+this.children.map(x=>x.textContent).join('');}set textContent(v){this.ownText=v;this.children=[];}
  get isConnected(){return this.tag==='body'||!!this.parentNode?.isConnected;}
  get classList(){return {contains:c=>this.className.split(' ').includes(c)};}
  get firstChild(){return this.children[0]||null;}
  get nextSibling(){const a=this.parentNode?.children;return a?.[a.indexOf(this)+1]||null;}
  replaceChildren(...nodes){for(const child of this.children)child.parentNode=null;this.children=[];this.ownText='';this.append(...nodes);}
  append(...nodes){for(const n of nodes)this.insertBefore(n,null);}
  insertBefore(n,b){if(n===b)return n;if(n.parentNode)n.parentNode.children.splice(n.parentNode.children.indexOf(n),1);n.parentNode=this;const i=b?this.children.indexOf(b):this.children.length;if(i<0)throw Error('Missing insertion point');this.children.splice(i,0,n);return n;}
  setAttribute(k,v){this[k]=v;}addEventListener(name,fn){this.events||={};const before=this.events[name];this.events[name]=before?(event)=>{before(event);fn(event);}:fn;}focus(){this.focused=true;}scrollIntoView(options){this.scrolled=options;}showModal(){}close(){this.events?.close?.();}click(){this.clicked=true;}
  remove(){this.parentNode.children.splice(this.parentNode.children.indexOf(this),1);}
  all(){return this.children.flatMap(n=>[n,...n.all()]);}
  querySelectorAll(selector){return this.all().filter(n=>selector.startsWith('[data-portrait-request-id=')?n.dataset.portraitRequestId===selector.split('"')[1]:selector.split('.').filter(Boolean).every(c=>n.classList.contains(c)));}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
 }
 const body=new Node('body'),messages=new Node('div'),mode=new Node('small');messages.id='messages';mode.id='mode';mode.textContent='bereit';body.append(messages,mode);
 const document={body,createTextNode:text=>{const n=new Node('text');n.textContent=text;return n;},createElement:tag=>new Node(tag),getElementById:target=>[body,...body.all()].find(n=>n.id===target)||null};
 const window={};vm.runInNewContext(source,{document,window,fetch:(url,options={})=>url==='/api/chat'&&!options.method?(extras.galleryFetch?extras.galleryFetch():Promise.resolve({ok:true,json:async()=>({images:extras.galleryImages||[]})})):fetchImpl(url,options),Map,Promise,...extras});
 const message=(text,who='sofia',anchorId)=>{const n=new Node('div');n.className='msg '+who;n.textContent=text;if(anchorId)n.dataset.portraitRequestId=anchorId;messages.append(n);if(anchorId)window.SofiaImages.anchor(anchorId,n);return n;};
 return {body,messages,document,window,api:window.SofiaImages,message};
}
const image=(id)=>({id,anchorId:id,caption:'Sofia',url:'/api/chat?image='+id});
test('gallery closes from both its top and bottom buttons',()=>{
 const h=harness();h.api.openGallery();let gallery=h.document.getElementById('sofia-gallery');let buttons=gallery.children.filter(x=>x.tag==='button'&&x.textContent==='Schließen');assert.equal(buttons.length,2);assert.equal(gallery.children[1],buttons[0]);assert.equal(gallery.children.at(-1),buttons[1]);buttons[0].onclick();assert.equal(h.document.getElementById('sofia-gallery'),null);
 h.api.openGallery();gallery=h.document.getElementById('sofia-gallery');gallery.children.at(-1).onclick();assert.equal(h.document.getElementById('sofia-gallery'),null);
});
test('photo follow-up controls submit the selected source and preserve the dialog on a busy refusal',()=>{
 const h=harness(async()=>preparedPhoto()),sent=[];h.api.restore([{...image(id),createdAt:new Date().toISOString()}]);h.api.openGallery(id);
 let view=h.document.getElementById('sofia-photo-'+id);h.window.SofiaPhotoAction=()=>false;view.all().find(x=>x.textContent==='Andere Perspektive').onclick();assert.ok(h.document.getElementById(view.id));
 view.all().find(x=>x.textContent==='180° · Von hinten').onclick();assert.ok(h.document.getElementById(view.id));
 h.window.SofiaPhotoAction=text=>{sent.push({text,reference:h.api.referenceId});return true;};view.all().find(x=>x.textContent==='180° · Von hinten').onclick();assert.equal(h.document.getElementById('sofia-gallery'),null);assert.equal(sent[0].reference,id);assert.match(sent[0].text,/anderen Perspektive/);assert.match(sent[0].text,/180°.*gegenüberliegende Seite/);
 h.api.openGallery(id);view=h.document.getElementById('sofia-photo-'+id);view.all().find(x=>x.tag==='button'&&x.textContent==='Detail ansehen').onclick();const input=view.all().find(x=>x['aria-label']==='Gewünschtes Fotodetail');input.value='dein Oberteil';view.all().find(x=>x.tag==='button'&&x.textContent==='Detail zeigen').onclick();assert.equal(sent[1].reference,id);assert.match(sent[1].text,/Nahaufnahme.*dein Oberteil.*genauer/);
});
test('perspective compass opens without submitting, cancels safely and offers six distinct side angles',()=>{
 const h=harness(async()=>preparedPhoto()),sent=[];h.window.SofiaPhotoAction=(text,reference)=>{sent.push({text,reference});return true;};h.api.restore([{...image(id),createdAt:new Date().toISOString()}]);h.api.openGallery(id);
 const view=h.document.getElementById('sofia-photo-'+id),toggle=view.all().find(x=>x.textContent==='Andere Perspektive'),compass=view.all().find(x=>x.className==='photo-perspective-controls');
 assert.equal(compass.hidden,true);toggle.onclick();assert.equal(compass.hidden,false);assert.equal(toggle['aria-expanded'],'true');assert.equal(sent.length,0);
 const choices=compass.all().filter(x=>x.tag==='button'&&x.textContent!=='Abbrechen');assert.equal(choices.length,7);
 compass.all().find(x=>x.textContent==='Abbrechen').onclick();assert.equal(compass.hidden,true);assert.equal(sent.length,0);assert.ok(h.document.getElementById(view.id));
 toggle.onclick();choices.find(x=>x.className==='photo-perspective-left').onclick();assert.equal(sent[0].reference,id);assert.match(sent[0].text,/90° nach links/);assert.equal(sent.length,1);
});
test('compass uses the current gallery photo after navigating and escaping does not send',()=>{
 const h=harness(async()=>preparedPhoto()),sent=[];h.window.SofiaPhotoAction=(text,reference)=>{sent.push({text,reference});return true;};const at=new Date().toISOString();h.api.restore([{...image(id),createdAt:at},{...image(id2),createdAt:at}]);h.api.openGallery(id2);
 const view=h.document.getElementById('sofia-photo-'+id2);view.all().find(x=>x['aria-label']==='Nächstes Foto').onclick();
 const compass=view.all().find(x=>x.className==='photo-perspective-controls');view.all().find(x=>x.textContent==='Andere Perspektive').onclick();compass.events.keydown({key:'Escape',preventDefault(){},stopPropagation(){}});assert.equal(compass.hidden,true);assert.equal(sent.length,0);
 view.all().find(x=>x.textContent==='Andere Perspektive').onclick();compass.all().find(x=>x.className==='photo-perspective-back-right').onclick();assert.equal(sent[0].reference,id);assert.match(sent[0].text,/135° nach rechts/);
});
test('failed photos offer an explicit retry while quota failures cannot launch another attempt',()=>{
 const h=harness(),sent=[];h.window.SofiaPhotoAction=text=>{sent.push(text);return true;};h.api.restore([{...image(id),status:'failed',requestMessage:'Schick mir ein Selfie.'}]);let retry=h.document.getElementById('portrait-'+id).all().find(x=>x.textContent==='Erneut versuchen');retry.onclick();assert.deepEqual(sent,['Schick mir ein Selfie.']);assert.equal(retry.disabled,true);
 h.api.restore([{...image(id2),status:'failed',failureCode:'test_image_limit'}]);retry=h.document.getElementById('portrait-'+id2).all().find(x=>x.textContent==='Erneut versuchen');assert.equal(retry.disabled,true);
});
test('gallery swipe changes adjacent photos in current filtered order with safe boundaries',()=>{
 const h=harness(async()=>preparedPhoto());const at=new Date().toISOString();h.api.restore([{...image(id),createdAt:at,kind:'selfie'},{...image(id2),createdAt:at,kind:'selfie'}]);h.api.openGallery(id2);
 const full=h.document.getElementById('sofia-photo-'+id2).all().find(x=>x.tag==='img');
 const swipe=(dx,dy=0)=>{full.events.touchstart({touches:[{identifier:1,clientX:100,clientY:100}]});full.events.touchend({touches:[],changedTouches:[{identifier:1,clientX:100+dx,clientY:100+dy}]});};
 swipe(-90);assert.equal(h.api.referenceId,id);assert.ok(h.document.getElementById('sofia-photo-'+id));swipe(90);assert.equal(h.api.referenceId,id2);swipe(90);assert.equal(h.api.referenceId,id2);swipe(-70,100);assert.equal(h.api.referenceId,id2);
 const filter=h.document.getElementById('sofia-gallery').all().find(x=>x['aria-label']==='Galerie nach Bildart filtern');filter.value='environment';filter.onchange();swipe(-90);assert.equal(h.api.referenceId,id2);
});
test('rapid gallery navigation never prepares or downloads the previous photo under the new filename',async()=>{
 const waiting=[];const h=harness(()=>new Promise(resolve=>waiting.push(resolve)),{URL:{createObjectURL:()=> 'blob:current',revokeObjectURL(){}}});const at=new Date().toISOString();h.api.restore([{...image(id),createdAt:at},{...image(id2),createdAt:at}]);h.api.openGallery(id2);
 const dialog=h.document.getElementById('sofia-photo-'+id2);dialog.all().find(x=>x['aria-label']==='Nächstes Foto').onclick();
 waiting[1](preparedPhoto());await new Promise(r=>setImmediate(r));waiting[0](preparedPhoto());await new Promise(r=>setImmediate(r));
 const download=dialog.all().find(x=>x.textContent==='Herunterladen');await download.onclick();assert.equal(h.api.referenceId,id);assert.ok(dialog.id.endsWith(id));
});
test('photo progress lives in status line while acknowledgment stays hidden',async()=>{
 let resolve;const h=harness(()=>new Promise(r=>resolve=r)),ack=h.message('Gib mir einen kleinen Moment.','sofia',id);
 assert.equal(ack.hidden,true);const job=h.api.generate({id});assert.equal(h.document.getElementById('mode').textContent,'nimmt ein Foto auf');assert.equal(h.api.isGenerating,true);
 resolve({ok:true,json:async()=>({image:image(id)})});await job;
 assert.equal(h.api.isGenerating,false);assert.equal(h.document.getElementById('mode').textContent,'bereit');assert.ok(h.document.getElementById('portrait-'+id));
});
test('confirmed daily test limit automatically shows an honest failure without a follow-up',async()=>{
 const h=harness(async(_url,options)=>options.method==='POST'?{ok:false,json:async()=>({code:'test_image_limit',error:'hidden provider detail'})}:{ok:true,json:async()=>({images:[]})});
 h.message('Gib mir einen kleinen Moment.','sofia',id);await h.api.generate({id});
 assert.match(h.document.getElementById('portrait-'+id).textContent,/Foto-Limit der Testversion/);assert.equal(h.document.getElementById('mode').textContent,'bereit');
});
test('a repeated pending receipt retains its first turn and hides both wait messages',()=>{
 const h=harness(),first=h.message('Gib mir einen kleinen Moment.','sofia',id),slot=h.document.getElementById('portrait-slot-'+id),middle=h.message('nochmal','user'),second=h.message('Gib mir einen kleinen Moment.','sofia',id);
 assert.deepEqual(h.messages.children,[first,slot,middle,second]);assert.equal(first.hidden,true);assert.equal(second.hidden,true);
});
test('uncertain response with confirmed processing job keeps photo status and polls reads only',async()=>{
 let tick,calls=[];const h=harness(async(_url,options)=>{calls.push(options.method);return options.method==='POST'?{ok:false,json:async()=>({})}:{ok:true,json:async()=>({images:[{id,status:'pending',jobStatus:'processing'}]})};},{setInterval:fn=>{tick=fn;}});
 h.message('Gib mir einen kleinen Moment.','sofia',id);await h.api.generate({id});assert.equal(h.document.getElementById('portrait-'+id),null);assert.equal(h.api.isGenerating,true);
 await tick();assert.deepEqual(calls,['POST','GET','GET']);assert.equal(h.document.getElementById('mode').textContent,'nimmt ein Foto auf');
 h.api.restore([{...image(id),status:'failed'}]);assert.equal(h.api.isGenerating,false);assert.equal(h.document.getElementById('mode').textContent,'bereit');
});
test('slow image completion stays at requested turn ahead of newer messages',async()=>{
 let resolve;const h=harness(()=>new Promise(r=>resolve=r));
 const ack=h.message('Gib mir einen kleinen Moment.','sofia',id);
 const job=h.api.generate({id});const later=h.message('Ein späterer Gesprächsbeitrag','user');
 const slot=h.document.getElementById('portrait-slot-'+id);assert.equal(slot.hidden,true);
 resolve({ok:true,json:async()=>({image:image(id)})});await job;
 assert.deepEqual(h.messages.children,[ack,slot,later]);assert.equal(slot.hidden,false);
 assert.ok(h.document.getElementById('portrait-'+id));
});
test('reload and repeated history sync restore each picture at its own acknowledgment',()=>{
 const h=harness();const first=h.message('Gib mir einen kleinen Moment.','sofia',id);
 const middle=h.message('Zwischen den Bildern','user');const second=h.message('Gib mir einen kleinen Moment.','sofia',id2);const last=h.message('Danach','user');
 h.api.restore([image(id2),image(id)]);h.api.restore([image(id),image(id2)]);
 assert.deepEqual(h.messages.children,[first,h.document.getElementById('portrait-slot-'+id),middle,second,h.document.getElementById('portrait-slot-'+id2),last]);
 assert.equal(h.messages.querySelectorAll('.msg.sofia').length,4);
});
test('failed filtered or network request displays character reply at original turn, never raw error',async()=>{
 const h=harness(async()=>({ok:false,json:async()=>({error:'moderation_blocked provider secret detail'})}));
 const ack=h.message('Gib mir einen kleinen Moment.','sofia',id);const job=h.api.generate({id});const later=h.message('Neuer Beitrag','user');await job;
 const slot=h.document.getElementById('portrait-slot-'+id);
 assert.deepEqual(h.messages.children,[ack,slot,later]);assert.match(slot.textContent,/nicht in der passenden Umgebung/);assert.doesNotMatch(slot.textContent,/moderation|provider|secret/);
 assert.equal(h.api.referenceId,null);
 const next=h.message('Gib mir einen kleinen Moment.','sofia',id2);h.api.restore([image(id2)]);assert.ok(h.document.getElementById('portrait-'+id2));
});
test('retained old images outside trimmed history appear before newer conversation',()=>{
 const h=harness();const recent=h.message('Neuester Gesprächsbeitrag','user');
 h.api.restore([image(id),image(id2)]);
 const older=h.document.getElementById('portrait-older');assert.equal(h.messages.children[0],older);assert.equal(h.messages.children.at(-1),recent);
 assert.deepEqual(older.children.map(n=>n.id),['portrait-slot-'+id,'portrait-slot-'+id2]);
});
test('legacy pictures attach to old moment acknowledgments rather than the chat end',()=>{
 const h=harness(),at=new Date().toISOString();const user=h.message('Selfie','user');user.dataset.createdAt=at;const ack=h.message('Gib mir einen kleinen Moment.');ack.dataset.createdAt=at;const later=h.message('Danach','user');
 h.api.restore([{id,caption:'Altes Selfie',requestMessage:'Selfie',requestedAt:at}]);assert.deepEqual(h.messages.children,[user,ack,h.document.getElementById('portrait-slot-'+id),later]);
});

test('late server success replaces a transport-failure notice without changing the turn position',async()=>{
 const h=harness(async()=>{throw Error('Network disconnected');});
 const ack=h.message('Gib mir einen kleinen Moment.','sofia',id);await h.api.generate({id});
 const later=h.message('Späterer Beitrag','user');const slot=h.document.getElementById('portrait-slot-'+id);
 assert.equal(h.document.getElementById('portrait-'+id).dataset.portraitStatus,'failed');
 h.api.restore([image(id)]);
 assert.equal(h.document.getElementById('portrait-'+id).dataset.portraitStatus,'done');
 assert.deepEqual(h.messages.children,[ack,slot,later]);
});

test('pictures have an accessible image button but no visible caption or subtitle',()=>{
 const h=harness();h.message('Gib mir einen kleinen Moment.','sofia',id);h.api.restore([{...image(id),caption:'Diese Bildunterschrift soll nicht sichtbar sein'}]);
 const figure=h.document.getElementById('portrait-'+id);
 assert.deepEqual(figure.children.map(n=>n.tag),['button']);
 assert.equal(figure.children[0].children[0].tag,'img');
 assert.equal(figure.children[0].children[0].alt,'Diese Bildunterschrift soll nicht sichtbar sein');
});

test('successful photo hides only its moment acknowledgment, including after reload',()=>{
 const h=harness();const ack=h.message('Gib mir einen kleinen Moment.','sofia',id);const content=h.message('Eine richtige Antwort.','sofia',id2);
 h.api.restore([image(id),image(id2)]);assert.equal(ack.hidden,true);assert.equal(content.hidden,false);
});
test('failed photo hides acknowledgment and retains friendly explanation',()=>{
 const h=harness();const ack=h.message('Gib mir einen kleinen Moment.','sofia',id);
 h.api.restore([{...image(id),status:'failed'}]);assert.equal(ack.hidden,true);
});
test('reload resumes ready jobs once and never restarts processing jobs',async()=>{
 let calls=0;const h=harness(async()=>{calls++;return {ok:true,json:async()=>({image:image(id)})};});
 h.message('Gib mir einen kleinen Moment.','sofia',id);
 const jobs=[{id,status:'pending',jobStatus:'ready'},{id:id2,status:'pending',jobStatus:'processing'}];
 h.api.restore(jobs);h.api.restore(jobs);await h.api.generate({id});assert.equal(calls,1);assert.equal(h.api.referenceId,id);
 assert.equal(h.document.getElementById('portrait-'+id2),null);
});

const preparedPhoto=()=>({ok:true,blob:async()=>({size:100,type:'image/jpeg'})});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function openPhoto(h){h.api.restore([image(id)]);h.document.getElementById('portrait-'+id).children[0].onclick();return h.body.children.find(x=>x.tag==='dialog');}
class PhotoFile {constructor(parts,name,opts){this.name=name;this.type=opts.type;}}
test('iPhone shares prepared image from click without navigating or closing on cancellation',async()=>{
 let shares=0;const h=harness(async()=>preparedPhoto(),{File:PhotoFile,navigator:{userAgent:'iPhone',canShare:()=>true,share:async data=>{shares++;assert.equal(data.files[0].type,'image/jpeg');throw Object.assign(new Error(),{name:'AbortError'});}}});
 const dialog=openPhoto(h),save=dialog.all().find(x=>/^(?:Herunterladen|Bild speichern \/ teilen)$/.test(x.textContent));assert.equal(save.disabled,true);await tick();assert.equal(save.disabled,false);assert.equal(save.textContent,'Bild speichern / teilen');await save.onclick();assert.equal(shares,1);assert.ok(h.body.children.includes(dialog));assert.equal(dialog.all().find(x=>x.role==='status'&&x.tag==='p').textContent,'Teilen abgebrochen.');dialog.all().find(x=>x.tag==='button'&&x.textContent==='Schließen').onclick();assert.equal(h.body.children.includes(dialog),false);
});
test('desktop downloads blob with filename and retains close button, releasing URL on close',async()=>{
 let urls=0,revoked=0;const h=harness(async()=>preparedPhoto(),{navigator:{userAgent:'Macintosh',maxTouchPoints:0},URL:{createObjectURL:()=>{urls++;return 'blob:photo';},revokeObjectURL:()=>revoked++}});
 const dialog=openPhoto(h);await tick();await dialog.all().find(x=>/^(?:Herunterladen|Bild speichern \/ teilen)$/.test(x.textContent)).onclick();assert.equal(urls,1);assert.ok(h.body.children.includes(dialog));dialog.all().find(x=>x.tag==='button'&&x.textContent==='Schließen').onclick();assert.equal(revoked,1);
});
test('unsupported mobile sharing and preparation errors keep photo view recoverable',async()=>{
 const h=harness(async()=>preparedPhoto(),{navigator:{userAgent:'iPad'}});const dialog=openPhoto(h);await tick();await dialog.all().find(x=>/^(?:Herunterladen|Bild speichern \/ teilen)$/.test(x.textContent)).onclick();assert.match(dialog.all().find(x=>x.role==='status'&&x.tag==='p').textContent,/Halte das Bild gedrückt/);assert.equal(dialog.all().find(x=>/^(?:Herunterladen|Bild speichern \/ teilen)$/.test(x.textContent)).disabled,false);
 const failed=harness(async()=>({ok:false}),{navigator:{userAgent:'iPhone'}});const view=openPhoto(failed);await tick();assert.match(view.all().find(x=>x.role==='status'&&x.tag==='p').textContent,/noch einmal/);assert.equal(view.all().find(x=>/^(?:Herunterladen|Bild speichern \/ teilen)$/.test(x.textContent)).disabled,false);view.all().find(x=>x.tag==='button'&&x.textContent==='Schließen').onclick();assert.equal(failed.body.children.includes(view),false);
});

test('mixed action photo removes moment suffix while retaining actual task receipt',()=>{
 const h=harness();const ack=h.message('Als Aufgabe gespeichert: „Bericht“. Gib mir einen kleinen Moment.','sofia',id);
 h.api.restore([image(id)]);assert.equal(ack.textContent,'Als Aufgabe gespeichert: „Bericht“.');assert.equal(ack.hidden,false);
});


test('lost generation response recovers a saved photo by GET without generating again',async()=>{
 let posts=0,reads=0;
 const h=harness(async(url,opts)=>{if(opts.method==='POST'){posts++;throw new Error('lost response');}reads++;return {ok:true,json:async()=>({images:[image(id)]})};});
 h.message('Gib mir einen kleinen Moment.','sofia',id);
 await h.api.generate({id});await h.api.generate({id});
 assert.equal(posts,1);assert.equal(reads,1);assert.equal(h.document.getElementById('portrait-'+id).dataset.portraitStatus,'done');
});
test('opening an older photo during generation keeps that selected reference',async()=>{
 let complete;
 const h=harness(async(url,opts)=>opts?.method==='POST'?new Promise(resolve=>complete=resolve):preparedPhoto());
 h.api.restore([image(id2)]);
 const job=h.api.generate({id});
 h.document.getElementById('portrait-'+id2).children[0].onclick();
 complete({ok:true,json:async()=>({image:image(id)})});await job;
 assert.equal(h.api.referenceId,id2);
});


test('archived thumbnail is replaced in place and its link opens the exact gallery photo',()=>{
 const h=harness(async()=>({ok:false}));const ack=h.message('Gib mir einen kleinen Moment.','sofia',id);h.api.restore([image(id)]);const later=h.message('Weiter','user');
 h.api.restore([{...image(id),archived:true,createdAt:new Date().toISOString()}]);const marker=h.document.getElementById('portrait-'+id);assert.equal(marker.textContent,'Bild in der Galerie');assert.equal(marker.tag,'button');
 assert.deepEqual(h.messages.children,[ack,h.document.getElementById('portrait-slot-'+id),later]);marker.onclick();assert.ok(h.document.getElementById('sofia-gallery'));assert.equal(h.api.referenceId,id);
});
test('expired photograph has no thumbnail and is excluded from gallery references',()=>{
 const h=harness();h.api.restore([{...image(id),status:'expired',createdAt:'2026-01-01T00:00Z'}]);assert.equal(h.document.getElementById('portrait-'+id).textContent,'Bild nicht mehr verfügbar');assert.equal(h.api.referenceId,null);h.api.openGallery();assert.match(h.document.getElementById('sofia-gallery').textContent,/Keine Fotos für diese Auswahl/);
});

test('gallery combines date, kind and favorites without losing direct reference access',()=>{
 const h=harness();const createdAt=new Date().toISOString();h.api.restore([{...image(id),createdAt,kind:'selfie',favorite:true},{...image(id2),createdAt,kind:'environment',favorite:false}]);h.api.openGallery();const gallery=h.document.getElementById('sofia-gallery'),filter=gallery.all().find(n=>n['aria-label']==='Galerie nach Bildart filtern');filter.value='environment';filter.onchange();assert.equal(gallery.all().filter(n=>n.dataset.galleryPhotoId).length,1);const favorite=gallery.all().find(n=>n.textContent==='Nur Favoriten');favorite.onclick();assert.equal(gallery.all().filter(n=>n.dataset.galleryPhotoId).length,0);h.api.openGallery(id);assert.equal(h.api.referenceId,id);
});
test('favorite persists through server request and is immediately filterable',async()=>{
 const calls=[];const h=harness(async(u,o)=>{calls.push(JSON.parse(o.body));return {ok:true};});h.api.restore([{...image(id),createdAt:new Date().toISOString(),kind:'selfie'}]);h.api.openGallery();const gallery=h.document.getElementById('sofia-gallery'),button=gallery.all().find(n=>n.tag==='button'&&n.textContent==='☆ Favorit');await button.onclick();assert.equal(calls[0].operation,'favorite');assert.equal(calls[0].imageId,id);assert.equal(calls[0].favorite,true);gallery.all().find(n=>n.textContent==='Nur Favoriten').onclick();assert.equal(gallery.all().filter(n=>n.dataset.galleryPhotoId).length,1);
});

test('gallery groups retained pictures by Hamburg delivery day, without situation groups',()=>{
 const h=harness(async()=>preparedPhoto());const at=new Date().toISOString();h.api.restore([{...image(id),createdAt:at,capturedAt:at,location:'auf dem Sofa'}]);h.api.openGallery();const gallery=h.document.getElementById('sofia-gallery');assert.ok(gallery.all().some(n=>n.tag==='h3'&&/^\d{2}\.\d{2}\.\d{4}$/.test(n.textContent)));assert.ok(gallery.all().some(n=>n.textContent==='Mehrere auswählen'));assert.equal(gallery.all().find(n=>n.textContent==='Auswahl herunterladen / teilen').disabled,true);
});
test('bulk archive is a readable standard ZIP containing original bytes and safe JPEG names',async()=>{
 const {execFileSync}=await import('node:child_process');const h=harness(async()=>preparedPhoto(),{Blob,TextEncoder});const bytes=Uint8Array.from([255,216,255,1,2,3]);const blob=h.api.photoArchive([{name:'sofia-test.jpg',bytes},{name:'sofia-second.jpg',bytes}]);const zip=Buffer.from(await blob.arrayBuffer());const output=execFileSync('python3',['-c','import sys,zipfile,io,json; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); print(json.dumps({"names":z.namelist(),"first":list(z.read("sofia-test.jpg")),"valid":z.testzip() is None}))'],{input:zip,encoding:'utf8'});const result=JSON.parse(output);assert.deepEqual(result.names,['sofia-test.jpg','sofia-second.jpg']);assert.deepEqual(result.first,[...bytes]);assert.equal(result.valid,true);
});

test('bulk selection prepares files before native sharing and filtering clears stale selection',async()=>{
 const shares=[],requests=[];const jpeg=new Blob([Uint8Array.from([255,216,255,1])],{type:'image/jpeg'});
 const h=harness(async url=>{requests.push(url);return {ok:true,blob:async()=>jpeg};},{Blob,File,TextEncoder,navigator:{canShare:()=>true,share:async data=>shares.push(data.files)}});
 const at=new Date().toISOString();h.api.restore([{...image(id),createdAt:at,kind:'selfie'},{...image(id2),createdAt:at,kind:'selfie'}]);h.api.openGallery();let gallery=h.document.getElementById('sofia-gallery');gallery.all().find(n=>n.tag==='button'&&n.textContent==='Mehrere auswählen').onclick();
 const checks=gallery.all().filter(n=>n.tag==='input'&&n.type==='checkbox');checks[0].checked=true;checks[0].onchange();await new Promise(r=>setImmediate(r));checks[1].checked=true;checks[1].onchange();await new Promise(r=>setImmediate(r));
 const download=gallery.all().find(n=>n.tag==='button'&&n.textContent==='Auswahl herunterladen / teilen');assert.equal(download.disabled,false);await download.onclick();assert.equal(shares[0].length,2);assert.ok(shares[0].every(f=>f.name.endsWith('.jpg')));assert.ok(requests.every(url=>url.startsWith('/api/chat?image=')));
 const filter=gallery.all().find(n=>n['aria-label']==='Galerie nach Bildart filtern');filter.value='environment';filter.onchange();assert.equal(download.disabled,true);
});

test('server availability time protects fresh chat photos from a wrong device clock',()=>{
 class SkewedDate extends Date {static now(){return Date.now()+40*86400000;}}
 const h=harness(undefined,{Date:SkewedDate});const now=new Date().toISOString();h.api.restore([{...image(id),createdAt:now,sentAt:now,availabilityAt:now,archived:false,status:'done'}]);assert.equal(h.document.getElementById('portrait-'+id).tag,'figure');h.api.openGallery();assert.equal(h.document.getElementById('sofia-gallery').all().filter(n=>n.dataset.galleryPhotoId).length,1);
});
test('gallery fetches fresh server photos even when the chat did not load them',async()=>{
 const now=new Date().toISOString();const h=harness(async()=>preparedPhoto(),{galleryImages:[{...image(id),createdAt:now,sentAt:now,availabilityAt:now,status:'done'}]});h.api.openGallery(id);await new Promise(r=>setImmediate(r));assert.equal(h.document.getElementById('sofia-gallery').all().filter(n=>n.dataset.galleryPhotoId).length,1);assert.ok(h.document.getElementById('sofia-photo-'+id));
});
test('gallery uses delivery date for a newly sent variant of an older photograph',()=>{
 const now=new Date().toISOString();const h=harness();h.api.restore([{...image(id),createdAt:now,sentAt:now,capturedAt:'2026-01-01T23:00:00Z',location:'Bett'}]);h.api.openGallery();const gallery=h.document.getElementById('sofia-gallery');assert.equal(gallery.all().filter(n=>n.tag==='h3').length,1);assert.doesNotMatch(gallery.all().find(n=>n.tag==='h3').textContent,/2026-01-02|Bett/);assert.ok(gallery.all().some(n=>n.tag==='time'&&/\d{2}:\d{2}/.test(n.textContent)));
});

test('light and wider framing controls remain bound to the selected photo',()=>{
 const h=harness(async()=>preparedPhoto()),sent=[];h.window.SofiaPhotoAction=text=>{sent.push({text,reference:h.api.referenceId});return true;};h.api.restore([{...image(id),createdAt:new Date().toISOString()}]);
 for(const label of ['Anderes Licht','Weiterer Ausschnitt']){h.api.openGallery(id);const view=h.document.getElementById('sofia-photo-'+id);view.all().find(n=>n.tag==='button'&&n.textContent===label).onclick();assert.equal(h.document.getElementById('sofia-gallery'),null);}
 assert.equal(sent[0].reference,id);assert.match(sent[0].text,/nur.*Beleuchtung/);assert.equal(sent[1].reference,id);assert.match(sent[1].text,/Ausschnitt.*mehr Umgebung/);
});
test('custom visual change requires input and preserves source selection',()=>{
 const h=harness(async()=>preparedPhoto()),sent=[];h.window.SofiaPhotoAction=text=>{sent.push({text,reference:h.api.referenceId});return true;};h.api.restore([{...image(id),createdAt:new Date().toISOString()}]);h.api.openGallery(id);const view=h.document.getElementById('sofia-photo-'+id),input=view.all().find(n=>n['aria-label']==='Änderungswunsch zum Foto'),send=view.all().find(n=>n.tag==='button'&&n.textContent==='Foto anpassen');input.value='';send.onclick();assert.equal(sent.length,0);input.value='etwas seitlicher';send.onclick();assert.equal(sent[0].reference,id);assert.match(sent[0].text,/seitlicher.*nicht genannten Merkmale beibehalten/);
});
test('a retained source offers comparison, while an expired source does not',()=>{
 const h=harness(async()=>preparedPhoto());h.api.restore([{...image(id),createdAt:new Date().toISOString()},{...image(id2),sourceId:id,createdAt:new Date().toISOString()}]);h.api.openGallery(id2);const view=h.document.getElementById('sofia-photo-'+id2),compare=view.all().find(n=>n.tag==='button'&&n.textContent==='Mit Original vergleichen');assert.equal(compare.hidden,false);compare.onclick();assert.ok(h.body.all().some(n=>n.className==='photo-comparison'));const pair=h.body.all().find(n=>n.className==='photo-comparison-slider');assert.deepEqual(pair.all().filter(n=>n.tag==='img').map(n=>n.src),['/api/chat?image='+id,'/api/chat?image='+id2]);
});

test('photo actions pass a fixed source ID and gallery can return to its original message',()=>{
 const h=harness(async()=>preparedPhoto()),sent=[];const user=h.message('Schick ein Selfie','user');const reply=h.message('Hier ist es.','sofia',id);
 h.api.restore([{...image(id),createdAt:new Date().toISOString(),requestMessage:user.textContent}]);h.api.openGallery(id);
 const view=h.document.getElementById('sofia-photo-'+id);const back=view.all().find(n=>n.textContent==='Zur Nachricht im Chat');assert.equal(back.disabled,false);back.onclick();
 assert.equal(h.document.getElementById('sofia-gallery'),null);assert.equal(reply.scrolled.block,'center');assert.equal(reply.focused,true);
 h.api.openGallery(id);h.window.SofiaPhotoAction=(text,source)=>{sent.push(source);return true;};h.document.getElementById('sofia-photo-'+id).all().find(n=>n.textContent==='Anderes Licht').onclick();assert.deepEqual(sent,[id]);
});
test('missing original chat message disables the return link without inventing an anchor',()=>{
 const h=harness(async()=>preparedPhoto());h.api.restore([{...image(id),createdAt:new Date().toISOString()}]);h.api.openGallery(id);
 assert.equal(h.document.getElementById('sofia-photo-'+id).all().find(n=>n.textContent==='Zur Nachricht im Chat').disabled,true);
});
test('gallery chronology can reverse while keeping date grouping and no situation groups',()=>{
 const h=harness(async()=>preparedPhoto());const at=new Date();h.api.restore([{...image(id),createdAt:new Date(+at-60000).toISOString()},{...image(id2),createdAt:at.toISOString()}]);h.api.openGallery();
 const g=h.document.getElementById('sofia-gallery'),sort=g.all().find(n=>n['aria-label']==='Galerie sortieren');sort.value='oldest';sort.onchange();
 assert.deepEqual(g.all().filter(n=>n.dataset.galleryPhotoId).map(n=>n.dataset.galleryPhotoId),[id,id2]);
});
test('failure notices display supplied safe server feedback as text rather than HTML',()=>{
 const h=harness();h.api.restore([{...image(id),status:'failed',message:'Mit meinen Fotos hakt es gerade.'}]);assert.match(h.document.getElementById('portrait-'+id).textContent,/hakt es gerade/);
});

test('wrong source receipt stops a selected-photo job before any paid generation request',async()=>{
 const calls=[],h=harness(async(url,options)=>{calls.push({url,options});return{ok:true,json:async()=>({images:[]})};});
 await h.api.generate({id:id2,sourceId:id2,expectedSourceId:id,requestMessage:'Andere Perspektive'});
 assert.equal(calls.filter(x=>x.options.method==='POST').length,0);const notice=h.document.getElementById('portrait-'+id2);assert.match(notice.textContent,/Bildreferenz passt nicht/);assert.equal(notice.all().find(n=>n.textContent==='Erneut versuchen').disabled,true);
});
test('a failed photo variant retries with its selected source id',()=>{
 const h=harness(),sent=[];h.window.SofiaPhotoAction=(message,reference)=>{sent.push({message,reference});return true;};h.api.restore([{...image(id2),status:'failed',sourceId:id,requestMessage:'Andere Perspektive'}]);h.document.getElementById('portrait-'+id2).all().find(n=>n.textContent==='Erneut versuchen').onclick();assert.equal(sent[0].reference,id);
});
test('old photograph with identical request text never attaches to a new photo turn',()=>{
 const h=harness();const oldAt=new Date(Date.now()-24*3600000).toISOString();
 const user=h.message('Schick mir ein Selfie.','user');user.dataset.createdAt=new Date().toISOString();
 const ack=h.message('Neues Foto angefragt.','sofia',id2);ack.dataset.createdAt=new Date().toISOString();
 const currentSlot=h.document.getElementById('portrait-slot-'+id2);
 h.api.restore([{...image(id),status:'done',requestMessage:user.textContent,requestedAt:oldAt,sentAt:oldAt,createdAt:oldAt}]);
 assert.equal(ack.hidden,false);assert.equal(currentSlot.parentNode,h.messages);
 const older=h.document.getElementById('portrait-older');assert.ok(older);assert.equal(h.document.getElementById('portrait-slot-'+id).parentNode,older);
 h.api.openGallery(id);const view=h.document.getElementById('sofia-photo-'+id);
 assert.equal(view.all().find(n=>n.textContent==='Zur Nachricht im Chat').disabled,true);
});
test('a new successful picture stays inline while an older identical request remains archived',()=>{
 const h=harness();const at=new Date().toISOString(),oldAt=new Date(Date.now()-13*3600000).toISOString();
 h.message('Schick mir ein Selfie.','user');const ack=h.message('Gib mir einen kleinen Moment.','sofia',id2);ack.dataset.createdAt=at;
 h.api.restore([{...image(id),status:'done',requestMessage:'Schick mir ein Selfie.',requestedAt:oldAt,sentAt:oldAt},{...image(id2),status:'done',sentAt:at,requestedAt:at}]);
 assert.equal(h.document.getElementById('portrait-'+id2).tag,'figure');assert.equal(h.document.getElementById('portrait-'+id).parentNode.parentNode.id,'portrait-older');
});

test('legacy photos without timestamp evidence cannot hide a fresh acknowledgment',()=>{
 const h=harness();const ack=h.message('Gib mir einen kleinen Moment.');h.api.restore([{id,caption:'Altes Selfie'}]);assert.equal(ack.hidden,false);assert.equal(h.document.getElementById('portrait-slot-'+id).parentNode.id,'portrait-older');
});

test('a chained variant defaults to itself and lets the user explicitly choose its parent or root',()=>{
 const third='33333333-3333-4333-8333-333333333333',now=new Date().toISOString(),h=harness(async()=>preparedPhoto()),sent=[];
 h.window.SofiaPhotoAction=(text,reference)=>{sent.push(reference);return false;};
 h.api.restore([{...image(id),createdAt:now},{...image(id2),sourceId:id,seriesId:id,createdAt:now},{...image(third),sourceId:id2,seriesId:id,createdAt:now}]);h.api.openGallery(third);
 const view=h.document.getElementById('sofia-photo-'+third),select=view.all().find(n=>n['aria-label']==='Ausgangsfoto auswählen'),preview=view.all().find(n=>n.className==='photo-source-preview'),light=view.all().find(n=>n.textContent==='Anderes Licht');
 assert.deepEqual(select.children.map(n=>n.value),[third,id2,id]);light.onclick();assert.equal(sent.at(-1),third);
 select.value=id2;select.onchange();assert.equal(preview.src,'/api/chat?image='+id2);light.onclick();assert.equal(sent.at(-1),id2);
 select.value=id;select.onchange();light.onclick();assert.equal(sent.at(-1),id);
});
test('comparison slider exposes both boundaries and is keyboard accessible',()=>{
 const h=harness(async()=>preparedPhoto()),now=new Date().toISOString();h.api.restore([{...image(id),createdAt:now},{...image(id2),sourceId:id,createdAt:now}]);h.api.openGallery(id2);h.document.getElementById('sofia-photo-'+id2).all().find(n=>n.textContent==='Mit Original vergleichen').onclick();
 const dialog=h.body.all().find(n=>n.className==='photo-comparison'),range=dialog.all().find(n=>n.type==='range'),after=dialog.all().filter(n=>n.tag==='img')[1];assert.equal(range.focused,true);range.value='0';range.oninput();assert.equal(after.style.clipPath,'inset(0 0 0 0%)');range.value='100';range.oninput();assert.equal(after.style.clipPath,'inset(0 0 0 100%)');assert.equal(range['aria-valuetext'],'100 Prozent Ausgangsfoto');
});
test('gallery keeps date filter and scroll when closed and reopened',()=>{
 const h=harness(async()=>preparedPhoto());h.api.openGallery();const first=h.document.getElementById('sofia-gallery'),date=first.all().find(n=>n.type==='date');date.value='2026-10-07';date.onchange();first.scrollTop=315;first.close();h.api.openGallery();const second=h.document.getElementById('sofia-gallery');assert.equal(second.all().find(n=>n.type==='date').value,'2026-10-07');assert.equal(second.scrollTop,315);
});
