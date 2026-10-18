const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs=require('node:fs'), vm=require('node:vm');
const M=require('../data-file-converter/model.js'), X=require('../data-file-converter/vendor/xlsx.full.min.js');
function harness(protocol='https:') {
  const nodes=new Map(), timers=new Map(), workers=[], downloads=[], events=[];let timerId=0;
  function element(){return {value:'',textContent:'',checked:false,disabled:false,hidden:false,children:[],listeners:{},files:[],classList:{toggle(){}},
    set id(id){this._id=id;nodes.set(id,this);},get id(){return this._id;},addEventListener(name,fn){this.listeners[name]=fn;},setAttribute(){},append(...els){this.children.push(...els);},replaceChildren(...els){this.children=els;},remove(){},click(){downloads.push(this.download);}};}
  const node=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  for(const [id,value]of Object.entries({inputFormat:'auto',outputFormat:'csv',excelValues:'display'}))node(id).value=value;
  node('hasHeader').checked=node('protect').checked=true;
  class WorkerMock {
    constructor(){this.messages=[];this.engine=M.engine(X);workers.push(this);}
    postMessage(message){this.messages.push(message);}
    terminate(){this.terminated=true;}
    step(){const message=this.messages.shift();if(!message)return;let reply={id:message.id,action:message.action};try{reply.result=this.engine[message.action](message.options);}catch(e){reply.error=e.message;}this.onmessage({data:reply});return reply;}
  }
  const context={window:{DataConverter:M,XLSX:X,Worker:WorkerMock,addEventListener(){},DataTransformEvents:{emit:(...args)=>events.push(args)}},Worker:WorkerMock,location:{protocol},document:{getElementById:node,createElement:element,body:element()},navigator:{clipboard:{writeText:async text=>context.copied=text}},Blob,URL:{createObjectURL:()=> 'blob:local',revokeObjectURL(){}},setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('data-file-converter/app.js','utf8'),context);
  const h={node,context,workers,downloads,events,timers,click(id){return node(id).listeners.click();},change(id,value){node(id).value=value;return node(id).listeners.change();},load(text,format='csv'){node('inputText').value=text;node('inputFormat').value=format;h.click('loadText');},file(file){node('inputFile').files=[file];return node('inputFile').listeners.change();},flush(ms=120){for(const [id,t]of [...timers])if(t.ms===ms){timers.delete(id);t.fn();}},drain(){for(let i=0;i<10;i++){const worker=workers.at(-1);if(worker&&!worker.terminated&&worker.messages.length)worker.step();else if(protocol==='file:'&&[...timers.values()].some(t=>t.ms===0))h.flush(0);else break;}}};return h;
}
test('worker load, field projection and Markdown export update the visible result and full copy', async()=>{
  const h=harness();h.load('id,name,note\n001,Asha,"A|B\nC"');h.drain();assert.equal(h.node('download').disabled,false);
  h.change('outputFormat','md');assert.equal(h.node('download').disabled,true);h.flush();h.drain();assert.match(h.node('textPreview').textContent,/A\\\|B<br>C/);assert.equal(h.node('protectGroup').hidden,true);
  h.node('field-2').checked=false;h.node('field-2').listeners.change();h.flush();h.drain();assert.doesNotMatch(h.node('textPreview').textContent,/note/);
  await h.click('copy');assert.equal(h.context.copied,'| id | name |\n| --- | --- |\n| 001 | Asha |');h.click('download');assert.deepEqual(h.downloads,['converted-data.md']);
});
test('output preference changes during load and data selection do not lose pending replies',()=>{
  const h=harness();h.load('id\n001');h.change('outputFormat','md');h.workers.at(-1).step();h.change('outputFormat','json');h.drain();assert.equal(h.node('download').disabled,false);assert.equal(JSON.parse(h.node('textPreview').textContent)[0].id,'001');
});
test('source edits invalidate results and reset or replacement cancels older file reads',async()=>{
  const h=harness();h.load('id\nold');h.drain();h.node('inputText').value='id\nnew';h.node('inputText').listeners.input();assert.equal(h.node('download').disabled,true);assert.equal(h.node('textPreview').textContent,'');
  let finish;const pending=h.file({size:10,name:'old.csv',arrayBuffer:()=>new Promise(resolve=>finish=resolve)});h.load('id\nnew');h.drain();finish(new TextEncoder().encode('id\nlate').buffer);await pending;assert.match(h.node('textPreview').textContent,/new/);assert.doesNotMatch(h.node('textPreview').textContent,/late/);
  const second=h.file({size:10,name:'old.csv',arrayBuffer:()=>new Promise(resolve=>finish=resolve)});h.click('reset');finish(new TextEncoder().encode('id\nlate').buffer);await second;assert.equal(h.node('download').disabled,true);
});
test('stale worker responses and earlier conversions cannot restore outdated exports',()=>{
  const h=harness();h.load('id\nold');const old=h.workers.at(-1);h.click('reset');old.step();assert.equal(h.node('download').disabled,true);
  h.load('id\nnew');h.workers.at(-1).step();h.workers.at(-1).step(); // leave initial export queued
  h.change('outputFormat','md');h.workers.at(-1).step();assert.equal(h.node('download').disabled,true);h.flush();h.drain();assert.match(h.node('textPreview').textContent,/\| new \|/);
});
test('invalid loads, excluded fields and invalid collection choices disable stale copy and download',async()=>{
  const h=harness();h.load('id\n001');h.drain();h.click('noFields');h.flush();h.drain();assert.equal(h.node('download').disabled,true);await h.click('copy');assert.equal(h.context.copied,undefined);
  h.load('id,name\nBad');h.drain();assert.match(h.node('loadStatus').textContent,/No data is loaded/);assert.equal(h.node('textPreview').textContent,'');
  h.load('{"a":[1],"b":[2]}','json');h.drain();assert.match(h.node('dataStatus').textContent,/Choose the JSON collection/);h.change('jsonCollection','["b"]');h.drain();assert.equal(h.node('download').disabled,false);
});
test('worksheet replacement, Excel export and unsupported file reads have explicit states',async()=>{
  const h=harness();const b=X.utils.book_new();X.utils.book_append_sheet(b,X.utils.aoa_to_sheet([['id'],['001']]),'First');X.utils.book_append_sheet(b,X.utils.aoa_to_sheet([['id'],['002']]),'Second');const bytes=X.write(b,{type:'array',bookType:'xlsx'});
  await h.file({size:bytes.byteLength,name:'sample.xlsx',arrayBuffer:async()=>bytes});h.drain();assert.match(h.node('textPreview').textContent,/001/);
  h.change('worksheet','Second');h.drain();assert.match(h.node('textPreview').textContent,/002/);h.change('outputFormat','xlsx');h.flush();h.drain();assert.equal(h.node('copy').hidden,true);assert.equal(h.node('download').disabled,false);h.click('download');assert.deepEqual(h.downloads,['converted-data.xlsx']);
  await h.file({size:M.LIMITS.bytes+1,name:'too-big.csv',arrayBuffer:()=>{throw Error('must not read');}});assert.match(h.node('loadStatus').textContent,/5 MiB/);assert.equal(h.node('download').disabled,true);
});
test('worker timeout and worker errors cancel processing without stale results',()=>{
  const h=harness();h.load('id\nx');h.flush(20000);assert.equal(h.workers.at(-1).terminated,true);assert.match(h.node('loadStatus').textContent,/20 seconds/);assert.equal(h.node('download').disabled,true);
  h.load('id\ny');h.workers.at(-1).onerror();assert.match(h.node('loadStatus').textContent,/Background processing stopped/);assert.equal(h.node('download').disabled,true);
});
test('local file fallback uses the same conversion engine without workers',()=>{
  const h=harness('file:');h.load('id\n001');h.drain();assert.equal(h.workers.length,0);assert.match(h.node('processingNote').textContent,/Local-file mode/);assert.match(h.node('textPreview').textContent,/001/);
});
test('clipboard failures leave downloads available and event metadata stays empty',async()=>{
  const h=harness();h.load('id\n001');h.drain();h.context.navigator.clipboard.writeText=async()=>{throw Error('denied');};await h.click('copy');assert.match(h.node('exportStatus').textContent,/Copy failed/);assert.equal(h.node('download').disabled,false);
  for(const [name,metadata,tool]of h.events){assert.equal(tool,'data-file-converter');assert.equal(Object.keys(metadata).length,0);assert.ok(name==='tool_opened'||name.startsWith('conversion_'));}
});
test('copy and download retain complete output beyond both preview limits',async()=>{
  const h=harness(), text='id,note\n'+Array.from({length:500},(_,i)=>String(i)+','+'x'.repeat(100)).join('\n');h.load(text);h.drain();
  assert.ok(h.node('textPreview').textContent.length<31000);assert.match(h.node('textPreview').textContent,/Preview truncated/);await h.click('copy');
  assert.equal(h.context.copied.split('\r\n').length,501);assert.ok(h.context.copied.length>50000);
});
test('real worker entry point loads only local dependencies and returns errors without stale exports',()=>{
  const messages=[];const context={DataConverter:M,XLSX:X,self:{postMessage:message=>messages.push(message)},importScripts(...paths){assert.deepEqual(paths,['vendor/xlsx.full.min.js','model.js']);}};vm.createContext(context);vm.runInContext(fs.readFileSync('data-file-converter/converter-worker.js','utf8'),context);
  context.self.onmessage({data:{id:1,action:'load',options:{text:'id\n001',format:'csv'}}});context.self.onmessage({data:{id:2,action:'select',options:{hasHeader:true}}});context.self.onmessage({data:{id:3,action:'export',options:{columns:[0],format:'md'}}});assert.match(messages.at(-1).result.text,/001/);
  context.self.onmessage({data:{id:4,action:'select',options:{hasHeader:false}}});context.self.onmessage({data:{id:5,action:'export',options:{columns:[],format:'csv'}}});assert.match(messages.at(-1).error,/at least one/);
});

test('every text format copies the full selected output and downloads with its extension',async()=>{
  const h=harness();h.click('example');h.drain?.();
  for(const format of ['csv','json','txt','md']){
    h.change('outputFormat',format);h.flush();h.drain();
    assert.equal(h.node('copy').disabled,false);
    await h.click('copy');assert.ok(h.context.copied.length>0);assert.equal(h.node('textPreview').textContent,h.context.copied);
    if(format==='json')assert.ok(Array.isArray(JSON.parse(h.context.copied)));
    if(format==='md')assert.match(h.context.copied,/\| ---/);
    h.click('download');assert.ok(h.downloads.at(-1).endsWith('.'+format));
  }
});
