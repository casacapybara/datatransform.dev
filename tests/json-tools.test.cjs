const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const M=require('../data-file-converter/model.js'),J=require('../shared/json-model.js');
test('JSON explorer preserves numeric digits and distinguishes missing, null and blank',()=>{
 const value=J.parse('[{"n":9007199254740993,"x":null,"id":"001"},{"n":9007199254740992,"x":""},{"n":1e400}]');const s=J.select(value,[]);
 assert.equal(J.filter(s,{filters:[{field:'n',op:'gt',value:'9007199254740992'}]}).originals.length,2);
 for(const [op,length]of [['null',1],['missing',1],['present',2]])assert.equal(J.filter(s,{filters:[{field:'x',op,value:''}]}).originals.length,length);
 assert.equal(J.filter(s,{filters:[{field:'x',op:'eq',value:''}]}).originals.length,1);
 assert.match(M.output(s.table,{columns:[0],format:'json'}).text,/9007199254740993/);
});
test('exact numeric comparison handles exponents, signs, zeros and long decimals',()=>{
 for(const [a,b,c]of [['1e400','9e399',1],['-0','0',0],['1.2300','123e-2',0],['-1e400','-9e399',-1],['0.1234567890123456789','0.1234567890123456788',1]])assert.equal(J.compare(a,b),c);
 assert.throws(()=>J.compare('x','1'),/valid number/);
});
test('collection filters, projection and original export retain separate structures',()=>{
 const s=J.select(J.parse('{"data":[{"a":{"b":1},"a.b":2,"tags":[1]},{"a":{"b":3},"tags":[]}]}'),['data']);
 assert.deepEqual(s.table.headers,['a.b','["a.b"]','tags']);const f=J.filter(s,{match:'any',filters:[{field:'a.b',op:'eq',value:'3'},{field:'["a.b"]',op:'eq',value:'2'}]});assert.equal(f.originals.length,2);assert.match(J.pretty(f.originals),/"a":/);assert.match(M.output(f.table,{columns:[1,0],format:'json'}).text,/"\[\\"a.b\\"\]":2,"a.b":1/);
 assert.equal(J.filter(s,{search:'nonexistent'}).originals.length,0);
});
test('JSON Pointer edits preserve exact numbers and special keys without prototype traversal',()=>{
 const v=J.parse('{"a/b":{"~key":[1,2]},"__proto__":{"safe":true},"n":9007199254740993}');
 const edited=J.edit(v,'/a~1b/~0key/1','replace','9007199254740995');assert.equal(J.get(edited,['a/b','~key','1']).token,'9007199254740995');assert.equal(J.get(v,['a/b','~key','1']).token,'2');
 assert.equal(J.edit(v,'/a~1b/~0key/-','add','3')['a/b']['~key'].length,3);assert.equal(J.edit(v,'/a~1b/~0key/0','remove')['a/b']['~key'].length,1);
 assert.throws(()=>J.edit(v,'/constructor/prototype/x','add','1'),/parent/);assert.throws(()=>J.edit(v,'/a~2b','remove'),/Pointer/);assert.throws(()=>J.edit(v,'','remove'),/root/);
});
test('structural comparison ignores object key order and equivalent numeric notation',()=>{
 assert.equal(J.diff(J.parse('{"b":2,"a":1.0}'),J.parse('{"a":1e0,"b":2}')).total,0);
 const r=J.diff(J.parse('{"x":null,"a":[1,2]}'),J.parse('{"a":[2],"new":true}'));assert.equal(r.total,4);assert.ok(r.changes.some(c=>c.path==='/x'&&c.kind==='removed'));
});
test('formatting and JSON Lines keep exact numbers and duplicate keys remain invalid',()=>{
 const v=J.parse('{"n":9007199254740993}\n{"n":0.1234567890123456789}','jsonl');assert.match(J.pretty(v),/9007199254740993/);assert.match(J.pretty(v),/0.1234567890123456789/);assert.throws(()=>J.parse('{"x":1,"x":2}'),/duplicate/);assert.throws(()=>J.parse('{}\n{bad}','jsonl'),/Line 2/);
});
test('JSON parsing permits useful desktop collections beyond the old 20,000-row limit',()=>{
 const v=J.parse('['+Array.from({length:30000},(_,i)=>'{"id":'+i+'}').join(',')+']');assert.equal(J.select(v,[]).records.length,30000);
});
async function libs(){return import('../shared/workbench-libs.mjs');}
test('JSONPath queries preserve original numeric tokens and escaped field names',async()=>{
 const L=await libs(),v=J.parse('{"a\'b":{"x":9007199254740993},"customers":[{"name":"A","active":true},{"name":"B","active":false}]}');
 assert.equal(L.query(v,"$['a\\\'b'].x",M,J).values[0].token,'9007199254740993');
 assert.equal(L.query(J.parse('{"customers":[{"name":"A","active":true}]}'),'$.customers[?@.active == true].name',M,J).values[0],'A');
 assert.throws(()=>L.query(v,'$[?@.x > 1]',M,J),/precision/);
});
test('schema validation returns locations and rejects unsupported drafts and imprecise numbers',async()=>{
 const L=await libs(),v=J.parse('{"age":"old"}'),r=L.validate(v,'{"type":"object","properties":{"age":{"type":"integer"}}}',M,J);assert.equal(r.valid,false);assert.equal(r.errors[0].path,'/age');
 assert.throws(()=>L.validate(v,'{"$schema":"https://json-schema.org/draft/2020-12/schema"}',M,J),/draft/);
 assert.throws(()=>L.validate(J.parse('{"n":9007199254740993}'),'{}',M,J),/precision|large/);
});
function worker(){const messages=[],context={DataConverter:M,JsonTools:J,TextEncoder,TextDecoder,Promise,self:{postMessage:m=>messages.push(m)},importScripts(...paths){for(const p of paths)assert.ok(!/^https?:/.test(p));}};vm.createContext(context);vm.runInContext(fs.readFileSync('shared/json-worker.js','utf8'),context);let id=0;return async(action,options={})=>{context.self.onmessage({data:{id:++id,action,options}});for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));const r=messages.find(m=>m.id===id);if(r.error)throw Error(r.error);return r.result;};}
test('worker edits require preview, undo and redo restore exact values, invalid loads clear old documents',async()=>{
 const w=worker();await w('load',{text:'{"a":9007199254740993}'});assert.equal((await w('previewEdit',{pointer:'/a',operation:'replace',text:'9007199254740995'})).total,1);
 assert.match((await w('export',{target:'document'})).text,/9007199254740993/);await w('applyEdit');assert.match((await w('export',{target:'document'})).text,/9007199254740995/);await w('undo');assert.match((await w('export',{target:'document'})).text,/9007199254740993/);await w('redo');assert.match((await w('export',{target:'document'})).text,/9007199254740995/);
 await assert.rejects(w('load',{text:'bad'}));await assert.rejects(w('export',{target:'document'}),/Load/);
});
test('tree pagination and record export include all matches beyond the preview',async()=>{
 const w=worker();await w('load',{text:JSON.stringify(Array.from({length:150},(_,i)=>({id:i,name:'Item '+i})))});const t=await w('tree',{pointer:''});assert.equal(t.children.length,100);assert.equal((await w('tree',{pointer:'',offset:100})).children.length,50);await w('select',{path:[]});const r=await w('filter',{search:'Item'});assert.equal(r.preview.length,100);assert.equal(r.count,150);assert.equal(JSON.parse((await w('export',{format:'json',columns:[0],originals:true})).text).length,150);
});

