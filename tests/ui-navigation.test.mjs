import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../sofia-ui.js',import.meta.url),'utf8');
function menu(h,label){const listeners={},d={tagName:'DIALOG',dataset:{},scrollTop:0,classList:{add(){}},setAttribute(){},addEventListener:(k,f)=>listeners[k]=f,close(){listeners.close?.();}};h.window.SofiaUI.enhanceDialog(d,label);return d;}
test('back restores the parent and ancestor at the top rather than retaining a lower scroll point',()=>{const h=harness();let settings=menu(h,'Einstellungen'),photos,contacts,settingsReturns=0,photoReturns=0;settings.scrollTop=80;h.window.SofiaUI.navigateFrom(settings,()=>photos=menu(h,'Fotos'),()=>{settingsReturns++;return settings=menu(h,'Einstellungen');});h.window.SofiaUI.navigateFrom(photos,()=>contacts=menu(h,'Eigenständige Fotos'),()=>{photoReturns++;return photos=menu(h,'Fotos');});assert.equal(settingsReturns,0);contacts.close();assert.equal(photoReturns,1);assert.equal(settingsReturns,0);photos.close();assert.equal(settingsReturns,1);assert.equal(settings.scrollTop,0);});
test('close to chat dismisses a submenu without reopening its parent',async()=>{const h=harness();let returned=0,revealed=0,child;h.window.SofiaChatViewport.reveal=()=>revealed++;h.window.SofiaUI.navigateFrom(menu(h,'Einstellungen'),()=>child=menu(h,'Fotos'),()=>{returned++;return menu(h,'Einstellungen');});assert.equal(await h.window.SofiaUI.closeToChat(child),true);assert.equal(returned,0);assert.equal(revealed,1);});
test('close to chat refuses to discard unacknowledged settings and retains the back route',async()=>{const h=harness(),child=menu(h,'Fotos');h.window.SofiaCharacterSettings={flush:async()=>false};assert.equal(await h.window.SofiaUI.closeToChat(child),false);assert.notEqual(child.dataset.menuForward,'true');});
test('a failed settings flush keeps the submenu open and does not navigate',async()=>{const h=harness(),d=menu(h,'Fotos');let opened=0;const result=await h.window.SofiaUI.navigateFrom(d,()=>opened++,()=>menu(h,'Einstellungen'),async()=>false);assert.equal(result,false);assert.equal(opened,0);assert.equal(d.dataset.menuForward,undefined);});
test('an explicit jump to chat does not reopen a menu behind it',()=>{const h=harness(),settings=menu(h,'Einstellungen');let child,returned=0;h.window.SofiaUI.navigateFrom(settings,()=>child=menu(h,'Letzter Versand'),()=>{returned++;return menu(h,'Einstellungen');});child.dataset.returnToLatest='true';child.close();assert.equal(returned,0);});
function harness({standalone}={}){
 const events={},variables={},input={tagName:'TEXTAREA',style:{},scrollHeight:210,addEventListener:(t,f)=>events[t]=f};
 const document={activeElement:input,documentElement:{dataset:{},style:{setProperty:(k,v)=>variables[k]=v}},getElementById:()=>input};
 const window={innerHeight:800,addEventListener(){},visualViewport:{height:470,offsetTop:0,addEventListener:(t,f)=>events['viewport-'+t]=f},SofiaChatViewport:{capture:()=>({reading:true}),restore:v=>events.restore=v}};
 window.navigator={standalone};vm.runInNewContext(source,{window,document,Intl,Date});return {window,document,input,events,variables};
}
test('iOS home-screen layout is enabled only by the actual standalone flag',()=>{assert.equal(harness({standalone:true}).document.documentElement.dataset.iosStandalone,'true');assert.equal(harness({standalone:false}).document.documentElement.dataset.iosStandalone,'false');assert.equal(harness().document.documentElement.dataset.iosStandalone,'false');});
test('composer grows to a bounded height and keyboard inset is removed on blur',()=>{
 const h=harness();assert.equal(h.input.style.height,'144px');assert.equal(h.variables['--sofia-keyboard-inset'],'330px');h.document.activeElement=null;h.events.blur();assert.equal(h.variables['--sofia-keyboard-inset'],'0px');h.input.scrollHeight=20;h.events.input();assert.equal(h.input.style.height,'46px');
});
test('native photo dialogs restore chat position and trigger focus without page scrolling',()=>{
 const h=harness();let focus;h.document.activeElement={isConnected:true,focus:options=>focus=options};const listeners={};const dialog={tagName:'DIALOG',classList:{add(){}},setAttribute(){},addEventListener:(t,f)=>listeners[t]=f};h.window.SofiaUI.enhanceDialog(dialog,'Foto');listeners.close();assert.deepEqual(h.events.restore,{reading:true});assert.equal(focus.preventScroll,true);
});
test('memory dialog traps keyboard focus and Escape closes it',()=>{
 const h=harness();let lastFocus=0,closed=0;const first={getClientRects:()=>[1],focus:()=>lastFocus=1},last={getClientRects:()=>[1],focus:()=>lastFocus=2};const dialog={tagName:'DIV',classList:{add(){}},setAttribute(){},querySelectorAll:()=>[first,last]};h.window.SofiaUI.enhanceDialog(dialog,'Erinnerungen',()=>closed++);h.document.activeElement=first;dialog.onkeydown({key:'Tab',shiftKey:true,preventDefault(){}});assert.equal(lastFocus,2);h.document.activeElement=last;dialog.onkeydown({key:'Tab',shiftKey:false,preventDefault(){}});assert.equal(lastFocus,1);dialog.onkeydown({key:'Escape',preventDefault(){}});assert.equal(closed,1);
});


