import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../sofia-images.js',import.meta.url),'utf8');
const id='11111111-1111-4111-8111-111111111111';
const id2='22222222-2222-4222-8222-222222222222';
function harness(fetchImpl) {
 class Node {
  constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.style={};this.hidden=false;this.className='';this.ownText='';}
  get textContent(){return this.ownText+this.children.map(x=>x.textContent).join('');}set textContent(v){this.ownText=v;this.children=[];}
  get classList(){return {contains:c=>this.className.split(' ').includes(c)};}
  get firstChild(){return this.children[0]||null;}
  get nextSibling(){const a=this.parentNode?.children;return a?.[a.indexOf(this)+1]||null;}
  append(...nodes){for(const n of nodes)this.insertBefore(n,null);}
  insertBefore(n,b){if(n===b)return n;if(n.parentNode)n.parentNode.children.splice(n.parentNode.children.indexOf(n),1);n.parentNode=this;const i=b?this.children.indexOf(b):this.children.length;if(i<0)throw Error('Missing insertion point');this.children.splice(i,0,n);return n;}
  setAttribute(k,v){this[k]=v;}addEventListener(){}focus(){}showModal(){}close(){}
  remove(){this.parentNode.children.splice(this.parentNode.children.indexOf(this),1);}
  all(){return this.children.flatMap(n=>[n,...n.all()]);}
  querySelectorAll(selector){return this.all().filter(n=>selector.startsWith('[data-portrait-request-id=')?n.dataset.portraitRequestId===selector.split('"')[1]:selector.split('.').filter(Boolean).every(c=>n.classList.contains(c)));}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
 }
 const body=new Node('body'),messages=new Node('div');messages.id='messages';body.append(messages);
 const document={body,createElement:tag=>new Node(tag),getElementById:target=>[body,...body.all()].find(n=>n.id===target)||null};
 const window={};vm.runInNewContext(source,{document,window,fetch:fetchImpl,Map,Promise});
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
