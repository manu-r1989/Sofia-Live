import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {parseChatResponse} from '../api/chat.js';
const message=text=>({type:'message',content:[{type:'output_text',text}]});
test('complete replies join every text segment and ignore tool output',()=>{
 const result=parseChatResponse({status:'completed',output:[{type:'web_search_call',content:[{type:'output_text',text:'ignore'}]},message('{"reply":"Guten '),message('Abend","mood":"entspannt"}')]});
 assert.equal(result.reply,'Guten Abend');
});
test('truncated or malformed replies never fall back to technical JSON',()=>{
 for(const data of [{status:'incomplete',output:[message('{"reply":"Bis 22')]},{status:'incomplete',output:[message('{"reply":"vollständig"}')]},{output:[message('{"reply":"abgebrochen')]},{output:[message('null')]},{output:[message('[]')]},{output:[message('{"reply":42}')]},{output:[message('{"reply":" "}')]}])assert.throws(()=>parseChatResponse(data),/chat_response_/);
});
const script=await readFile(new URL('../sofia-message-text.js',import.meta.url),'utf8');
function harness(){
 class Node{constructor(tag='',text=''){this.tagName=tag;this.text=text;this.children=[];}set textContent(t){this.text=t;this.children=[];}get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.text='';this.children=nodes;}}
 const document={createElement:tag=>new Node(tag),createTextNode:text=>new Node('',text)},context=vm.createContext({window:{},document,URL});vm.runInContext(script,context);return {api:context.window.SofiaMessageText,node:new Node('div')};
}
test('legacy truncated envelopes show recovered text and a clear integrity note',()=>{
 const {api,node}=harness(),raw='{\n "reply": "Heute läuft **Musik** bis 22';api.render(node,raw);
 assert.ok(node.textContent.startsWith('Heute läuft Musik bis 22'));assert.ok(!node.textContent.includes('"reply"'));assert.match(node.textContent,/fehlende Schluss ist nicht gespeichert/);assert.equal(api.readable(raw).incomplete,true);
 assert.equal(api.readable('{"mood":"ruhig","reply":"Hallo"}').text,'Hallo');
});
test('legacy JSON escape handling preserves quotes and never invents missing text',()=>{
 const {api}=harness();assert.equal(api.readable('{"reply":"Er sagte: \\"Hallo\\".\\nBis morgen').text,'Er sagte: "Hallo".\nBis morgen');
 assert.equal(api.readable('{"reply":"Preis: 20\\u20').text,'Preis: 20');assert.equal(api.readable('Normaler Text').incomplete,false);
});
test('formatting uses DOM text and safe clickable sources without HTML injection',()=>{
 const {api,node}=harness();api.render(node,'**Heute** [Quelle](https://example.org/termine) <img src=x onerror=alert(1)> [falsch](javascript:alert(1))');
 const body=node.children[0];assert.equal(body.children.filter(x=>x.tagName==='strong').length,1);const links=body.children.filter(x=>x.tagName==='a');assert.equal(links.length,1);assert.equal(links[0].href,'https://example.org/termine');assert.equal(links[0].rel,'noopener noreferrer');assert.match(node.textContent,/<img src=x/);assert.equal(body.children.filter(x=>x.tagName==='img').length,0);
});
test('research metadata accepts only actual safe citations and marks retrieval only after completed web search',async()=>{
 const {chatResearchSources}=await import('../api/chat.js');const data={output:[{type:'message',content:[{type:'output_text',annotations:[{type:'url_citation',url:'https://example.org/a',title:'Quelle'},{type:'url_citation',url:'https://example.org/a'},{type:'url_citation',url:'javascript:alert(1)'},{type:'url_citation',url:'https://user:secret@example.org'}]}]}]};
 assert.equal(chatResearchSources(data).length,1);assert.equal(chatResearchSources(data)[0].retrievedAt,null);data.output.unshift({type:'web_search_call',status:'completed'});assert.equal(chatResearchSources(data,'2026-10-16T12:00:00Z')[0].retrievedAt,'2026-10-16T12:00:00Z');
});