test('composer shrinks with a narrow keyboard viewport and grows again after it closes',()=>{
 const h=harness();h.window.visualViewport.height=210;h.events['viewport-resize']();assert.equal(h.input.style.height,'52px');h.window.visualViewport.height=800;h.events['viewport-resize']();assert.equal(h.input.style.height,'144px');
});

test('closing a nested viewer preserves parent dialog position and avoids background focus',()=>{
 const h=harness();let focused=false;h.document.activeElement={isConnected:true,focus:()=>focused=true};h.document.querySelector=()=>({contains:()=>false});const listeners={};const d={tagName:'DIALOG',dataset:{},classList:{add(){}},setAttribute(){},addEventListener:(t,f)=>listeners[t]=f};h.window.SofiaUI.enhanceDialog(d,'Foto');listeners.close();assert.equal(focused,false);assert.equal(h.events.restore,undefined);
});
test('keyboard focus state follows composer focus and blur for responsive layout',()=>{const h=harness();assert.equal(h.document.documentElement.dataset.composerFocused,'true');h.document.activeElement=null;h.events.blur();assert.equal(h.document.documentElement.dataset.composerFocused,'false');});
test('closing a review returns focus to the topmost viewer rather than the background gallery',()=>{const h=harness();let focused=false;const trigger={isConnected:true,focus:()=>focused=true};h.document.activeElement=trigger;h.document.querySelectorAll=()=>[{contains:()=>false},{contains:x=>x===trigger}];const listeners={},review={tagName:'DIALOG',dataset:{},classList:{add(){}},setAttribute(){},addEventListener:(e,fn)=>listeners[e]=fn};h.window.SofiaUI.enhanceDialog(review,'Fotoänderung prüfen');listeners.close();assert.equal(focused,true);assert.equal(h.events.restore,undefined);});

