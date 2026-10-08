import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../sofia-social.js',import.meta.url),'utf8');
function harness(){
 const nodes=[],events={},calls=[],photos=[];let messagesVisible=true;
 class Node{constructor(tag){this.tag=tag;this.children=[];this.style={};this.events={};this.attrs={};nodes.push(this);}append(...n){this.children.push(...n);}setAttribute(k,v){this.attrs[k]=v;}addEventListener(k,v){this.events[k]=v;}replaceChildren(){this.children=[];}showModal(){this.open=true;}close(){this.open=false;this.events.close?.();}remove(){this.removed=true;}focus(){}querySelector(){return null;}}
 const messages=new Node('messages');Object.assign(messages,{scrollHeight:500,scrollTop:0,clientHeight:500,getClientRects:()=>messagesVisible?[{}]:[],querySelectorAll:()=>[{dataset:{contactId:'11111111-1111-4111-8111-111111111111'}}]});
 const action=new Node('socialAction'),body=new Node('body');
 const state={preferences:{level:'natural',photos:true,quietStart:'23:00',quietEnd:'08:00',pausedUntil:null},unread:1,sequence:1,read:0,contacts:[{id:'11111111-1111-4111-8111-111111111111',sequence:1}],devices:[],backgroundConfigured:true};
 const document={visibilityState:'visible',body,getElementById:id=>id==='messages'?messages:id==='socialAction'?action:null,querySelector:()=>nodes.find(n=>n.tag==='dialog'&&n.open)||null,createElement:t=>new Node(t),createTextNode:t=>({textContent:t}),addEventListener(){}};
 const window={SofiaImages:{openGallery:id=>photos.push(id)},addEventListener:(t,f)=>events[t]=f,dispatchEvent:e=>events[e.type]?.(e)};
 vm.runInNewContext(source,{document,window,navigator:{userAgent:'Mac',setAppBadge:async()=>{},clearAppBadge:async()=>{}},Date,Notification:{permission:'denied'},setInterval(){},setTimeout,clearTimeout,Event:class{constructor(type){this.type=type;}},CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},fetch:async(_url,o)=>{
  const data=o.body?JSON.parse(o.body):null;calls.push(data);
  if(data?.operation==='preferences')state.preferences={...state.preferences,...data.preferences};
  if(data?.operation==='pause')state.preferences.pausedUntil=data.duration==='resume'?null:new Date(Date.now()+3600000).toISOString();
  if(data?.operation==='read'){state.read=Math.max(state.read,data.sequence);state.unread=state.sequence-state.read;}
  return {ok:true,json:async()=>structuredClone(state)};
 }});
 return {window,api:window.SofiaSocial,nodes,events,calls,photos,state,messages,document,open:()=>action.events.click(),visible:v=>messagesVisible=v,find:text=>nodes.find(n=>n.textContent===text),label:text=>nodes.find(n=>n.attrs['aria-label']===text)};
}
test('unread preview opens its exact message without acknowledging the settings view',async()=>{
 const h=harness();h.state.contacts[0].text='Ein Gruß aus dem Café.';h.state.contacts[0].createdAt='2026-10-08T12:15:00Z';h.state.contactStatus={text:'Sofia lässt dir Zeit zum Antworten.'};let opened;
 h.events['sofia-contact-open']=e=>opened=e.detail.contactId;
 await h.open();assert.ok(h.find('Ein Gruß aus dem Café.'));assert.ok(h.find('Sofia lässt dir Zeit zum Antworten.'));assert.ok(h.nodes.some(n=>n.tag==='time'&&/08\.10\.2026.*14:15/.test(n.textContent)));
 assert.equal(h.calls.filter(c=>c?.operation==='read').length,0);h.find('Im Chat öffnen').onclick();assert.equal(opened,h.state.contacts[0].id);assert.equal(h.state.unread,1);
});
test('photo shortcut targets the associated gallery photo and leaves read state intact',async()=>{
 const h=harness();h.state.contacts[0].imageId='22222222-2222-4222-8222-222222222222';await h.open();h.find('Zugehöriges Foto öffnen').onclick();assert.deepEqual(h.photos,[h.state.contacts[0].imageId]);assert.equal(h.state.unread,1);
});
test('settings changes show unsaved feedback and empty inbox has a clear state',async()=>{
 const h=harness();h.state.contacts=[];h.state.unread=0;await h.open();assert.ok(h.find('Du hast alle neuen Nachrichten gelesen.'));h.label('Ruhezeit beginnt').events.change();assert.ok(h.find('Änderungen noch nicht gespeichert.'));await h.find('Speichern').onclick();assert.ok(h.find('Gespeichert.'));
});
test('quiet settings and temporary pause controls load, save and give explicit feedback',async()=>{
 const h=harness();await h.open();assert.equal(h.label('Ruhezeit beginnt').value,'23:00');assert.equal(h.label('Ruhezeit endet').value,'08:00');
 h.label('Ruhezeit beginnt').value='22:30';h.label('Ruhezeit endet').value='07:15';await h.find('Speichern').onclick();
 assert.equal(h.state.preferences.quietStart,'22:30');assert.equal(h.state.preferences.quietEnd,'07:15');assert.ok(h.find('Gespeichert.'));
 await h.find('Eine Stunde pausieren').onclick();assert.ok(h.state.preferences.pausedUntil);assert.ok(h.find('Pause gespeichert.'));
 await h.find('Pause beenden').onclick();assert.equal(h.state.preferences.pausedUntil,null);assert.equal(h.state.preferences.level,'natural');assert.ok(h.find('Pause beendet. Ruhezeiten gelten weiterhin.'));
});
test('a settings dialog and a hidden message viewport do not acknowledge unread contacts',async()=>{
 const h=harness();await h.open();h.messages.events.scroll();await new Promise(setImmediate);assert.equal(h.calls.filter(c=>c?.operation==='read').length,0);
 h.find('Schließen').onclick();h.visible(false);h.messages.events.scroll();await new Promise(setImmediate);assert.equal(h.calls.filter(c=>c?.operation==='read').length,0);
 h.visible(true);h.messages.events.scroll();await new Promise(setImmediate);assert.equal(h.calls.filter(c=>c?.operation==='read').length,1);assert.equal(h.state.unread,0);
});
test('a notification acknowledgement arriving before settings state loads fetches the real contact first',async()=>{
 const h=harness();h.events['sofia-contact-visible']({detail:{contactId:h.state.contacts[0].id}});await new Promise(setImmediate);
 assert.equal(h.calls[0],null);assert.equal(h.calls[1].operation,'read');assert.equal(h.calls[1].sequence,1);
});

