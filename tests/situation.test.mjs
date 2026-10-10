import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const encode=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const env=encode(await readFile(new URL('../lib/environment.js',import.meta.url),'utf8'));
const source=(await readFile(new URL('../lib/character-image.js',import.meta.url),'utf8')).replace('../lib/environment.js',env);
const api=await import(encode(source));
const noon=new Date('2026-10-08T10:15Z');
const life={...api.defaultSofiaLife(noon),revision:5};

test('situation migration mirrors flat API fields and derives sitting posture at cafe',()=>{
 const next=api.reconcileSituation(null,life,noon);
 assert.equal(next.situation.schema,1);assert.equal(next.situation.revision,5);
 for(const field of ['location','activity','outfit','hairstyle','mood'])assert.equal(next.situation[field],next[field]);
 assert.equal(next.situation.posture,'sitzend');assert.equal(next.situation.sources.location.source,'day_rhythm');
 assert.ok(Date.parse(next.situation.validUntil)>+noon);assert.equal(next.statusLabel,api.lifeStatusLabel(next.location));
});
test('a conversation change records proof and expires within ninety minutes or the current slot',()=>{
 const old=api.reconcileSituation(null,life,noon);
 const next=api.reconcileSituation(old,{...old,revision:6,location:'auf dem Sofa zu Hause',activity:'auf dem Sofa sitzen'},noon,'conversation','Ich sitze gerade auf dem Sofa.');
 assert.equal(next.situation.sources.location.source,'conversation');assert.match(next.situation.sources.location.evidence,/Sofa/);
 assert.ok(Date.parse(next.situation.validUntil)<=+noon+90*60000);
 assert.equal(old.location,life.location);assert.equal(next.situation.posture,'sitzend');
});
test('reaffirming an explicit field refreshes its evidence time without changing unrelated sources',()=>{
 const old=api.reconcileSituation(null,life,noon),later=new Date(+noon+10*60000);
 const next=api.reconcileSituation(old,{...old,revision:6},later,'conversation','Ich bin weiterhin im Café.',['location']);
 assert.equal(next.situation.at,later.toISOString());assert.equal(next.situation.sources.location.source,'conversation');
 assert.equal(next.situation.sources.outfit.source,'day_rhythm');
});
test('current corrections require literal evidence and touch only named fields',()=>{
 const text='Korrektur: Du bist gerade im Café.';
 const next=api.applySituationCorrection(life,[{field:'location',value:'im Café',evidence:'Du bist gerade im Café'}],text,noon);
 assert.equal(next.location,'im Café');assert.equal(next.outfit,life.outfit);assert.equal(next.situationChange.source,'correction');
 for(const corrections of [[{field:'location',value:'auf dem Kiez',evidence:'Du bist gerade im Café'}],[{field:'location',value:'im Café',evidence:'Ich bin im Café'}],[{field:'face',value:'anders',evidence:'Du bist gerade im Café'}]])assert.equal(api.applySituationCorrection(life,corrections,text,noon),life);
});
test('past or hypothetical corrections never become a current location',()=>{
 for(const message of ['Korrektur: Du warst vorhin im Café.','Nein, angenommen du würdest im Café sitzen.'])assert.equal(api.applySituationCorrection(life,[{field:'location',value:'im Café',evidence:'im Café'}],message,noon),life);
});
test('corrections cannot change hair color or put Sofia at university at night',()=>{
 const night=api.defaultSofiaLife(new Date('2026-10-08T23:00Z'));
 assert.equal(api.applySituationCorrection(night,[{field:'location',value:'Universität',evidence:'Du bist an der Universität'}],'Nein, Du bist an der Universität.',noon),night);
 assert.equal(api.applySituationCorrection(life,[{field:'hairstyle',value:'blonde Haare',evidence:'Du hast blonde Haare'}],'Korrektur: Du hast blonde Haare.',noon),life);
});
test('past questions expose observed history without replacing current situation',()=>{
 const state={...life,dayStory:[{location:'an der Uni',activity:'lernen',at:'2026-10-08T09:00Z'}]};
 const context=api.situationContext(state,'Du warst doch gerade noch an der Uni?',noon);
 assert.match(context,/FRAGE ZUR FRÜHEREN SITUATION/);assert.match(context,/Lücken offenlassen/);assert.match(context,/Anfragezeitpunkt/);
 assert.equal(api.situationSnapshot(state).location,life.location);
});
test('direct emotional cues guide the reply without inferring emotions from neutral statements',()=>{
 assert.match(api.reactionContext('Ich bin heute müde.'),/Müdigkeit/);
 assert.match(api.reactionContext('Ich habe es bestanden!'),/Freude/);
 assert.match(api.reactionContext('Wie spät ist es?'),/Keine eindeutige/);
 assert.equal(api.responseToneFor('Ich bin frustriert.'),'calm');assert.equal(api.responseToneFor('Welchen Film magst du?'),'natural');
});
test('custom quiet windows include exact boundaries in Hamburg, including DST',()=>{
 const p={quietStart:'22:30',quietEnd:'07:15'};
 assert.equal(api.contactPauseReason(p,new Date('2026-10-08T20:29Z')),null);
 assert.equal(api.contactPauseReason(p,new Date('2026-10-08T20:30Z')),'quiet');
 assert.equal(api.contactPauseReason(p,new Date('2026-10-09T05:14Z')),'quiet');
 assert.equal(api.contactPauseReason(p,new Date('2026-10-09T05:15Z')),null);
 assert.equal(api.contactPauseReason(p,new Date('2026-10-25T01:30Z')),'quiet');
 assert.equal(api.contactPauseReason({quietStart:'12:00',quietEnd:'13:00'},noon),'quiet');
});
test('temporary pause wins over awake hours and expires without changing the selected level',()=>{
 const prefs={level:'natural',pausedUntil:new Date(+noon+3600000).toISOString()};
 assert.equal(api.contactPauseReason(prefs,noon),'paused');assert.equal(api.contactPauseReason(prefs,new Date(+noon+3600000)),null);assert.equal(prefs.level,'natural');
 for(const value of ['24:00','23:60','x',null])assert.equal(api.validQuietTime(value),false);
 assert.deepEqual(api.contactPolicy({}),{quietStart:'23:00',quietEnd:'08:00',pausedUntil:null});
});
test('selected subtopic survives follow-ups and the other subtopic resolves without guessing',()=>{
 const initial=api.updateDialogue({},'Mein Studienprojekt stockt; mein Auto hat ein Problem.','Welcher Punkt ist gerade wichtiger?',noon);
 const selected=api.updateDialogue(initial,'Zum zweiten Punkt','Zum Auto fehlen mir noch Details.',new Date(+noon+1000));
 assert.equal(selected.dialogue.topics.length,2);assert.match(selected.dialogue.selectedTopic,/Auto/);
 assert.match(api.conversationFocus(selected,'Das andere',new Date(+noon+2000)).topic,/Studienprojekt/);
 assert.equal(api.conversationFocus(initial,'Das andere',new Date(+noon+2000)).type,'ambiguous');
});
test('closing pauses contact and closes all previous topics; a fresh new turn clears that pause',()=>{
 const before=api.updateDialogue({},'Mein Projekt stockt; mein Auto hat ein Problem.','Wie geht es damit?',noon);
 const closed=api.updateDialogue(before,'Bis später','Bis später!',new Date(+noon+1000));
 assert.equal(closed.dialogue.pendingQuestion,null);assert.equal(closed.dialogue.closedTopics.length,2);assert.ok(Date.parse(closed.dialogue.contactPauseUntil)>+noon);
 const resumed=api.updateDialogue(closed,'Ich bin wieder da.','Schön, dich zu lesen.',new Date(+noon+2000));assert.equal(resumed.dialogue.contactPauseUntil,undefined);
});

test('new situation details require all meaningful words in Sofias actual answer',()=>{
 assert.equal(api.situationEvidence('ein grüner Pullover mit Jeans','Ich trage einen grünen Pullover mit Jeans.'),true);
 assert.equal(api.situationEvidence('ein rotes Shirt','Ich trage ein blaues Shirt.'),false);
 assert.equal(api.situationEvidence('im Café in Paris','Ich sitze im Café.'),false);
 assert.equal(api.situationEvidence('ein lockerer Pferdeschwanz','Meine Haare sind in einem lockeren Pferdeschwanz.'),true);
 assert.equal(api.situationEvidence('im Café','Du bist im Café.'),false);
});

test('quoted own-looking statements are not current situation evidence',()=>{
 assert.equal(api.situationEvidence('im Café','Du sagst „Ich bin im Café“. Das ist ein Beispiel.'),false);
});