test('iOS shrinking innerHeight does not erase the keyboard detection baseline',()=>{
 const h=harness();h.window.innerHeight=470;h.window.visualViewport.offsetTop=28;h.events['viewport-resize']();
 assert.equal(h.document.documentElement.dataset.keyboardOpen,'true');assert.equal(h.variables['--sofia-visible-top'],'28px');assert.equal(h.variables['--sofia-visible-height'],'470px');assert.equal(h.variables['--sofia-keyboard-inset'],'302px');
 h.document.activeElement=null;h.events.blur();assert.equal(h.document.documentElement.dataset.keyboardOpen,'false');assert.equal(h.variables['--sofia-keyboard-inset'],'0px');
});
test('viewport panning does not collapse or rewrite the active composer height',()=>{
 const h=harness(),writes=[];let height=h.input.style.height;
 Object.defineProperty(h.input.style,'height',{get:()=>height,set:v=>{writes.push(v);height=v;},configurable:true});
 h.window.visualViewport.offsetTop=35;h.events['viewport-scroll']();h.window.visualViewport.offsetTop=65;h.events['viewport-scroll']();
 assert.deepEqual(writes,[]);assert.equal(height,'144px');assert.equal(h.document.activeElement,h.input);assert.equal(h.variables['--sofia-visible-top'],'65px');
});
test('pinch zoom is not mistaken for a software keyboard',()=>{
 const h=harness();h.window.visualViewport.scale=1.4;h.events['viewport-resize']();assert.equal(h.document.documentElement.dataset.keyboardOpen,'false');assert.equal(h.variables['--sofia-keyboard-inset'],'0px');
});
test('keyboard closing restores full composer bounds without forcing focus or altering a draft',()=>{
 const h=harness();h.input.value='Ein ungesendeter Entwurf';h.window.visualViewport.height=210;h.events['viewport-resize']();assert.equal(h.input.style.height,'52px');h.window.visualViewport.height=800;h.events['viewport-resize']();assert.equal(h.input.style.height,'144px');assert.equal(h.document.documentElement.dataset.keyboardOpen,'false');assert.equal(h.input.value,'Ein ungesendeter Entwurf');assert.equal(h.document.activeElement,h.input);
});

test('rapid blur and refocus during keyboard closing retains the full layout baseline',()=>{const h=harness();h.window.innerHeight=470;h.document.activeElement=null;h.events.blur();h.document.activeElement=h.input;h.events.focus();assert.equal(h.document.documentElement.dataset.keyboardOpen,'true');assert.equal(h.variables['--sofia-keyboard-inset'],'330px');assert.equal(h.document.activeElement,h.input);});

function sendHarness(){const h=harness(),listeners={},sent=[];const button={addEventListener:(name,fn)=>listeners[name]=fn,getBoundingClientRect:()=>({left:10,right:70,top:10,bottom:60})};h.window.SofiaUI.bindSendButton(button,event=>sent.push(event.type),h.input);const event=(type,more={})=>({type,pointerType:'touch',pointerId:1,isPrimary:true,button:0,clientX:30,clientY:30,detail:1,preventDefault(){this.prevented=true;},...more});return {...h,listeners,sent,event};}
test('one primary touch submits on release without blurring the composer and consumes the compatibility click',()=>{const h=sendHarness(),down=h.event('pointerdown');h.listeners.pointerdown(down);assert.equal(down.prevented,true);assert.equal(h.document.activeElement,h.input);assert.equal(h.sent.length,0);h.listeners.pointerup(h.event('pointerup'));h.listeners.click(h.event('click'));assert.deepEqual(h.sent,['pointerup']);});
test('dragging away from Send or cancelling a pointer never submits a draft',()=>{const h=sendHarness();h.input.value='Ein Entwurf';h.listeners.pointerdown(h.event('pointerdown'));h.listeners.pointerup(h.event('pointerup',{clientX:110}));h.listeners.click(h.event('click'));assert.equal(h.sent.length,0);h.listeners.pointerdown(h.event('pointerdown'));h.listeners.pointercancel(h.event('pointercancel'));h.listeners.pointerup(h.event('pointerup'));assert.equal(h.sent.length,0);assert.equal(h.input.value,'Ein Entwurf');});
test('mouse and keyboard Send remain available and a secondary touch cannot submit',()=>{const h=sendHarness();h.listeners.pointerdown(h.event('pointerdown',{isPrimary:false}));h.listeners.pointerup(h.event('pointerup'));assert.equal(h.sent.length,0);h.listeners.click(h.event('click',{pointerType:'mouse'}));h.listeners.click(h.event('click',{pointerType:'',detail:0}));assert.deepEqual(h.sent,['click','click']);});
test('a second deliberate tap is distinct from the first tap compatibility click',()=>{const h=sendHarness();for(let i=0;i<2;i++){h.listeners.pointerdown(h.event('pointerdown'));h.listeners.pointerup(h.event('pointerup'));h.listeners.click(h.event('click'));}assert.deepEqual(h.sent,['pointerup','pointerup']);});

