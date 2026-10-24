const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const M=require('../extract-from-text/model.js'), C=require('../data-file-converter/model.js'), X=require('../data-file-converter/vendor/xlsx.full.min.js');
function harness(protocol='https:') {
  const nodes=new Map(),timers=new Map(),workers=[],downloads=[],events=[];let timerId=0;
  function element(){return {value:'',textContent:'',checked:false,disabled:false,hidden:false,children:[],listeners:{},files:[],classList:{toggle(){}},
    set id(id){this._id=id;nodes.set(id,this);},get id(){return this._id;},addEventListener(name,fn){this.listeners[name]=fn;},setAttribute(){},append(...els){this.children.push(...els);},replaceChildren(...els){this.children=els;},focus(){},remove(){},click(){if(this.listeners.click)return this.listeners.click();downloads.push(this.download);}};}
  function node(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);}
  for(const [id,value]of Object.entries({mode:'email',outputFormat:'csv',separator:':',captureGroup:'0'}))node(id).value=value;
  for(const id of ['unique','ignoreCase','protect'])node(id).checked=true;
  class WorkerMock{
    constructor(){this.messages=[];const context={TextExtractor:M,self:{postMessage:r=>this.reply=r},importScripts(){}};vm.createContext(context);vm.runInContext(fs.readFileSync('extract-from-text/extract-worker.js','utf8'),context);this.engine=context.self;workers.push(this);}
    postMessage(message){this.messages.push(message);}
    terminate(){this.terminated=true;}
    step(){const message=this.messages.shift();if(!message)return;this.engine.onmessage({data:message});const reply=this.reply;this.onmessage({data:reply});return reply;}
  }
  const context={window:{TextExtractor:M,DataConverter:C,XLSX:X,Worker:WorkerMock,addEventListener(){},DataTransformEvents:{emit:(...args)=>events.push(args)}},Worker:WorkerMock,location:{protocol},document:{getElementById:node,createElement:element,body:element()},TextEncoder,TextDecoder,navigator:{clipboard:{writeText:async text=>context.copied=text}},Blob,URL:{createObjectURL:()=> 'blob:local',revokeObjectURL(){}},setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('extract-from-text/app.js','utf8'),context);
  const h={node,context,workers,downloads,events,timers,click(id){return node(id).listeners.click();},change(id,value){node(id).value=value;return node(id).listeners.change();},input(id,value){node(id).value=value;return node(id).listeners.input();},load(text,format='csv'){node('inputText').value=text;node('inputFormat').value=format;h.click('loadText');},file(file){node('inputFile').files=[file];return node('inputFile').listeners.change();},flush(ms=0){for(const [id,t]of [...timers])if(t.ms===ms){timers.delete(id);t.fn();}},drain(){for(let i=0;i<15;i++){const w=workers.at(-1);if(w&&!w.terminated&&w.messages.length)w.step();else if(protocol==='file:'&&[...timers.values()].some(t=>t.ms===0))h.flush();else break;}}};return h;
}
test('all preset examples run and their copies match full previews and named downloads',async()=>{
 const h=harness();for(const mode of ['email','url','label','pattern']){h.change('mode',mode);h.click('example');h.drain();assert.equal(h.node('download').disabled,false);for(const format of ['csv','tsv','json','txt','md','items']){h.change('outputFormat',format);h.drain();await h.click('copy');assert.equal(h.context.copied,h.node('textPreview').textContent);h.click('download');assert.ok(h.downloads.at(-1).endsWith('.'+(format==='items'?'txt':format)));}h.change('outputFormat','csv');}
 h.click('reset');assert.equal(h.node('download').disabled,true);assert.equal(h.node('inputText').value,'');
});
test('edits, cancelled workers, stale messages and processing deadlines never expose old output',()=>{
 const h=harness();h.click('example');h.drain();const old=h.workers.at(-1);h.input('inputText','new@example.test');assert.equal(old.terminated,true);assert.equal(h.node('textPreview').textContent,'');h.click('run');h.click('cancel');h.drain();assert.equal(h.node('download').disabled,true);
 h.click('run');h.flush(2000);assert.equal(h.workers.at(-1).terminated,true);assert.match(h.node('runStatus').textContent,/exceeded 2 seconds/);assert.equal(h.node('inputText').value,'new@example.test');
});
test('invalid patterns fail safely and match-list previews do not truncate copied output',async()=>{
 const h=harness();h.change('mode','pattern');h.input('pattern','[');h.input('inputText','anything');h.click('run');h.drain();assert.match(h.node('runStatus').textContent,/invalid/);assert.equal(h.node('download').disabled,true);
 h.change('mode','email');h.input('inputText',Array.from({length:150},(_,i)=>`person${i}@example.test`).join('\n'));h.click('run');h.drain();await h.click('copy');assert.equal(C.delimited(h.context.copied,',').length,151);assert.equal(h.node('resultTable').children[0].children[1].children.length,100);
 h.context.navigator.clipboard.writeText=async()=>{throw Error('denied');};await h.click('copy');assert.match(h.node('exportStatus').textContent,/Copy failed/);assert.equal(h.node('download').disabled,false);
});
test('file reads load only UTF-8 text and cannot replace a newer example or edit',async()=>{
 const h=harness();await h.file({size:16,name:'text.txt',arrayBuffer:async()=>new TextEncoder().encode('x@example.test').buffer});h.click('run');h.drain();assert.equal(h.node('download').disabled,false);
 let finish;const p=h.file({size:10,arrayBuffer:()=>new Promise(r=>finish=r)});h.click('example');h.drain();finish(new TextEncoder().encode('old').buffer);await p;assert.match(h.node('inputText').value,/asha@example.test/);
 await h.file({size:M.LIMITS.bytes+1,arrayBuffer:()=>{throw Error('must not read');}});assert.equal(h.node('download').disabled,true);assert.match(h.node('loadStatus').textContent,/exceeds/);
 await h.file({size:1,arrayBuffer:async()=>new Uint8Array([255]).buffer});assert.match(h.node('loadStatus').textContent,/UTF-8/);
});
test('a completed file read invalidates any extraction started while the file was still reading',async()=>{
 const h=harness();let finish;const p=h.file({size:20,arrayBuffer:()=>new Promise(r=>finish=r)});h.click('run');h.drain();assert.equal(h.node('download').disabled,false);finish(new TextEncoder().encode('new@example.test').buffer);await p;assert.equal(h.node('download').disabled,true);assert.equal(h.node('textPreview').textContent,'');assert.equal(h.node('inputText').value,'new@example.test');
});
test('changing export format while extraction is pending keeps the run active and uses the latest format',()=>{
 const h=harness();h.input('inputText','x@example.test');h.click('run');h.change('outputFormat','json');h.drain();assert.equal(h.node('run').disabled,false);assert.equal(h.node('download').disabled,false);assert.equal(JSON.parse(h.node('textPreview').textContent)[0].Value,'x@example.test');
});
test('long extraction copies retain every match beyond the formatted-text preview limit',async()=>{
 const h=harness();h.input('inputText',Array.from({length:500},(_,i)=>`person${i}${'x'.repeat(75)}@example.test`).join('\n'));h.click('run');h.drain();await h.click('copy');assert.ok(h.context.copied.length>30000);assert.ok(h.node('textPreview').textContent.startsWith(h.context.copied.slice(0,30000)));assert.match(h.node('textPreview').textContent,/Preview truncated/);assert.equal(C.delimited(h.context.copied,',').length,501);h.input('inputText','changed');assert.equal(h.node('textPreview').textContent,'');
});
