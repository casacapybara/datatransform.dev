const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const M=require('../data-cleaner/model.js'), C=require('../data-file-converter/model.js'), X=require('../data-file-converter/vendor/xlsx.full.min.js');
function harness(protocol='https:') {
  const nodes=new Map(),timers=new Map(),workers=[],downloads=[],events=[];let timerId=0;
  function element(){return {value:'',textContent:'',checked:false,disabled:false,hidden:false,children:[],listeners:{},files:[],classList:{toggle(){}},
    set id(id){this._id=id;nodes.set(id,this);},get id(){return this._id;},addEventListener(name,fn){this.listeners[name]=fn;},setAttribute(){},append(...els){this.children.push(...els);},replaceChildren(...els){this.children=els;},focus(){},remove(){},click(){downloads.push(this.download);}};}
  function node(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);}
  for(const [id,value]of Object.entries({inputFormat:'auto',reportView:'data',excelValues:'display'}))node(id).value=value;
  for(const id of ['hasHeader','duplicateRows','trim','protect'])node(id).checked=true;
  class WorkerMock{
    constructor(){this.messages=[];this.engine=M.session(X);workers.push(this);}
    postMessage(message){this.messages.push(message);}
    terminate(){this.terminated=true;}
    step(){const message=this.messages.shift();if(!message)return;let reply={id:message.id,action:message.action};try{reply.result=this.engine[message.action](message.options);}catch(e){reply.error=e.message;}this.onmessage({data:reply});return reply;}
  }
  const context={window:{DataCleaner:M,DataConverter:C,XLSX:X,Worker:WorkerMock,addEventListener(){},DataTransformEvents:{emit:(...args)=>events.push(args)}},Worker:WorkerMock,location:{protocol},document:{getElementById:node,createElement:element,body:element()},navigator:{clipboard:{writeText:async text=>context.copied=text}},Blob,URL:{createObjectURL:()=> 'blob:local',revokeObjectURL(){}},setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('data-cleaner/app.js','utf8'),context);
  const h={node,context,workers,downloads,events,timers,click(id){return node(id).listeners.click();},change(id,value){node(id).value=value;return node(id).listeners.change();},input(id,value){node(id).value=value;return node(id).listeners.input();},load(text,format='csv'){node('inputText').value=text;node('inputFormat').value=format;h.click('loadText');},file(file){node('inputFile').files=[file];return node('inputFile').listeners.change();},flush(ms=0){for(const [id,t]of [...timers])if(t.ms===ms){timers.delete(id);t.fn();}},drain(){for(let i=0;i<15;i++){const w=workers.at(-1);if(w&&!w.terminated&&w.messages.length)w.step();else if(protocol==='file:'&&[...timers.values()].some(t=>t.ms===0))h.flush();else break;}}};return h;
}
test('text example previews and exports cleaned CSV and reset clears data',async()=>{
 const h=harness();h.click('example');h.drain();assert.equal(h.node('download').disabled,false);await h.click('copy');assert.match(h.context.copied,/001,alice smith/);assert.match(h.context.copied,/002,bob jones/);h.click('download');assert.deepEqual(h.downloads,['cleaned-data.csv']);h.click('reset');assert.equal(h.node('download').disabled,true);assert.equal(h.node('inputText').value,'');
});
test('date and number exceptions block data until users explicitly keep originals',async()=>{
 for(const family of ['date','number']){const h=harness();h.change('family',family);h.click('example');h.drain();assert.equal(h.node('download').disabled,true);assert.match(h.node('exportStatus').textContent,/could not be converted/);h.change('reportView','issues');h.drain();await h.click('copy');assert.equal(C.delimited(h.context.copied,',').length,2);h.click('download');assert.deepEqual(h.downloads,['cleanup-exceptions.csv']);h.change('errorPolicy','keep');assert.equal(h.node('download').disabled,true);h.change('reportView','data');h.click('run');h.drain();await h.click('copy');assert.equal(C.delimited(h.context.copied,',').length,4);assert.equal(h.node('download').disabled,false);}
});
test('explicit column selection and recipe edits prevent stale downloads',()=>{
 const h=harness();h.load('id,name\n001, ALICE ');h.drain();assert.equal(h.node('run').disabled,true);h.node('column-1').checked=true;h.node('column-1').listeners.change();h.click('run');h.drain();assert.equal(h.node('download').disabled,false);h.input('textPrefix','A');assert.equal(h.node('download').disabled,true);h.click('run');h.node('textTrim').checked=false;h.node('textTrim').listeners.change();h.drain();assert.equal(h.node('download').disabled,true);
 h.click('run');h.click('reset');h.drain();assert.equal(h.node('download').disabled,true);
});
test('file reads cannot replace a newer source and worker timeouts cancel obsolete work',async()=>{
 const h=harness();let finish;const p=h.file({size:10,name:'old.csv',arrayBuffer:()=>new Promise(r=>finish=r)});h.load('id,name\n001,new');h.drain();finish(new TextEncoder().encode('id,name\n002,old').buffer);await p;assert.match(h.node('loadStatus').textContent,/pasted text/);
 h.click('selectAll');h.click('run');h.input('textPrefix','x');h.flush(20000);assert.equal(h.workers.at(-1).terminated,true);assert.match(h.node('loadStatus').textContent,/20 seconds/);assert.equal(h.node('download').disabled,true);
});
test('complete CSV copies exceed preview and clipboard failures preserve downloads',async()=>{
 const h=harness();h.load('id,name\n'+Array.from({length:150},(_,i)=>`${i}, ALICE `).join('\n'));h.drain();h.click('selectAll');h.click('run');h.drain();await h.click('copy');assert.equal(C.delimited(h.context.copied,',').length,151);h.context.navigator.clipboard.writeText=async()=>{throw Error('denied');};await h.click('copy');assert.match(h.node('exportStatus').textContent,/Copy failed/);assert.equal(h.node('download').disabled,false);
 for(const [name,metadata,tool] of h.events){assert.equal(tool,'data-cleaner');assert.equal(Object.keys(metadata).length,0);assert.ok(name==='tool_opened'||name.startsWith('cleanup_'));}
});
test('direct local-file mode uses the same cleanup engine',async()=>{
 const h=harness('file:');h.click('example');h.drain();await h.click('copy');assert.match(h.context.copied,/alice smith/);assert.equal(h.workers.length,0);
});
test('hosted worker loads only bundled scripts and rejects invalid cleanup settings',()=>{
 const messages=[],context={DataCleaner:M,XLSX:X,self:{postMessage:m=>messages.push(m)},importScripts(...paths){assert.deepEqual(paths,['../data-file-converter/vendor/xlsx.full.min.js','../data-file-converter/model.js','model.js']);}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('data-cleaner/cleaner-worker.js','utf8'),context);
 for(const [id,action,options]of [[1,'load',{format:'csv',text:'id,name\n001, ALICE '}],[2,'select',{hasHeader:true}],[3,'run',{family:'bad'}]])context.self.onmessage({data:{id,action,options}});
 assert.match(messages.at(-1).error,/Choose text/);
});
test('new letter-case choices invalidate old results and export the chosen case',async()=>{
 const h=harness();h.click('example');h.drain();
 for(const [mode,expected]of [['title','Alice Smith'],['camel','aliceSmith'],['slug','alice-smith'],['snake','alice_smith']]){
  h.change('textCase',mode);assert.equal(h.node('download').disabled,true);h.click('run');h.drain();await h.click('copy');assert.equal(C.delimited(h.context.copied,',')[1][1],expected);
 }
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
