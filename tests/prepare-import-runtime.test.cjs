const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const M=require('../prepare-import/model.js'), C=require('../data-file-converter/model.js'), X=require('../data-file-converter/vendor/xlsx.full.min.js');
function harness(protocol='https:') {
  const nodes=new Map(),timers=new Map(),workers=[],downloads=[],events=[];let timerId=0;
  function element(){return {value:'',textContent:'',checked:false,disabled:false,hidden:false,children:[],listeners:{},files:[],classList:{toggle(){}},
    set id(id){this._id=id;nodes.set(id,this);},get id(){return this._id;},addEventListener(name,fn){this.listeners[name]=fn;},setAttribute(){},append(...els){this.children.push(...els);},replaceChildren(...els){this.children=els;},focus(){},remove(){},click(){downloads.push(this.download);}};}
  function node(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);}
  for(const [id,value]of Object.entries({inputFormat:'auto',reportView:'data',excelValues:'display',outputFormat:'csv',templateFormat:'csv'}))node(id).value=value;
  for(const id of ['hasHeader'])node(id).checked=true;
  class WorkerMock{
    constructor(){this.messages=[];this.engine=M.session(X);workers.push(this);}
    postMessage(message){this.messages.push(message);}
    terminate(){this.terminated=true;}
    step(){const message=this.messages.shift();if(!message)return;let reply={id:message.id,action:message.action};try{reply.result=this.engine[message.action](message.options);}catch(e){reply.error=e.message;}this.onmessage({data:reply});return reply;}
  }
  const context={window:{ImportPreparer:M,DataConverter:C,XLSX:X,Worker:WorkerMock,addEventListener(){},DataTransformEvents:{emit:(...args)=>events.push(args)}},Worker:WorkerMock,location:{protocol},document:{getElementById:node,createElement:element,body:element()},navigator:{clipboard:{writeText:async text=>context.copied=text}},Blob,URL:{createObjectURL:()=> 'blob:local',revokeObjectURL(){}},setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('prepare-import/app.js','utf8'),context);
  const h={node,context,workers,downloads,events,timers,click(id){return node(id).listeners.click();},change(id,value){node(id).value=value;return node(id).listeners.change();},input(id,value){node(id).value=value;return node(id).listeners.input();},load(text,format='csv'){node('inputText').value=text;node('inputFormat').value=format;h.click('loadText');},file(file){node('inputFile').files=[file];return node('inputFile').listeners.change();},flush(ms=0){for(const [id,t]of [...timers])if(t.ms===ms){timers.delete(id);t.fn();}},drain(){for(let i=0;i<15;i++){const w=workers.at(-1);if(w&&!w.terminated&&w.messages.length)w.step();else if(protocol==='file:'&&[...timers.values()].some(t=>t.ms===0))h.flush();else break;}}};return h;
}

