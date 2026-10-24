const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const M=require('../mask-sensitive-data/model.js'), C=require('../data-file-converter/model.js'), X=require('../data-file-converter/vendor/xlsx.full.min.js');
function harness(protocol='https:') {
  const nodes=new Map(),timers=new Map(),workers=[],downloads=[],events=[];let timerId=0;
  function element(){return {value:'',textContent:'',checked:false,disabled:false,hidden:false,children:[],listeners:{},files:[],classList:{toggle(){}},
    set id(id){this._id=id;nodes.set(id,this);},get id(){return this._id;},addEventListener(name,fn){this.listeners[name]=fn;},setAttribute(){},append(...els){this.children.push(...els);},replaceChildren(...els){this.children=els;},focus(){},remove(){},click(){downloads.push(this.download);}};}
  function node(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);}
  for(const [id,value]of Object.entries({inputFormat:'auto',outputFormat:'csv',excelValues:'display'}))node(id).value=value;
  for(const id of ['hasHeader','duplicateRows','trim','protect'])node(id).checked=true;
  class WorkerMock{
    constructor(){this.messages=[];this.engine=M.session(X);workers.push(this);}
    postMessage(message){this.messages.push(message);}
    terminate(){this.terminated=true;}
    step(){const message=this.messages.shift();if(!message)return;let reply={id:message.id,action:message.action};try{reply.result=this.engine[message.action](message.options);}catch(e){reply.error=e.message;}this.onmessage({data:reply});return reply;}
  }
  const context={window:{DataMasker:M,DataConverter:C,XLSX:X,Worker:WorkerMock,addEventListener(){},DataTransformEvents:{emit:(...args)=>events.push(args)}},Worker:WorkerMock,location:{protocol},document:{getElementById:node,createElement:element,body:element()},navigator:{clipboard:{writeText:async text=>context.copied=text}},Blob,URL:{createObjectURL:()=> 'blob:local',revokeObjectURL(){}},setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('mask-sensitive-data/app.js','utf8'),context);
  const h={node,context,workers,downloads,events,timers,click(id){return node(id).listeners.click();},change(id,value){node(id).value=value;return node(id).listeners.change();},input(id,value){node(id).value=value;return node(id).listeners.input();},load(text,format='csv'){node('inputText').value=text;node('inputFormat').value=format;h.click('loadText');},file(file){node('inputFile').files=[file];return node('inputFile').listeners.change();},flush(ms=0){for(const [id,t]of [...timers])if(t.ms===ms){timers.delete(id);t.fn();}},drain(){for(let i=0;i<15;i++){const w=workers.at(-1);if(w&&!w.terminated&&w.messages.length)w.step();else if(protocol==='file:'&&[...timers.values()].some(t=>t.ms===0))h.flush();else break;}}};return h;
}
test('example requires review, exports no removed sources, and edits revoke approval',async()=>{
 const h=harness();h.click('example');h.drain();h.click('run');h.drain();assert.equal(h.node('download').disabled,true);h.node('reviewed').checked=true;h.node('reviewed').listeners.change();h.drain();await h.click('copy');assert.match(h.context.copied,/Value 2-000001/);assert.doesNotMatch(h.context.copied,/Asha|Ben|example.test|Private|notes|email/);assert.equal(h.context.copied,h.node('textPreview').textContent);h.click('download');assert.equal(h.downloads.at(-1),'masked-data.csv');
 h.change('action-3','remove');assert.equal(h.node('download').disabled,true);assert.equal(h.node('reviewed').checked,false);assert.equal(h.node('textPreview').textContent,'');h.click('run');h.drain();h.node('reviewed').checked=true;h.node('reviewed').listeners.change();h.node('reviewed').checked=false;h.node('reviewed').listeners.change();h.drain();assert.equal(h.node('download').disabled,true);
});
test('mask imports default to remove and pending file reads cannot replace newer examples or reset',async()=>{
 const h=harness();h.load('id,name\n001,Alice');h.drain();assert.equal(h.node('action-0').value,'remove');h.click('run');h.drain();assert.match(h.node('runStatus').textContent,/at least/);
 let finish;const pending=h.file({name:'old.csv',size:10,arrayBuffer:()=>new Promise(r=>finish=r)});h.click('example');h.drain();finish(new TextEncoder().encode('secret\nold').buffer);await pending;assert.equal(h.node('action-0').value,'mask');h.click('reset');assert.equal(h.node('columnActions').children.length,0);assert.equal(h.node('download').disabled,true);
});
test('each export format uses complete current output and direct-file processing works',async()=>{
 for(const protocol of ['https:','file:']){const h=harness(protocol);h.click('example');h.drain();h.click('run');h.drain();h.node('reviewed').checked=true;h.node('reviewed').listeners.change();h.drain();for(const format of ['csv','tsv','json','txt','md']){h.change('outputFormat',format);h.drain();await h.click('copy');assert.equal(h.node('textPreview').textContent,h.context.copied);h.click('download');assert.ok(h.downloads.at(-1).endsWith('.'+format));}h.input('inputText','edited');assert.equal(h.node('download').disabled,true);assert.equal(h.node('reviewed').checked,false);}
});
test('export settings changed during masking do not strand processing or bypass review',()=>{
 const h=harness();h.click('example');h.drain();h.click('run');h.change('outputFormat','json');h.drain();assert.equal(h.node('run').disabled,false);assert.equal(h.node('reviewed').disabled,false);assert.equal(h.node('download').disabled,true);h.node('reviewed').checked=true;h.node('reviewed').listeners.change();h.drain();assert.equal(JSON.parse(h.node('textPreview').textContent).length,3);
});
test('large masked output keeps complete copies while limiting the formatted preview and table',async()=>{
 const h=harness();h.load('id,comment\n'+Array.from({length:150},(_,i)=>`${i},${'x'.repeat(300)}`).join('\n'));h.drain();h.change('action-0','mask');h.change('action-1','keep');h.click('run');h.drain();h.node('reviewed').checked=true;h.node('reviewed').listeners.change();h.drain();await h.click('copy');assert.ok(h.context.copied.length>30000);assert.ok(h.node('textPreview').textContent.startsWith(h.context.copied.slice(0,30000)));assert.match(h.node('textPreview').textContent,/Preview truncated/);assert.equal(C.delimited(h.context.copied,',').length,151);assert.equal(h.node('resultTable').children[0].children[1].children.length,100);h.click('reset');assert.equal(h.node('textPreview').textContent,'');
});
