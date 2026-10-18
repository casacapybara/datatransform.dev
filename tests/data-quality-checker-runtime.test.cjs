const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const M=require('../data-quality-checker/model.js'), C=require('../data-file-converter/model.js'), X=require('../data-file-converter/vendor/xlsx.full.min.js');
function harness(protocol='https:') {
  const nodes=new Map(),timers=new Map(),workers=[],downloads=[],events=[];let timerId=0;
  function element(){return {value:'',textContent:'',checked:false,disabled:false,hidden:false,children:[],listeners:{},files:[],classList:{toggle(){}},
    set id(id){this._id=id;nodes.set(id,this);},get id(){return this._id;},addEventListener(name,fn){this.listeners[name]=fn;},setAttribute(){},append(...els){this.children.push(...els);},replaceChildren(...els){this.children=els;},focus(){},remove(){},click(){downloads.push(this.download);}};}
  function node(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);}
  for(const [id,value]of Object.entries({inputFormat:'auto',reportView:'issues',excelValues:'display'}))node(id).value=value;
  for(const id of ['hasHeader','duplicateRows','trim','protect'])node(id).checked=true;
  class WorkerMock{
    constructor(){this.messages=[];this.engine=M.session(X);workers.push(this);}
    postMessage(message){this.messages.push(message);}
    terminate(){this.terminated=true;}
    step(){const message=this.messages.shift();if(!message)return;let reply={id:message.id,action:message.action};try{reply.result=this.engine[message.action](message.options);}catch(e){reply.error=e.message;}this.onmessage({data:reply});return reply;}
  }
  const context={window:{DataQuality:M,DataConverter:C,XLSX:X,Worker:WorkerMock,addEventListener(){},DataTransformEvents:{emit:(...args)=>events.push(args)}},Worker:WorkerMock,location:{protocol},document:{getElementById:node,createElement:element,body:element()},navigator:{clipboard:{writeText:async text=>context.copied=text}},Blob,URL:{createObjectURL:()=> 'blob:local',revokeObjectURL(){}},setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('data-quality-checker/app.js','utf8'),context);
  const h={node,context,workers,downloads,events,timers,click(id){return node(id).listeners.click();},change(id,value){node(id).value=value;return node(id).listeners.change();},input(id,value){node(id).value=value;return node(id).listeners.input();},load(text,format='csv'){node('inputText').value=text;node('inputFormat').value=format;h.click('loadText');},file(file){node('inputFile').files=[file];return node('inputFile').listeners.change();},flush(ms=0){for(const [id,t]of [...timers])if(t.ms===ms){timers.delete(id);t.fn();}},drain(){for(let i=0;i<15;i++){const w=workers.at(-1);if(w&&!w.terminated&&w.messages.length)w.step();else if(protocol==='file:'&&[...timers.values()].some(t=>t.ms===0))h.flush();else break;}}};return h;
}
test('worked example runs every check and exports issue details, affected rows and profiles',async()=>{
  const h=harness();h.click('example');h.drain();assert.equal(h.node('download').disabled,false);assert.match(h.node('checkStatus').textContent,/6 of 7/);assert.match(h.node('exportStatus').textContent,/16 report rows/);
  await h.click('copy');assert.match(h.context.copied,/Invalid date/);assert.match(h.context.copied,/Uneven row width/);
  h.change('reportView','rows');assert.equal(h.node('download').disabled,true);h.drain();await h.click('copy');const rows=C.delimited(h.context.copied,',');assert.equal(rows.length,7);assert.equal(rows.at(-1).at(-1),'extra cell');
  h.click('download');assert.deepEqual(h.downloads,['data-quality-rows.csv']);h.change('reportView','profile');h.drain();assert.match(h.node('exportStatus').textContent,/6 report rows/);
});
test('rule, key and matching edits invalidate reports until checks run again',async()=>{
  const h=harness();h.click('example');h.drain();h.input('rule-allowed-3','Active\nPending\nUnknown');assert.equal(h.node('download').disabled,true);assert.equal(h.node('summary').hidden,true);await h.click('copy');assert.equal(h.context.copied,undefined);
  h.change('reportView','rows');assert.equal(h.node('download').disabled,true);h.click('run');h.drain();assert.equal(h.node('download').disabled,false);
  h.node('key-0').checked=false;h.node('key-0').listeners.change();assert.equal(h.node('download').disabled,true);h.node('ignoreCase').checked=true;h.node('ignoreCase').listeners.change();assert.match(h.node('checkStatus').textContent,/Checks changed/);
});
test('new column rules expose options and missing settings block stale exports',()=>{
  const h=harness();h.load('id,date,amount\nx,2026-02-30,12,extra');h.drain();assert.equal(h.node('download').disabled,true);
  h.click('addRule');h.click('run');h.drain();assert.match(h.node('checkStatus').textContent,/Choose a column/);h.change('rule-column-0','1');h.change('rule-type-0','date');h.click('run');h.drain();assert.equal(h.node('download').disabled,false);
  h.change('rule-date-0','dmy');assert.equal(h.node('download').disabled,true);h.click('run');h.drain();assert.match(h.node('exportStatus').textContent,/2 report rows/);
});
test('stale worker checks and exports cannot restore results after edits or reset',()=>{
  const h=harness();h.load('id\nx\nx');h.drain();h.click('run');const w=h.workers.at(-1);h.node('duplicateRows').checked=false;h.node('duplicateRows').listeners.change();w.step();assert.equal(h.node('download').disabled,true);
  h.click('run');w.step(); // accepted check queues export
  h.node('trim').checked=false;h.node('trim').listeners.change();w.step();assert.equal(h.node('download').disabled,true);assert.equal(h.node('summary').hidden,true);
  h.click('run');h.click('reset');w.step();assert.equal(h.node('download').disabled,true);assert.equal(h.node('run').disabled,true);
});
test('changing report choices during pending checks preserves the requested report selection',async()=>{
  const h=harness();h.load('id\nx\nx');h.drain();h.click('run');h.change('reportView','rows');h.drain();await h.click('copy');assert.equal(C.delimited(h.context.copied,',').length,3);assert.match(h.context.copied,/Data row,Issues,id/);
});
test('typing, failed loads, replacement files and reset cancel older file-read results',async()=>{
  const h=harness();h.click('example');h.drain();h.input('inputText','id\nnew');assert.equal(h.node('download').disabled,true);assert.equal(h.node('sourceControls').disabled,true);
  let finish;let p=h.file({size:10,name:'old.csv',arrayBuffer:()=>new Promise(resolve=>finish=resolve)});h.load('id\nnew');h.drain();finish(new TextEncoder().encode('id\nlate').buffer);await p;assert.match(h.node('loadStatus').textContent,/pasted text/);
  p=h.file({size:10,name:'old.csv',arrayBuffer:()=>new Promise(resolve=>finish=resolve)});h.click('reset');finish(new TextEncoder().encode('id\nlate').buffer);await p;assert.equal(h.node('run').disabled,true);
  h.load('id\n"bad');h.drain();assert.match(h.node('loadStatus').textContent,/No data is loaded/);
  await h.file({size:C.LIMITS.bytes+1,name:'large.csv',arrayBuffer:()=>{throw Error('must not read');}});assert.match(h.node('loadStatus').textContent,/5 MiB/);
});
test('worker deadlines remain active for an operation invalidated by a rule edit',()=>{
  const h=harness();h.load('id\nx\nx');h.drain();h.click('run');h.node('trim').checked=false;h.node('trim').listeners.change();h.flush(20000);
  assert.equal(h.workers.at(-1).terminated,true);assert.match(h.node('loadStatus').textContent,/20 seconds/);assert.equal(h.node('download').disabled,true);
  h.load('id\nx');h.workers.at(-1).onerror();assert.match(h.node('loadStatus').textContent,/Background processing stopped/);
});
test('source selection resets column checks and invalid JSON collection choices cannot export',()=>{
  const h=harness();h.click('example');h.drain();h.node('hasHeader').checked=false;h.node('hasHeader').listeners.change();h.drain();assert.equal(h.node('rules').children.length,0);assert.equal(h.node('download').disabled,true);
  h.load('{"a":[1],"b":[2]}','json');h.drain();assert.match(h.node('dataStatus').textContent,/Choose the JSON collection/);h.change('jsonCollection','["a"]');h.drain();h.click('run');h.drain();assert.equal(h.node('download').disabled,false);
});
test('full reports copy beyond the preview and clipboard failure leaves downloads available',async()=>{
  const h=harness();h.load('id,note\n'+Array(200).fill('x,'+'z'.repeat(200)).join('\n'));h.drain();h.click('run');h.drain();h.change('reportView','rows');h.drain();await h.click('copy');assert.equal(C.delimited(h.context.copied,',').length,201);assert.ok(h.context.copied.length>40000);assert.equal(h.node('textPreview').textContent.slice(0,30000),h.context.copied.slice(0,30000));assert.match(h.node('textPreview').textContent.slice(30000),/Preview truncated/);assert.ok(h.node('textPreview').textContent.length<30100);
  h.context.navigator.clipboard.writeText=async()=>{throw Error('denied');};await h.click('copy');assert.match(h.node('exportStatus').textContent,/Copy failed/);assert.equal(h.node('download').disabled,false);
  for(const [name,metadata,tool]of h.events){assert.equal(tool,'data-quality-checker');assert.equal(Object.keys(metadata).length,0);assert.ok(name==='tool_opened'||name.startsWith('quality_'));}
});
test('local-file fallback uses the same engine and clear removes all source data and rules',()=>{
  const h=harness('file:');h.click('example');h.drain();assert.equal(h.workers.length,0);assert.equal(h.node('download').disabled,false);h.click('reset');assert.equal(h.node('inputText').value,'');assert.equal(h.node('rules').children.length,0);assert.equal(h.node('download').disabled,true);
});
test('worker script imports local shared assets and returns errors for invalid rules',()=>{
  const messages=[],context={DataQuality:M,XLSX:X,self:{postMessage:message=>messages.push(message)},importScripts(...paths){assert.deepEqual(paths,['../data-file-converter/vendor/xlsx.full.min.js','../data-file-converter/model.js','model.js']);}};vm.createContext(context);vm.runInContext(fs.readFileSync('data-quality-checker/checker-worker.js','utf8'),context);
  for(const [id,action,options]of [[1,'load',{format:'csv',text:'id\nx\nx'}],[2,'select',{hasHeader:true}],[3,'check',{rules:[],keys:[0],duplicateRows:false,trim:true}],[4,'export',{view:'issues',protect:true}]])context.self.onmessage({data:{id,action,options}});
  assert.equal(messages.at(-1).result.count,2);context.self.onmessage({data:{id:5,action:'check',options:{rules:[{column:'',type:'none'}],keys:[]}}});assert.match(messages.at(-1).error,/Choose a column/);
});

test('every text format copies the full selected output and downloads with its extension',async()=>{
  const h=harness();h.click('example');h.drain?.();
  for(const format of ['csv','json','txt','md']){
    h.change('outputFormat',format);h.drain?.();
    assert.equal(h.node('copy').disabled,false);
    await h.click('copy');assert.ok(h.context.copied.length>0);assert.equal(h.node('textPreview').textContent,h.context.copied);
    if(format==='json')assert.ok(Array.isArray(JSON.parse(h.context.copied)));
    if(format==='md')assert.match(h.context.copied,/\| ---/);
    h.click('download');assert.ok(h.downloads.at(-1).endsWith('.'+format));
  }
  h.click('reset');assert.equal(h.node('textPreview').textContent,'');
});
