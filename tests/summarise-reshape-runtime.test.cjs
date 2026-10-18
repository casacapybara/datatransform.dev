const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const M=require('../summarise-reshape/model.js'), C=require('../data-file-converter/model.js'), X=require('../data-file-converter/vendor/xlsx.full.min.js');
function harness(protocol='https:') {
  const nodes=new Map(),timers=new Map(),workers=[],downloads=[],events=[];let timerId=0;
  function element(){return {value:'',textContent:'',checked:false,disabled:false,hidden:false,children:[],listeners:{},files:[],classList:{toggle(){}},
    set id(id){this._id=id;nodes.set(id,this);},get id(){return this._id;},addEventListener(name,fn){this.listeners[name]=fn;},setAttribute(){},append(...els){this.children.push(...els);},replaceChildren(...els){this.children=els;},focus(){},remove(){},click(){downloads.push(this.download);}};}
  function node(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);}
  const html=fs.readFileSync('summarise-reshape/index.html','utf8'); const ids=new Set([...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
  const unchecked=node; const strictNode=id=>{assert.ok(ids.has(id)||/^(columns|groups)-\d+$/.test(id),'Unknown HTML id: '+id);return unchecked(id);};
  for(const [id,value]of Object.entries({inputFormat:'auto',reportView:'data',excelValues:'display'}))node(id).value=value;
  for(const id of ['hasHeader','protect'])node(id).checked=true;
  class WorkerMock{
    constructor(){this.messages=[];this.engine=M.session(X);workers.push(this);}
    postMessage(message){this.messages.push(message);}
    terminate(){this.terminated=true;}
    step(){const message=this.messages.shift();if(!message)return;let reply={id:message.id,action:message.action};try{reply.result=this.engine[message.action](message.options);}catch(e){reply.error=e.message;}this.onmessage({data:reply});return reply;}
  }
  const context={window:{TableReshaper:M,DataConverter:C,XLSX:X,Worker:WorkerMock,addEventListener(){},DataTransformEvents:{emit:(...args)=>events.push(args)}},Worker:WorkerMock,location:{protocol},document:{getElementById:strictNode,createElement:element,body:element()},navigator:{clipboard:{writeText:async text=>context.copied=text}},Blob,URL:{createObjectURL:()=> 'blob:local',revokeObjectURL(){}},setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('summarise-reshape/app.js','utf8'),context);
  const h={node,context,workers,downloads,events,timers,click(id){return node(id).listeners.click();},change(id,value){node(id).value=value;return node(id).listeners.change();},input(id,value){node(id).value=value;return node(id).listeners.input();},load(text,format='csv'){node('inputText').value=text;node('inputFormat').value=format;h.click('loadText');},file(file){node('inputFile').files=[file];return node('inputFile').listeners.change();},flush(ms=0){for(const [id,t]of [...timers])if(t.ms===ms){timers.delete(id);t.fn();}},drain(){for(let i=0;i<15;i++){const w=workers.at(-1);if(w&&!w.terminated&&w.messages.length)w.step();else if(protocol==='file:'&&[...timers.values()].some(t=>t.ms===0))h.flush();else break;}}};return h;
}

test('every task example runs through the worker, exports and clears on edits',async()=>{
 for(const task of M.TASKS){const h=harness();h.click('task-'+task);h.click('example');h.drain();assert.equal(h.node('download').disabled,false,h.node('exportStatus').textContent);await h.click('copy');assert.ok(h.context.copied.length>0);assert.equal(h.node('textPreview').textContent,h.context.copied);h.click('download');assert.equal(h.downloads.at(-1),'reshaped-table.csv');h.input('resultName','Updated');assert.equal(h.node('download').disabled,true);h.click('run');h.drain();assert.equal(h.node('download').disabled,false);h.click('reset');assert.equal(h.node('download').disabled,true);assert.equal(h.node('inputText').value,'');assert.equal(h.node('textPreview').textContent,'');}
});
test('stale worker replies never re-enable exports; timeouts and reset cancel work',()=>{
 const h=harness();h.click('example');h.drain();h.click('run');h.input('resultName','New');h.drain();assert.equal(h.node('textPreview').textContent,'');assert.equal(h.node('download').disabled,true);h.click('run');h.click('reset');h.drain();assert.equal(h.node('download').disabled,true);h.click('example');h.flush(20000);assert.equal(h.workers.at(-1).terminated,true);assert.match(h.node('loadStatus').textContent,/20 seconds/);
});
test('local-file processing and complete exports across formats',async()=>{
 const h=harness('file:');h.load('id,tags\n'+Array.from({length:150},(_,i)=>`${i},a;b`).join('\n'));h.drain();h.click('task-expand');h.change('valueField','1');h.click('run');h.drain();
 for(const format of ['csv','json','txt','md']){h.change('outputFormat',format);h.drain();assert.equal(h.node('download').disabled,false);await h.click('copy');assert.equal(h.node('textPreview').textContent,h.context.copied);if(format==='csv')assert.equal(C.delimited(h.context.copied,',').length,301);if(format==='json')assert.equal(JSON.parse(h.context.copied).length,300);h.click('download');assert.ok(h.downloads.at(-1).endsWith('.'+format));}
 assert.equal(h.workers.length,0);h.context.navigator.clipboard.writeText=async()=>{throw Error('denied');};await h.click('copy');assert.match(h.node('exportStatus').textContent,/Copy failed/);assert.equal(h.node('download').disabled,false);
});
test('worker only imports local bundled scripts and rejects unknown actions',()=>{
 const messages=[],context={TableReshaper:M,XLSX:X,self:{postMessage:m=>messages.push(m)},importScripts(...paths){assert.deepEqual(paths,['../data-file-converter/vendor/xlsx.full.min.js','../data-file-converter/model.js','model.js']);}};vm.createContext(context);vm.runInContext(fs.readFileSync('summarise-reshape/reshape-worker.js','utf8'),context);context.self.onmessage({data:{id:1,action:'unknown',options:{}}});assert.match(messages[0].error,/Unknown/);
});
