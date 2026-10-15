import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
test('all shipped JavaScript files and index inline scripts parse before release',async()=>{
 for(const directory of ['','api/','lib/'])for(const name of await readdir(new URL(directory,root))){if(!name.endsWith('.js'))continue;const path=new URL(directory+name,root).pathname,result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});assert.equal(result.status,0,directory+name+'\n'+result.stderr);}
 const html=await readFile(new URL('index.html',root),'utf8');for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc=|application\/ld\+json/.test(match[1]))continue;assert.doesNotThrow(()=>new vm.Script(match[2]),'index inline script');}
});
test('text and voice replies use one audio dispatcher without the legacy double playback path',async()=>{const s=await readFile(new URL('app.js',root),'utf8'),start=s.indexOf("if(!data.imageRequest || !/^Gib mir einen kleinen Moment"),end=s.indexOf('} catch (error)',start),block=s.slice(start,end);assert.match(block,/sofia-voice-reply/);assert.doesNotMatch(block,/speak\(reply\)/);const next=await readFile(new URL('sofia-next.js',root),'utf8');assert.match(next,/saved\?\.reply!=='all'/);assert.match(next,/sofia_audio_muted/);});