test('invalid schemas and imprecise schema bounds cannot silently pass validation',async()=>{
 const L=await libs(),v=J.parse('{"name":"Asha"}');for(const schema of ['{"type":"not-a-type"}','{"minLength":"five"}','{"minimum":9007199254740993}'])assert.throws(()=>L.validate(v,schema,M,J),/schema|precision/i);
});
test('workbench loads documents with more than 100 table collections',async()=>{
 const w=worker();await w('load',{text:JSON.stringify(Object.fromEntries(Array.from({length:150},(_,i)=>['collection'+i,[]])))});assert.equal((await w('tree',{pointer:''})).total,150);
});

test('new pages use local scripts and text-only rendering, and packaged libraries need no runtime network or code evaluation',()=>{
 for(const slug of ['json-explorer','json-workbench']){const html=fs.readFileSync(slug+'/index.html','utf8');assert.doesNotMatch(html,/<style\b|\sstyle=|\son\w+=|<script(?![^>]*\bsrc=)/i);assert.doesNotMatch(fs.readFileSync(slug+'/app.js','utf8'),/innerHTML|\.insertAdjacentHTML|localStorage|sessionStorage/);}
 for(const file of ['shared/parquet-bundle.js','shared/workbench-bundle.js'])assert.doesNotMatch(fs.readFileSync(file,'utf8'),/\bfetch\s*\(|\beval\s*\(|new Function\s*\(|WebAssembly/);
});

test('inspecting an absent JSON Pointer reports a clear error while null remains inspectable',async()=>{
  const w=worker();await w('load',{text:'{"present":null}'});await assert.rejects(w('value',{pointer:'/absent'}),/does not identify an existing value/);assert.equal((await w('value',{pointer:'/present'})).text,'null');
});