test('example maps renamed columns, converts values, fills defaults and clears both inputs',async()=>{
 const h=harness();h.click('example');h.drain();assert.equal(h.node('download').disabled,false);await h.click('copy');assert.match(h.context.copied,/001,alice@example.test,2026-10-18,active/);assert.equal(h.node('textPreview').textContent,h.context.copied);h.click('download');assert.deepEqual(h.downloads,['prepared-import.csv']);h.click('reset');assert.equal(h.node('templateText').value,'');assert.equal(h.node('download').disabled,true);assert.equal(h.node('textPreview').textContent,'');
});
test('missing required fields block export and report includes every issue',async()=>{
 const h=harness();h.click('example');h.drain();h.change('source-1','');assert.equal(h.node('download').disabled,true);h.click('run');h.drain();assert.equal(h.node('download').disabled,true);assert.match(h.node('exportStatus').textContent,/2 issues/);h.change('reportView','issues');h.drain();await h.click('copy');assert.equal(C.delimited(h.context.copied,',').length,3);h.click('download');assert.deepEqual(h.downloads,['import-issues.csv']);
 h.input('default-1','fallback@example.test');assert.equal(h.node('download').disabled,true);h.change('reportView','data');h.click('run');h.drain();assert.equal(h.node('download').disabled,false);
});
test('mapping edits and template edits reject pending stale results',()=>{
 const h=harness();h.click('example');h.drain();h.click('run');h.input('default-3','pending');h.drain();assert.equal(h.node('download').disabled,true);h.click('run');h.drain();assert.equal(h.node('download').disabled,false);h.input('templateText','id,id');h.click('loadTemplate');assert.match(h.node('templateStatus').textContent,/unique/);assert.equal(h.node('run').disabled,true);assert.equal(h.node('textPreview').textContent,'');
});
test('template can load while source loading and auto-mapping waits for both',()=>{
 const h=harness();h.load('id,name\n001,Alice');h.input('templateText','name,id');h.click('loadTemplate');h.drain();assert.equal(h.node('run').disabled,false);assert.equal(h.node('source-0').value,'1');h.click('run');h.drain();assert.equal(h.node('download').disabled,false);
});
test('full CSV and TSV output exceed table and text previews',async()=>{
 const h=harness();h.load('id,name\n'+Array.from({length:200},(_,i)=>i+','+'a'.repeat(200)).join('\n'));h.drain();h.input('templateText','name,id');h.click('loadTemplate');h.click('run');h.drain();
 for(const format of ['csv','tsv']){h.change('outputFormat',format);h.drain();await h.click('copy');assert.equal(C.delimited(h.context.copied,format==='tsv'?'\t':',').length,201);assert.equal(h.node('textPreview').textContent,h.context.copied.slice(0,30000)+'\n… Preview truncated; download or copy for the complete output.');assert.ok(h.context.copied.length>30000);h.click('download');assert.ok(h.downloads.at(-1).endsWith('.'+format));}
 h.context.navigator.clipboard.writeText=async()=>{throw Error('denied');};await h.click('copy');assert.match(h.node('exportStatus').textContent,/Copy failed/);assert.equal(h.node('download').disabled,false);
});
test('late source and template file reads cannot overwrite reset or a newer input',async()=>{
 const h=harness();let finish;const pending=h.file({size:10,name:'old.csv',arrayBuffer:()=>new Promise(r=>finish=r)});h.click('example');h.drain();finish(new TextEncoder().encode('id\nold').buffer);await pending;assert.match(h.node('loadStatus').textContent,/fictional/);
 let finishTemplate;h.node('templateFile').files=[{size:10,name:'old.tsv',arrayBuffer:()=>new Promise(r=>finishTemplate=r)}];const pendingTemplate=h.node('templateFile').listeners.change();h.click('reset');finishTemplate(new TextEncoder().encode('old').buffer);await pendingTemplate;assert.equal(h.node('templateText').value,'');assert.equal(h.node('run').disabled,true);
});
test('worker timeout cancels processing and local-file mode uses identical model',async()=>{
 const h=harness();h.click('example');h.flush(20000);assert.equal(h.workers.at(-1).terminated,true);assert.equal(h.node('download').disabled,true);assert.match(h.node('loadStatus').textContent,/20 seconds/);
 const local=harness('file:');local.click('example');local.drain();await local.click('copy');assert.match(local.context.copied,/alice@example.test/);assert.equal(local.workers.length,0);
});
test('worker imports only bundled dependencies and handles invalid actions',()=>{
 const messages=[],context={ImportPreparer:M,XLSX:X,self:{postMessage:m=>messages.push(m)},importScripts(...paths){assert.deepEqual(paths,['../data-file-converter/vendor/xlsx.full.min.js','../data-file-converter/model.js','../data-cleaner/model.js','../data-quality-checker/model.js','model.js']);}};vm.createContext(context);vm.runInContext(fs.readFileSync('prepare-import/import-worker.js','utf8'),context);context.self.onmessage({data:{id:1,action:'unknown'}});assert.match(messages[0].error,/Unknown import/);
});
