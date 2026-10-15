"""Execute production Lua against a small in-memory Redis command adapter.

The native Lua runtime tests the actual scripts, including cjson null semantics.
No network, credentials or paid services are used.
"""
import ctypes as C
import ctypes.util
import json
import sys
import unittest

library = ctypes.util.find_library('lua5.4') or ctypes.util.find_library('lua5.3')
if not library:
    sys.exit(77)
lua = C.CDLL(library)
def api(name, result, *args):
    function = getattr(lua, name)
    function.restype, function.argtypes = result, args
    return function
ptr, integer = C.c_void_p, C.c_longlong
new = api('luaL_newstate', ptr)
openlibs = api('luaL_openlibs', None, ptr)
gettop = api('lua_gettop', C.c_int, ptr)
settop = api('lua_settop', None, ptr, C.c_int)
kind = api('lua_type', C.c_int, ptr, C.c_int)
string = api('lua_tolstring', C.c_char_p, ptr, C.c_int, ptr)
number = api('lua_tonumberx', C.c_double, ptr, C.c_int, ptr)
boolean = api('lua_toboolean', C.c_int, ptr, C.c_int)
pointer = api('lua_topointer', ptr, ptr, C.c_int)
pushnil = api('lua_pushnil', None, ptr)
pushnumber = api('lua_pushnumber', None, ptr, C.c_double)
pushboolean = api('lua_pushboolean', None, ptr, C.c_int)
pushstring = api('lua_pushstring', C.c_char_p, ptr, C.c_char_p)
createtable = api('lua_createtable', None, ptr, C.c_int, C.c_int)
rawset = api('lua_rawseti', None, ptr, C.c_int, integer)
setfield = api('lua_setfield', None, ptr, C.c_int, C.c_char_p)
getglobal = api('lua_getglobal', C.c_int, ptr, C.c_char_p)
setglobal = api('lua_setglobal', None, ptr, C.c_char_p)
nextitem = api('lua_next', C.c_int, ptr, C.c_int)
load = api('luaL_loadstring', C.c_int, ptr, C.c_char_p)
pcall = api('lua_pcallk', C.c_int, ptr, C.c_int, C.c_int, C.c_int, C.c_longlong, ptr)
callback_type = C.CFUNCTYPE(C.c_int, ptr)
pushcallback = api('lua_pushcclosure', None, ptr, callback_type, C.c_int)
state = new()
openlibs(state)
arrays, db, errors = set(), {}, []
def run(code):
    if load(state, code.encode()) or pcall(state, 0, 0, 0, 0, None):
        raise RuntimeError(string(state, -1, None).decode())
run('__json_null={};collectgarbage("stop")')
getglobal(state, b'__json_null')
null_pointer = pointer(state, -1)
settop(state, 0)
def push(value):
    if value is None:
        getglobal(state, b'__json_null')
    elif isinstance(value, bool):
        pushboolean(state, value)
    elif isinstance(value, (int, float)):
        pushnumber(state, value)
    elif isinstance(value, str):
        pushstring(state, value.encode())
    elif isinstance(value, list):
        createtable(state, len(value), 0)
        arrays.add(pointer(state, -1))
        for i, item in enumerate(value, 1):
            push(item)
            rawset(state, -2, i)
    else:
        createtable(state, 0, len(value))
        for key, item in value.items():
            push(item)
            setfield(state, -2, key.encode())
def read(index):
    index = index if index > 0 else gettop(state) + index + 1
    t = kind(state, index)
    if t == 0 or pointer(state, index) == null_pointer:
        return None
    if t == 1:
        return bool(boolean(state, index))
    if t == 3:
        n = number(state, index, None)
        return int(n) if n.is_integer() else n
    if t == 4:
        return string(state, index, None).decode()
    if t != 5:
        raise TypeError(t)
    values = {}
    pushnil(state)
    while nextitem(state, index):
        values[read(-2)] = read(-1)
        settop(state, gettop(state) - 1)
    if pointer(state, index) in arrays or (values and set(values)==set(range(1,len(values)+1))):
        return [values[i] for i in sorted(values)]
    return values
def safe(fn):
    @callback_type
    def call(_):
        try:
            push(fn())
        except Exception as error:
            errors.append(str(error))
            pushnil(state)
        return 1
    return call
decode = safe(lambda: json.loads(read(1)))
encode = safe(lambda: json.dumps(read(1), separators=(',', ':')))
def redis_call():
    command, *args = [read(i) for i in range(1, gettop(state)+1)]
    if command == 'GET':
        return db.get(args[0], False)
    if command == 'EXISTS':
        return int(args[0] in db)
    if command == 'DEL':
        return int(db.pop(args[0], None) is not None)
    if command == 'SET':
        db[args[0]] = args[1]
        return 'OK'
    raise ValueError(command)
