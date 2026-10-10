import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../sofia-ui.js',import.meta.url),'utf8');
function harness(){
 const events={},variables={},input={tagName:'TEXTAREA',style:{},scrollHeight:210,addEventListener:(t,f)=>events[t]=f};
 const document={activeElement:input,documentElement:{style:{setProperty:(k,v)=>variables[k]=v}},getElementById:()=>input};
 const window={innerHeight:800,addEventListener(){},visualViewport:{height:470,offsetTop:0,addEventListener:(t,f)=>events['viewport-'+t]=f},SofiaChatViewport:{capture:()=>({reading:true}),restore:v=>events.restore=v}};
 vm.runInNewContext(source,{window,document,Intl,Date});return {window,document,input,events,variables};
}
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
 const h=harness();h.window.visualViewport.height=210;h.events['viewport-resize']();assert.equal(h.input.style.height,'72px');h.window.visualViewport.height=800;h.events['viewport-resize']();assert.equal(h.input.style.height,'144px');
});