test('late state reads cannot roll back read cursor, badge count or newer settings',()=>{
 const block=source.slice(source.indexOf(' let requestSequence='),source.indexOf(' const deviceLabel='));
 const ctx=vm.createContext({state:{sequence:3,read:1,preferences:{level:'natural'}},Number,Math});vm.runInContext(block,ctx);
 ctx.state=ctx.acceptState({sequence:3,read:3,preferences:{level:'quiet'},requestSequence:5});
 ctx.state=ctx.acceptState({sequence:3,read:1,preferences:{level:'natural'},requestSequence:2});
 assert.equal(ctx.state.read,3);assert.equal(ctx.state.unread,0);assert.equal(ctx.state.preferences.level,'quiet');
 ctx.state=ctx.acceptState({sequence:4,read:3,preferences:{level:'quiet'},requestSequence:6});
 ctx.state=ctx.acceptState({sequence:3,read:3,preferences:{level:'natural'},requestSequence:7});assert.equal(ctx.state.sequence,4);assert.equal(ctx.state.unread,1);
});

test('Today and app badge share contact counts and exclude duplicated contact turns',async()=>{const h=harness();h.window.SofiaWorkspace={unreadMessages:()=>[{content:'normal'},{content:'contact',contactId:'11111111-1111-4111-8111-111111111111'}]};h.messages.scrollTop=-200;await h.api.sync();assert.equal(h.api.unreadCount(),2);assert.equal(h.api.unreadMessages().length,1);h.messages.scrollTop=0;await h.api.sync();assert.equal(h.api.unreadCount(),1);assert.equal(h.api.unreadMessages().length,0);});
