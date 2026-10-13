import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {COMPANION_USAGE_SCRIPT,COMPANION_LIVE_END_SCRIPT} from '../lib/character-image.js';
import {SOCIAL_DELIVER_SCRIPT} from '../lib/social.js';
test('real Lua execution verifies atomic quota and ritual transitions',t=>{
 const r=spawnSync('python',['tests/companion-lua.py'],{input:JSON.stringify({reserve:COMPANION_USAGE_SCRIPT,end:COMPANION_LIVE_END_SCRIPT,deliver:SOCIAL_DELIVER_SCRIPT}),encoding:'utf8'});
 if(r.status===77){t.skip('Lua shared library unavailable');return;}
 assert.equal(r.status,0,r.stderr||r.stdout);
});
