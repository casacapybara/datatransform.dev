const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const M = require('../csv-to-json/model.js');
function harness(protocol = 'https:') {
  const nodes = new Map(), timers = new Map(), workers = [], downloads = [], blobs = [], events = []; let nextTimer = 0;
  function element() { return {value:'',checked:false,disabled:false,hidden:false,textContent:'',files:[],children:[],listeners:{},attrs:{},classList:{toggle(){}},
    addEventListener(event,fn){this.listeners[event]=fn;},replaceChildren(...children){this.children=children;},appendChild(child){this.children.push(child);},setAttribute(k,v){this.attrs[k]=v;},remove(){},click(){downloads.push(this.download);}}; }
  const node = id => { if (!nodes.has(id)) nodes.set(id,element()); return nodes.get(id); };
  for (const [id,value] of Object.entries({fieldsColumn:'fields',arrayName:'data',outputMode:'json',indentSize:'2'})) node(id).value=value;
  node('trimValues').checked=node('omitEmpty').checked=true;
  class WorkerMock {
    constructor(path){assert.equal(path,'../csv-to-json/converter-worker.js');this.messages=[];workers.push(this);}
    postMessage(message){this.messages.push(message);}
    terminate(){this.terminated=true;}
    step(){const {id,options}=this.messages.shift();let message;try{message={id,result:M.convert(options)};}catch(error){message={id,error:error.message};}this.onmessage({data:message});}
  }
  const context={window:{CsvToJson:M,DataTransformEvents:{emit:(...args)=>events.push(args)}},location:{protocol},Worker:WorkerMock,
    document:{getElementById:node,createElement:element,body:element()},TextDecoder,TextEncoder,Blob,
    navigator:{clipboard:{writeText:async text=>{context.copied=text;}}},URL:{createObjectURL:blob=>{blobs.push(blob);return 'blob:test';},revokeObjectURL(){}},
    setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('csv-to-json/app.js','utf8'),context);
  const h={node,context,workers,downloads,blobs,events,click:id=>node(id).listeners.click(),
    type(id,value){node(id).value=value;return node(id).listeners.input();},change(id,value){if(typeof value==='boolean')node(id).checked=value;else node(id).value=value;return node(id).listeners.change();},
    flush(ms){for(const [id,t] of [...timers])if(t.ms===ms){timers.delete(id);t.fn();}},
    drain(){if(protocol==='file:')h.flush(0);else {const w=workers.at(-1);if(w&&!w.terminated&&w.messages.length)w.step();}},
    convert(text){h.type('csvInput',text);h.click('convertBtn');h.drain();},
    file(file){node('csvFile').files=[file];return node('csvFile').listeners.change();}};
  return h;
}
const bytes = text => new TextEncoder().encode(text).buffer;
test('source edits immediately clear and disable stale exports', async () => {
  const h=harness();h.convert('id\nold');assert.equal(h.node('copyBtn').disabled,false);
  h.type('csvInput','id\nnew');assert.equal(h.node('copyBtn').disabled,true);assert.equal(h.node('output').textContent,'');
  await h.click('copyBtn');h.click('downloadBtn');assert.equal(h.context.copied,undefined);assert.deepEqual(h.downloads,[]);
  h.click('convertBtn');h.drain();await h.click('copyBtn');assert.equal(JSON.parse(h.context.copied)[0].id,'new');
});
test('Clear, edits, examples and replacement cancel pending file reads and failures', async () => {
  for (const action of ['clear','edit','example','replace']) {
    const h=harness();let finish;
    const old=h.file({name:'old.csv',size:10,arrayBuffer:()=>new Promise(resolve=>finish=resolve)});
    assert.equal(h.node('convertBtn').disabled,true);
    if(action==='clear')h.click('clearBtn');
    if(action==='edit')h.type('csvInput','id\nnew');
    if(action==='example'){h.click('exampleBtn');h.drain();}
    if(action==='replace'){await h.file({name:'new.csv',size:10,arrayBuffer:async()=>bytes('id\nnew')});h.drain();}
    const expected=h.node('csvInput').value, result=h.node('output').textContent;
    finish(bytes('id\nold'));await old;assert.equal(h.node('csvInput').value,expected);assert.equal(h.node('output').textContent,result);
  }
  const h=harness();let reject;const pending=h.file({name:'bad.csv',size:1,arrayBuffer:()=>new Promise((_,r)=>reject=r)});
  h.click('exampleBtn');h.drain();const status=h.node('status').textContent;reject(Error('late'));await pending;assert.equal(h.node('status').textContent,status);
});
test('file reads use current settings and reject oversized, invalid UTF-8 and failed replacements', async () => {
  const h=harness();let finish;const pending=h.file({name:'test.csv',size:10,arrayBuffer:()=>new Promise(resolve=>finish=resolve)});
  h.change('outputMode','js');h.type('arrayName','class');finish(bytes('id\n001'));await pending;h.drain();assert.match(h.node('output').textContent,/^const _class = /);
  await h.file({name:'large.csv',size:M.LIMITS.bytes+1,arrayBuffer:()=>{throw Error('must not read');}});assert.match(h.node('status').textContent,/5 MiB/);assert.equal(h.node('copyBtn').disabled,true);assert.equal(h.node('csvInput').value,'');
  await h.file({name:'invalid.csv',size:1,arrayBuffer:async()=>new Uint8Array([255]).buffer});assert.match(h.node('status').textContent,/UTF-8/);
});
test('settings invalidate in-flight workers and only the latest result can return', () => {
  const h=harness();h.type('csvInput','id\n001');h.click('convertBtn');const old=h.workers.at(-1);
  h.change('outputMode','js');old.step();assert.equal(h.node('copyBtn').disabled,true);assert.equal(h.node('output').textContent,'');
  h.flush(150);h.drain();assert.match(h.node('output').textContent,/^const data = /);
  h.type('csvInput','id\nnew');h.click('convertBtn');const next=h.workers.at(-1);h.click('clearBtn');next.step();assert.equal(h.node('output').textContent,'');
});
test('bad conversions, missing split columns and worker failures cannot export previous results', () => {
  const h=harness();h.convert('id\n001');h.convert('id\nAl"ice"');assert.equal(h.node('downloadBtn').disabled,true);assert.match(h.node('status').textContent,/quote/);
  h.convert('id\n001');h.change('splitFields',true);h.flush(150);h.drain();assert.match(h.node('status').textContent,/No column/);assert.equal(h.node('output').textContent,'');
  h.change('splitFields',false);h.flush(150);h.workers.at(-1).onerror();assert.match(h.node('status').textContent,/Background processing/);assert.equal(h.node('copyBtn').disabled,true);
  h.click('convertBtn');h.flush(20000);assert.equal(h.workers.at(-1).terminated,true);assert.match(h.node('status').textContent,/20 seconds/);
});
test('both formats copy and download full output beyond the preview limit with matching MIME types', async () => {
  const h=harness();h.convert('id,note\n'+Array.from({length:500},(_,i)=>`${i},${'x'.repeat(100)}`).join('\n'));
  for(const format of ['json','js']) {
    h.change('outputMode',format);h.flush(150);h.drain();assert.match(h.node('output').textContent,/Preview truncated/);
    await h.click('copyBtn');assert.ok(h.context.copied.length>50000);assert.doesNotMatch(h.context.copied,/Preview truncated/);
    h.click('downloadBtn');assert.equal(h.downloads.at(-1),`converted-data.${format}`);assert.equal(await h.blobs.at(-1).text(),h.context.copied);
    assert.match(h.blobs.at(-1).type,format==='json'?/application\/json/:/text\/javascript/);
  }
});
test('clipboard failures preserve downloads and late clipboard completions preserve current status', async () => {
  const h=harness();h.convert('id\n001');h.context.navigator.clipboard.writeText=async()=>{throw Error('denied');};await h.click('copyBtn');assert.match(h.node('status').textContent,/Download/);assert.equal(h.node('downloadBtn').disabled,false);
  for(const rejection of [false,true]) {
    let finish;h.context.navigator.clipboard.writeText=()=>new Promise((resolve,reject)=>finish=()=>rejection?reject(Error('late')):resolve());
    const pending=h.click('copyBtn');h.type('csvInput','id\nnew');const status=h.node('status').textContent;finish();await pending;assert.equal(h.node('status').textContent,status);
    h.click('convertBtn');h.drain();
  }
});
test('empty results, clear and option visibility have explicit states', () => {
  const h=harness();assert.equal(h.node('copyBtn').disabled,true);assert.equal(h.node('arrayNameGroup').hidden,true);assert.equal(h.node('fieldsColumn').disabled,true);
  h.convert('id,name');assert.equal(h.node('output').textContent,'[]');assert.match(h.node('stats').textContent,/0 rows · 2 columns/);assert.equal(h.node('downloadBtn').disabled,false);
  h.click('exampleBtn');h.drain();assert.match(h.node('output').textContent,/Chloé/);assert.equal(h.node('fieldsColumn').disabled,false);
  h.click('clearBtn');assert.equal(h.node('csvInput').value,'');assert.equal(h.node('output').textContent,'');assert.equal(h.node('fieldsColumn').disabled,true);
  for(const [name,metadata,tool] of h.events){assert.equal(tool,'csv-to-json');assert.deepEqual(Object.keys(metadata),[]);assert.ok(name==='tool_opened'||name.startsWith('conversion_'));}
});
test('local-file fallback and real worker entry use the shared conversion implementation', () => {
  const h=harness('file:');h.convert('__proto__,id\nsafe,001');assert.equal(h.workers.length,0);assert.equal(JSON.parse(h.node('output').textContent)[0].__proto__,'safe');
  const messages=[];const context={CsvToJson:M,self:{postMessage:message=>messages.push(message)},importScripts(...paths){assert.deepEqual(paths,['../csv-search-filter-transform/model.js','model.js']);}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('csv-to-json/converter-worker.js','utf8'),context);
  context.self.onmessage({data:{id:1,options:{text:'id\n001'}}});assert.equal(JSON.parse(messages.at(-1).result.text)[0].id,'001');
  context.self.onmessage({data:{id:2,options:{text:'id\n"bad'}}});assert.equal(messages.at(-1).id,2);assert.match(messages.at(-1).error,/unclosed/);
});
