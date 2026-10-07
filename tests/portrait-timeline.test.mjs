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
  get classList(){return {contains:c=>this.className.split(' ').includes(c)};}
  get firstChild(){return this.children[0]||null;}
  get nextSibling(){const a=this.parentNode?.children;return a?.[a.indexOf(this)+1]||null;}
  replaceChildren(...nodes){for(const child of this.children)child.parentNode=null;this.children=[];this.ownText='';this.append(...nodes);}
  append(...nodes){for(const n of nodes)this.insertBefore(n,null);}
  insertBefore(n,b){if(n===b)return n;if(n.parentNode)n.parentNode.children.splice(n.parentNode.children.indexOf(n),1);n.parentNode=this;const i=b?this.children.indexOf(b):this.children.length;if(i<0)throw Error('Missing insertion point');this.children.splice(i,0,n);return n;}
  setAttribute(k,v){this[k]=v;}addEventListener(name,fn){this.events||={};this.events[name]=fn;}focus(){}showModal(){}close(){this.events?.close?.();}click(){this.clicked=true;}
  remove(){this.parentNode.children.splice(this.parentNode.children.indexOf(this),1);}
  all(){return this.children.flatMap(n=>[n,...n.all()]);}
  querySelectorAll(selector){return this.all().filter(n=>selector.startsWith('[data-portrait-request-id=')?n.dataset.portraitRequestId===selector.split('"')[1]:selector.split('.').filter(Boolean).every(c=>n.classList.contains(c)));}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
 }
 const body=new Node('body'),messages=new Node('div');messages.id='messages';body.append(messages);
 const document={body,createElement:tag=>new Node(tag),getElementById:target=>[body,...body.all()].find(n=>n.id===target)||null};
 const window={};vm.runInNewContext(source,{document,window,fetch:fetchImpl,Map,Promise,...extras});
 const message=(text,who='sofia',anchorId)=>{const n=new Node('div');n.className='msg '+who;n.textContent=text;if(anchorId)n.dataset.portraitRequestId=anchorId;messages.append(n);if(anchorId)window.SofiaImages.anchor(anchorId,n);return n;};
 return {body,messages,document,api:window.SofiaImages,message};
}
const image=(id)=>({id,anchorId:id,caption:'Sofia',url:'/api/chat?image='+id});
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
 const h=harness();const ack=h.message('Gib mir einen kleinen Moment.');const later=h.message('Danach','user');
 h.api.restore([{id,caption:'Altes Selfie'}]);assert.deepEqual(h.messages.children,[ack,h.document.getElementById('portrait-slot-'+id),later]);
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
test('failed photo retains acknowledgment and friendly explanation',()=>{
 const h=harness();const ack=h.message('Gib mir einen kleinen Moment.','sofia',id);
 h.api.restore([{...image(id),status:'failed'}]);assert.equal(ack.hidden,false);
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
 const dialog=openPhoto(h),save=dialog.children[2];assert.equal(save.disabled,true);await tick();assert.equal(save.disabled,false);assert.equal(save.textContent,'Bild speichern / teilen');await save.onclick();assert.equal(shares,1);assert.ok(h.body.children.includes(dialog));assert.equal(dialog.children[3].textContent,'');dialog.children[1].onclick();assert.equal(h.body.children.includes(dialog),false);
});
test('desktop downloads blob with filename and retains close button, releasing URL on close',async()=>{
 let urls=0,revoked=0;const h=harness(async()=>preparedPhoto(),{navigator:{userAgent:'Macintosh',maxTouchPoints:0},URL:{createObjectURL:()=>{urls++;return 'blob:photo';},revokeObjectURL:()=>revoked++}});
 const dialog=openPhoto(h);await tick();await dialog.children[2].onclick();assert.equal(urls,1);assert.ok(h.body.children.includes(dialog));dialog.children[1].onclick();assert.equal(revoked,1);
});
test('unsupported mobile sharing and preparation errors keep photo view recoverable',async()=>{
 const h=harness(async()=>preparedPhoto(),{navigator:{userAgent:'iPad'}});const dialog=openPhoto(h);await tick();await dialog.children[2].onclick();assert.match(dialog.children[3].textContent,/Halte das Bild gedrückt/);assert.equal(dialog.children[2].disabled,false);
 const failed=harness(async()=>({ok:false}),{navigator:{userAgent:'iPhone'}});const view=openPhoto(failed);await tick();assert.match(view.children[3].textContent,/noch einmal/);assert.equal(view.children[2].disabled,false);view.children[1].onclick();assert.equal(failed.body.children.includes(view),false);
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
