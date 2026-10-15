import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {COMPANION_USAGE_SCRIPT,COMPANION_LIVE_END_SCRIPT} from '../lib/character-image.js';
import {SOCIAL_DELIVER_SCRIPT} from '../lib/social.js';
import {MEMORY_RESOLVE_SCRIPT,RESTORE_BACKUP_SCRIPT} from '../lib/companion-evolution.js';
import {TEMPLATE_APPLY_SCRIPT} from '../lib/companion-upgrade.js';
import {SESSION_CREATE_SCRIPT,SESSION_REVOKE_SCRIPT} from '../lib/environment.js';
import {BRANCH_MERGE_SCRIPT} from '../lib/companion-workbench.js';
import {MEMORY_CORRECT_SCRIPT} from '../lib/companion-growth.js';
test('real Lua execution verifies atomic quota and ritual transitions',t=>{
 const r=spawnSync('python',['tests/companion-lua.py'],{input:JSON.stringify({branch_merge:BRANCH_MERGE_SCRIPT,reserve:COMPANION_USAGE_SCRIPT,end:COMPANION_LIVE_END_SCRIPT,deliver:SOCIAL_DELIVER_SCRIPT,resolve:MEMORY_RESOLVE_SCRIPT,restore:RESTORE_BACKUP_SCRIPT,correct:MEMORY_CORRECT_SCRIPT,template:TEMPLATE_APPLY_SCRIPT,session_create:SESSION_CREATE_SCRIPT,session_revoke:SESSION_REVOKE_SCRIPT}),encoding:'utf8'});
 if(r.status===77){t.skip('Lua shared library unavailable');return;}
 assert.equal(r.status,0,r.stderr||r.stdout);
});