test('small safe-area viewport differences do not leave a phantom keyboard open after a reply',()=>{const h=harness();h.window.innerHeight=666;h.window.visualViewport.height=666;h.events['viewport-resize']();assert.equal(h.document.documentElement.dataset.composerFocused,'true');assert.equal(h.document.documentElement.dataset.keyboardOpen,'false');assert.equal(h.variables['--sofia-keyboard-inset'],'0px');});
test('rotating to another width resets a stale taller keyboard baseline',()=>{const h=harness();h.window.innerWidth=390;h.events['viewport-resize']();h.window.innerWidth=800;h.window.innerHeight=470;h.window.visualViewport.height=470;h.events['viewport-resize']();assert.equal(h.document.documentElement.dataset.keyboardOpen,'false');assert.equal(h.variables['--sofia-keyboard-inset'],'0px');});
test('a newly revealed editor scrolls and flushes layout before synchronous native focus',()=>{const h=harness(),calls=[];const editor={scrollIntoView:o=>calls.push(['scroll',o.behavior]),getBoundingClientRect:()=>calls.push(['layout']),focus:o=>{calls.push(['focus',o.preventScroll]);h.document.activeElement=editor;}};h.window.SofiaUI.focusEditor(editor);assert.deepEqual(calls,[['scroll','auto'],['layout'],['focus',true]]);assert.equal(h.document.activeElement,editor);});
test('a photo editor stays in view when its keyboard changes the visual viewport',()=>{const h=harness(),calls=[],editor={tagName:'TEXTAREA',scrollIntoView:o=>calls.push(o.block)};h.document.activeElement=editor;h.events['viewport-resize']();assert.equal(h.document.documentElement.dataset.editorFocused,'true');h.window.visualViewport.height=260;h.events['viewport-resize']();assert.equal(h.variables['--sofia-visible-height'],'260px');assert.deepEqual(calls,['nearest','nearest']);h.document.activeElement=null;h.events.blur();assert.equal(h.document.documentElement.dataset.editorFocused,'false');});

test('reopening a reused memory surface recreates enabled navigation controls',async()=>{
 const h=harness();
 function node(){return {children:[],classList:{add(){}},setAttribute(){},append(...xs){for(const x of xs){this.children.push(x);x.parent=this;}},remove(){this.parent.children=this.parent.children.filter(x=>x!==this);},focus(){}};}
 const header=node(),doc={createElement:()=>node()};h.document.createElement=doc.createElement;let restore,closed=0;
 const overlay={tagName:'DIV',ownerDocument:doc,style:{display:'flex'},dataset:{},classList:{add(){}},setAttribute(){},querySelector:s=>s==='.dialog-header'?header:s==='.menu-nav-actions'?header.children.find(x=>x.className==='menu-nav-actions'):null,querySelectorAll:()=>[]};
 const close=()=>{closed++;overlay.style.display='none';restore();return true;};
 const open=()=>{overlay.style.display='flex';restore=h.window.SofiaUI.enhanceDialog(overlay,'Fotos',close);};
 h.window.SofiaUI.navigateFrom(menu(h,'Einstellungen'),open,()=>menu(h,'Einstellungen'));
 const first=header.children.at(-1);assert.equal(first.children[0].disabled,false);await first.children[0].onclick();assert.equal(closed,1);assert.equal(first.children[0].disabled,true);
 h.window.SofiaUI.navigateFrom(menu(h,'Einstellungen'),open,()=>menu(h,'Einstellungen'));
 const second=header.children.at(-1);assert.notEqual(second,first);assert.equal(second.children[0].disabled,false);await second.children[1].onclick();assert.equal(closed,2);
 h.window.SofiaUI.navigateFrom(menu(h,'Einstellungen'),open,()=>menu(h,'Einstellungen'));
 const third=header.children.at(-1);assert.notEqual(third,second);assert.equal(third.children[0].disabled,false);assert.notEqual(third.children[1].disabled,true);
});
