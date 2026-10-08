import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../sofia-workspace.js',import.meta.url),'utf8');
function harness(saved={}){
 class Node{
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.style={};this.className='';this.hidden=false;this.value='';this.text='';this.listeners={};this.scrollTop=100;this.scrollHeight=200;this.clientHeight=100;}
  get textContent(){return this.text+this.children.map(n=>n.textContent).join('');}set textContent(t){this.text=t;this.children=[];}
  get classList(){return{contains:c=>this.className.split(' ').includes(c),add:c=>this.className+=' '+c,remove:c=>this.className=this.className.split(' ').filter(x=>x!==c).join(' ')};}
  append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
  insertBefore(n,b){n.parent=this;this.children.splice(this.children.indexOf(b),0,n);}
  replaceChildren(){this.children=[];}
  all(){return this.children.flatMap(n=>[n,...n.all()]);}
  querySelectorAll(s){return this.all().filter(n=>s==='.msg[data-created-at]'?n.classList.contains('msg')&&n.dataset.createdAt: s.startsWith('.')&&n.classList.contains(s.slice(1)));}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
  setAttribute(k,v){this[k]=v;}
  addEventListener(t,f){this.listeners[t]=f;}
  focus(){this.focused=true;}showModal(){this.open=true;}close(){this.open=false;this.listeners.close?.();}remove(){if(this.parent)this.parent.children.splice(this.parent.children.indexOf(this),1);}scrollIntoView(o){this.scrolled=o;}
 }
 const db=new Map(Object.entries(saved).map(([k,v])=>[k,JSON.stringify(v)])),localStorage={getItem:k=>db.get(k),setItem:(k,v)=>db.set(k,v)};
 const body=new Node('body'),html=new Node('html');for(const id of ['messages','input','mode','connectionStatus','chatLatest','workspaceAction']){const n=new Node(id==='input'?'textarea':'div');n.id=id;body.append(n);}
 const events={},document={body,documentElement:html,visibilityState:'visible',getElementById:id=>body.all().find(n=>n.id===id)||null,querySelector:s=>s.includes('dialog[open]')?body.all().find(n=>n.tagName==='DIALOG'&&n.open):null,createElement:t=>new Node(t),addEventListener:(t,f)=>events[t]=f};
 const window={addEventListener:(t,f)=>events[t]=f,SofiaUI:{resizeComposer(){},enhanceDialog(){}},matchMedia:()=>({matches:false})},navigator={onLine:true,clipboard:{writeText:async()=>{}}};
 vm.runInNewContext(source,{window,document,navigator,localStorage,Map,Set,Intl,Date,setTimeout:()=>1,clearTimeout(){},requestAnimationFrame:f=>f()});
 const message=turn=>{const n=new Node('div');n.className='msg '+(turn.role==='user'?'user':'sofia');n.dataset.messageText=turn.content;n.dataset.createdAt=turn.createdAt;n.textContent=turn.content;document.getElementById('messages').append(n);return n;};
 return{api:window.SofiaWorkspace,window,document,events,db,navigator,input:document.getElementById('input'),root:document.getElementById('messages'),message};
}
test('draft survives reload, remains pending until receipt and returns after failed submission',()=>{
 const h=harness({'sofia_draft_v448':{text:'Entwurf\nzweite Zeile'}});assert.equal(h.input.value,'Entwurf\nzweite Zeile');h.api.beginSubmission(h.input.value);h.input.value='';h.events.pagehide();assert.equal(JSON.parse(h.db.get('sofia_draft_v448')).text,'Entwurf\nzweite Zeile');h.api.failSubmission('Entwurf\nzweite Zeile');assert.equal(h.input.value,'Entwurf\nzweite Zeile');h.api.beginSubmission(h.input.value);h.input.value='';h.api.confirmSubmission('Entwurf\nzweite Zeile');assert.equal(JSON.parse(h.db.get('sofia_draft_v448')).text,'');
});
test('a photo reply never clears a separate text draft',()=>{const h=harness({'sofia_draft_v448':{text:'mein Entwurf'}});h.api.confirmSubmission('Dieses Foto anpassen');assert.equal(JSON.parse(h.db.get('sofia_draft_v448')).text,'mein Entwurf');});
test('stored preferences are validated and local surface motion stays separate from avatar settings',()=>{const h=harness({'sofia_ui_v448':{font:'large',density:'compact',motion:'off'}});assert.equal(h.document.documentElement.dataset.chatFont,'large');assert.equal(h.api.motion(),'auto');assert.equal(h.document.documentElement.dataset.presenceMotion,undefined);assert.deepEqual(JSON.parse(JSON.stringify(h.api.normalize({font:'huge',motion:'broken'}))),{font:'normal',density:'comfortable',motion:'auto'});});
test('search returns only matching text and jumps without submitting any message',()=>{
 const h=harness();const t={role:'assistant',content:'Ein Kaffee an der Alster',createdAt:'2026-10-08T10:00:00Z'},n=h.message(t);h.message({role:'user',content:'Ganz anderer Text',createdAt:'2026-10-08T10:01:00Z'});h.api.search();const d=h.document.body.all().find(n=>n.tagName==='DIALOG'),field=d.all().find(n=>n.type==='search');field.value='KAFFEE';field.oninput();assert.ok(d.textContent.includes('1 Treffer'));d.all().find(n=>n.textContent==='Im Chat anzeigen').onclick();assert.equal(n.scrolled.block,'center');
});
test('pins retain exact text and timestamp after local reload without a memory API call',()=>{
 const h=harness(),turn={role:'assistant',content:'wichtige Nachricht',createdAt:'2026-10-08T10:00:00Z'},n=h.message(turn);h.api.refresh();n.all().find(x=>x.className==='message-menu').onclick();let d=h.document.body.all().find(n=>n.tagName==='DIALOG');d.all().find(n=>n.textContent==='Nachricht anheften').onclick();const persisted=JSON.parse(h.db.get('sofia_pins_v448'));assert.equal(persisted[0].content,turn.content);assert.equal(persisted[0].createdAt,turn.createdAt);const next=harness({'sofia_pins_v448':persisted});next.api.pinned();assert.match(next.document.body.textContent,/wichtige Nachricht/);
});
test('unread ledger counts once across history refresh and clears only at visible latest',()=>{
 const h=harness({'sofia_read_at_v448':0}),turn={role:'assistant',content:'neu',createdAt:'2026-10-08T10:00:00Z'};h.root.scrollTop=0;h.message(turn);h.api.reconcile([turn],[]);h.api.refresh();assert.match(h.document.getElementById('chatLatest').textContent,/1 neue Nachricht/);h.api.reconcile([turn],[turn]);h.api.refresh();assert.match(h.document.getElementById('chatLatest').textContent,/1 neue Nachricht/);h.api.readVisible();assert.match(h.document.getElementById('chatLatest').textContent,/1 neue Nachricht/);h.root.scrollTop=100;h.document.visibilityState='hidden';h.api.readVisible();assert.match(h.document.getElementById('chatLatest').textContent,/1 neue Nachricht/);h.document.visibilityState='visible';h.api.readVisible();assert.match(h.document.getElementById('chatLatest').textContent,/Neueste Nachricht/);
});
test('unknown transport and task results never offer a one-click resend',()=>{
 const h=harness();assert.equal(h.api.safeRetry('Erstelle eine Aufgabe',false,false),false);assert.equal(h.api.safeRetry('Wie geht es dir?',true,false),false);const node=h.message({role:'assistant',content:'Fehler',createdAt:'2026-10-08T10:00:00Z'});h.api.failed(node,'Erstelle eine Aufgabe',{uncertain:true,knownRejected:true});assert.equal(node.all().at(-1).textContent,'Entwurf wiederherstellen');node.all().at(-1).onclick();assert.match(h.document.getElementById('connectionStatus').textContent,/Aufgabenstand/);assert.equal(h.input.value,'Erstelle eine Aufgabe');
});
test('explicit rejection of a plain text request allows retry only when sender accepts',()=>{
 const h=harness(),node=h.message({role:'assistant',content:'kurz warten',createdAt:'2026-10-08T10:00:00Z'});let sent=0;h.window.SofiaChatSend=()=>{sent++;return false;};h.api.failed(node,'Wie geht es dir?',{knownRejected:true});const retry=node.all().at(-1);assert.equal(retry.textContent,'Nachricht erneut senden');retry.onclick();assert.notEqual(retry.disabled,true);h.window.SofiaChatSend=()=>{sent++;return true;};retry.onclick();assert.equal(retry.disabled,true);assert.equal(sent,2);
});
