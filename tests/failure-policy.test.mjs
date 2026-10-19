import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {providerFailure,retryAfterSeconds,providerDiagnostic} from '../lib/environment.js';
const source=await readFile(new URL('../app.js',import.meta.url),'utf8'),context=vm.createContext({Date});
vm.runInContext(source.slice(source.indexOf('function chatFailureFeedback('),source.indexOf('async function askSofia(')),context);
const now=new Date('2026-10-11T01:00:00Z');
for(const [value,result]of [['60',60],['0',0],['1.2',2],['Sun, 11 Oct 2026 01:01:00 GMT',60],['',null],['nonsense',null],['-1',null],['99999999',null],['Sat, 10 Oct 2026 00:00:00 GMT',null]])test('bounded retry deadline '+value,()=>assert.equal(retryAfterSeconds(value,now),result));
for(const [raw,expected]of [['credit_balance_exhausted','api_credit_exhausted'],['organization_spend_limit_exceeded','api_spend_limit'],['project_spend_limit_exceeded','api_spend_limit'],['organization_usage_limit_exceeded','api_usage_limit'],['insufficient_quota','api_billing_limit'],['rate_limit_exceeded','api_rate_limit'],['slow_down','api_rate_limit'],['unrecognized','chat_provider_failed']])test('provider cause '+raw+' is public without raw error content',()=>{const result=providerFailure(429,{error:{code:raw,message:'private key and prompt'}},'60',now);assert.equal(result.code,expected);assert.ok(!JSON.stringify(result).includes('private'));if(expected==='api_rate_limit')assert.equal(result.retryAfterSeconds,60);else assert.equal(result.retryAt,undefined);});
test('unknown 429 does not claim empty balance or a fabricated wait',()=>{const result=context.chatFailureFeedback(429,'chat_provider_failed',false,false);assert.match(result.message,/genaue Ursache ist nicht bekannt/);assert.doesNotMatch(result.message,/Guthaben|Erneut möglich/);});
test('billing ambiguity differs from confirmed exhausted credits',()=>{assert.match(context.chatFailureFeedback(429,'api_billing_limit',false,false).message,/genaue Grund ist nicht bestätigt/);assert.match(context.chatFailureFeedback(429,'api_credit_exhausted',false,false).message,/aufgebrauchtes API-Guthaben/);});
test('confirmed provider rejection does not mark a task outcome unconfirmed',()=>assert.equal(context.chatFailureFeedback(429,'api_rate_limit',true,false).uncertainAction,false));
test('transport interruption preserves uncertainty unless task result already arrived',()=>{assert.equal(context.chatFailureFeedback(undefined,undefined,true,false).uncertainAction,true);assert.equal(context.chatFailureFeedback(500,'chat_provider_failed',true,true).uncertainAction,false);});

test('technical provider rejection is distinct from a connection failure and logs no content',()=>{
 assert.equal(providerFailure(400,{error:{message:'private'}}).code,'api_request_rejected');
 assert.equal(providerFailure(400,{error:{code:'context_length_exceeded'}}).code,'api_context_limit');
 const safe=providerDiagnostic({error:{code:'invalid_value',type:'invalid_request_error',param:'input[2].content[0].text',message:'private'}});
 assert.deepEqual(safe,{providerCode:'invalid_value',providerType:'invalid_request_error',providerParam:'input[2].content[0].text'});
 assert.equal(providerDiagnostic({error:{code:'private',param:'private',type:'private'}}).providerParam,'unknown');
 assert.doesNotMatch(context.chatFailureFeedback(400,'api_request_rejected',false,false).message,/Verbindung/);
});
