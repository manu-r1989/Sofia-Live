import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../action-feedback.js',import.meta.url),'utf8');
function setup(){
  let panel;
  const messages={parentNode:{insertBefore:value=>{panel=value;panel.isConnected=true;}}};
  const window={};
  vm.runInNewContext(source,{window,Intl,calendarStartDate:()=>new Date('2026-10-07T07:00:00Z'),
    document:{getElementById:()=>messages,createElement:()=>({style:{},dataset:{},setAttribute(){}})}});
  return {api:window.SofiaActionFeedback,panel:()=>panel};
}
test('known persisted outcomes display safely without task or audio APIs',()=>{
  const h=setup();for(const action of ['create','update','delete','complete','complete_recurring']){
    h.api.show({ok:true,action,task:{title:'<img onerror=alert(1)>'}});
    assert.equal(h.panel().dataset.result,'success');assert.ok(h.panel().textContent.includes('<img onerror=alert(1)>'));
  }
});
test('existing task and calendar preparation are informational, never newly saved',()=>{
  const h=setup();h.api.show({ok:true,action:'create_existing',task:{title:'Test'}});assert.match(h.panel().textContent,/Bereits vorhanden/);
  h.api.show({ok:true,action:'calendar_export',task:{title:'Test'}});assert.match(h.panel().textContent,/import vorbereitet/);assert.equal(h.panel().dataset.result,'info');
});
test('uncertain outcomes, concurrent actions and clarification are distinct',()=>{
  const h=setup();for(const [status,kind] of [['execution_failed','uncertain'],['in_progress','pending'],['ambiguous','question'],['missing_due_at','question']]){
    h.api.show({ok:false,action:'create',status,task:{title:'Test'}});assert.equal(h.panel().dataset.result,kind);
  }
});
test('ordinary conversation and malformed success clear stale results',()=>{
  const h=setup();h.api.show({ok:true,action:'create',task:{title:'Test'}});
  for(const result of [{ok:true,action:'none'},{ok:'true',action:'create'},{ok:true,action:'unknown'},null]){
    h.api.show(result);assert.equal(h.panel().hidden,true);assert.equal(h.panel().textContent,'');
  }
});
test('recurring task uses real next due time formatted in Berlin',()=>{
  const h=setup();h.api.show({ok:true,action:'complete_recurring',nextDueAt:'2026-10-07T09:00:00',task:{title:'Test'}});
  assert.match(h.panel().textContent,/07\.10\.2026/);assert.match(h.panel().textContent,/09:00/);assert.match(h.panel().textContent,/Berlin/);
});