redis = safe(redis_call)
for name, fn in [(b'decode', decode), (b'encode', encode), (b'redis_call', redis)]:
    pushcallback(state, fn, 0)
    setglobal(state, name)
run('cjson={decode=decode,encode=encode,null=__json_null};redis={call=redis_call}')
scripts = json.load(sys.stdin)
def execute(name, keys, args):
    push(keys)
    setglobal(state, b'KEYS')
    push(args)
    setglobal(state, b'ARGV')
    run('__result=(function()\n'+scripts[name]+'\nend)()')
    getglobal(state, b'__result')
    result = read(-1)
    settop(state, 0)
    if errors:
        raise AssertionError(errors)
    return result
class AtomicTests(unittest.TestCase):
    def setUp(self):
        db.clear()
        errors.clear()
        db['state'] = json.dumps({'revision':0, 'limits':{'images':1,'liveMinutes':2},'livePreferences':{'sessionMinutes':20}})
    def test_image_duplicate_and_monthly_cap(self):
        self.assertEqual(execute('reserve',['state','usage','image1'],['image']),1)
        self.assertEqual(execute('reserve',['state','usage','image1'],['image']),1)
        self.assertEqual(execute('reserve',['state','usage','image2'],['image']),0)
        self.assertEqual(json.loads(db['usage'])['imageAttempts'],1)
    def test_live_reservation_blocks_overlap_and_refunds_once(self):
        result=json.loads(execute('reserve',['state','usage','session1'],['live','session1','2026-10','100000']))
        self.assertEqual(result['seconds'],120)
        self.assertEqual(execute('reserve',['state','usage','session2'],['live','session2','2026-10','100000']),'')
        self.assertEqual(execute('end',['session1','usage'],['130000','2026-10']),1)
        self.assertEqual(json.loads(db['usage'])['liveSeconds'],30)
        self.assertEqual(execute('end',['session1','usage'],['130000','2026-10']),0)
        result=json.loads(execute('reserve',['state','usage','session2'],['live','session2','2026-10','130000']))
        self.assertEqual(result['seconds'],90)
    def ritual(self, enabled=True):
        db['state']=json.dumps({'revision':0,'rituals':[{'id':'r','enabled':enabled,'archived':False,'updatedAt':'v1','lastSentAt':None}]})
        db['history']='[]'
        updated=json.loads(db['state']);updated['revision']=1;updated['rituals'][0]['lastSentAt']='now';updated['topics']=[]
        return ['[]',json.dumps({'id':'contact','text':'Frage','createdAt':'now'}),'r','v1','','now',db['state'],json.dumps(updated)]
    def test_first_ritual_accepts_json_null_and_duplicate_is_rejected(self):
        args=self.ritual()
        self.assertEqual(execute('deliver',['history','inbox','state'],args),1)
        self.assertEqual(json.loads(db['state'])['rituals'][0]['lastSentAt'],'now')
        self.assertIsInstance(json.loads(db['state'])['topics'],list)
        self.assertEqual(execute('deliver',['history','inbox','state'],args),0)
        self.assertEqual(len(json.loads(db['history'])),1)
    def test_disabled_or_edited_ritual_does_not_write_a_message(self):
        args=self.ritual(False)
        self.assertEqual(execute('deliver',['history','inbox','state'],args),0)
        self.assertNotIn('inbox',db)
        args=self.ritual()
        args[3]='old-version'
        self.assertEqual(execute('deliver',['history','inbox','state'],args),0)
        self.assertEqual(json.loads(db['state'])['revision'],0)
    def test_conversation_changed_prevents_ritual_delivery_and_marking(self):
        args=self.ritual()
        db['history']='[{"role":"user","content":"new"}]'
        self.assertEqual(execute('deliver',['history','inbox','state'],args),0)
        self.assertIsNone(json.loads(db['state'])['rituals'][0]['lastSentAt'])
        self.assertNotIn('inbox',db)
    def test_memory_resolution_checks_both_versions_before_writing(self):
        db['memories']='[{"text":"old"}]'
        db['proposals']='[{"id":"p","status":"pending"}]'
        args=[db['memories'],db['proposals'],'[{"text":"new"}]','[{"id":"p","status":"accepted"}]']
        self.assertEqual(execute('resolve',['memories','proposals'],args),1)
        self.assertEqual(execute('resolve',['memories','proposals'],args),0)
        self.assertEqual(json.loads(db['memories'])[0]['text'],'new')
    def test_memory_policy_change_is_atomic_with_confirmed_text(self):
        db['memories']='[{"text":"old"}]'
        db['proposals']='[{"id":"p","status":"pending"}]'
        db['state']='{"revision":0,"memoryPolicies":[]}'
        args=[db['memories'],db['proposals'],'[{"text":"new"}]','[{"id":"p","status":"accepted"}]',db['state'],'{"revision":1,"memoryPolicies":[{"reference":"new","scope":"temporary"}]}']
        db['state']='{"revision":2,"memoryPolicies":[]}'
        self.assertEqual(execute('resolve',['memories','proposals','state'],args),0)
        self.assertEqual(json.loads(db['memories'])[0]['text'],'old')
    def restore_preview(self):
        db['memories']='[]'
        db['projects']='{"revision":0,"items":[]}'
        db['tasks']='[]'
        db['preview']=json.dumps({'raw':db['state'],'memoryRaw':db['memories'],'projectRaw':db['projects'],'taskRaw':db['tasks'],'stateJSON':'{"revision":1,"topics":[],"writings":[]}','memoriesJSON':'[]','projectsJSON':'{"revision":1,"items":[]}'})
    def test_restore_preserves_empty_arrays_and_consumes_confirmation_once(self):
        self.restore_preview()
        keys=['preview','state','memories','projects','tasks']
        self.assertEqual(execute('restore',keys,[]),1)
        self.assertIsInstance(json.loads(db['state'])['topics'],list)
        self.assertEqual(db['tasks'],'[]')
        self.assertEqual(execute('restore',keys,[]),0)
    def test_task_change_invalidates_restore_without_partial_writes(self):
        self.restore_preview()
        original=db['state']
        db['tasks']='[{"id":"new-task"}]'
        self.assertEqual(execute('restore',['preview','state','memories','projects','tasks'],[]),-1)
        self.assertEqual(db['state'],original)
        self.assertEqual(db['memories'],'[]')
    def test_direct_memory_correction_preserves_policy_atomically(self):
        db['memories']='[{"text":"old"}]'
        db['state']='{"revision":0,"memoryPolicies":[]}'
        args=[db['memories'],db['state'],'[{"text":"new"}]','{"revision":1,"memoryPolicies":[{"reference":"new","scope":"temporary"}]}']
        original=db['memories']
        db['state']='{"revision":2,"memoryPolicies":[]}'
        self.assertEqual(execute('correct',['memories','state'],args),0)
        self.assertEqual(db['memories'],original)
        db['state']=args[1]
        self.assertEqual(execute('correct',['memories','state'],args),1)
        self.assertEqual(json.loads(db['state'])['memoryPolicies'][0]['scope'],'temporary')
    def test_template_cas_updates_both_keys_once(self):
        db['projects']='{"revision":0,"items":[]}'
        db['preview']=json.dumps({'raw':db['state'],'projectRaw':db['projects']})
        args=[db['state'],db['projects'],'{"revision":1,"steps":[]}','{"revision":1,"items":[{"id":"new"}]}']
        db['projects']='{"revision":2,"items":[]}'
        self.assertEqual(execute('template',['preview','state','projects'],args),0)
        self.assertEqual(db['state'],args[0])
        db['projects']=args[1]
        self.assertEqual(execute('template',['preview','state','projects'],args),1)
        self.assertEqual(db['state'],args[2])
        self.assertEqual(execute('template',['preview','state','projects'],args),2)
        self.assertEqual(len(json.loads(db['projects'])['items']),1)
    def test_device_sessions_create_and_revoke_independently(self):
        a={'id':'a','hash':'ha','expiresMs':2000,'passwordVersion':'v'}
        b={'id':'b','hash':'hb','expiresMs':2000,'passwordVersion':'v'}
        self.assertEqual(execute('session_create',['index','session:ha'],[json.dumps(a),'1000','v']),1)
        self.assertEqual(execute('session_create',['index','session:hb'],[json.dumps(b),'1000','v']),1)
        self.assertEqual(len(json.loads(db['index'])),2)
        self.assertEqual(execute('session_revoke',['index'],['b','session:']),1)
        self.assertIn('session:ha',db)
        self.assertNotIn('session:hb',db)
        self.assertEqual(json.loads(db['index'])[0]['id'],'a')
        self.assertEqual(execute('session_revoke',['index'],['a','session:']),1)
        self.assertEqual(db['index'],'[]')
    def test_branch_merge_compares_both_snapshots_and_changes_neither_on_conflict(self):
        db['companion']='{"revision":0}'
        db['history']='[{"role":"user","content":"original"}]'
        args=[db['companion'],db['history'],'{"revision":1}','[{"role":"user","content":"original"},{"role":"assistant","content":"approved"}]']
        db['history']='[{"role":"user","content":"newer"}]'
        self.assertEqual(execute('branch_merge',['companion','history'],args),0)
        self.assertEqual(db['companion'],args[0])
        self.assertIn('newer',db['history'])
        db['history']=args[1]
        self.assertEqual(execute('branch_merge',['companion','history'],args),1)
        self.assertEqual(db['companion'],args[2])
        self.assertEqual(len(json.loads(db['history'])),2)
        self.assertEqual(execute('branch_merge',['companion','history'],args),0)
        self.assertEqual(len(json.loads(db['history'])),2)
unittest.main(argv=['atomic-tests'])
