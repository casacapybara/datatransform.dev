const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const model = require('../base64-decoder-encoder/model.js');
function harness() {
  const nodes=new Map(), timers=[], events=[];
  function node(id) {
    if(!nodes.has(id)) nodes.set(id,{value:'',textContent:'',hidden:false,disabled:false,files:[],dataset:{},listeners:{},children:[],classList:{toggle(){},add(){},remove(){}},setAttribute(){},focus(){},addEventListener(type,fn){this.listeners[type]=fn;},replaceChildren(){this.children=[];},append(child){this.children.push(child);},click(){},remove(){}});
    return nodes.get(id);
  }
  const context={Base64Model:model,document:{getElementById:node,querySelectorAll:()=>[],createElement:()=>node('created-'+nodes.size),body:{append(){}}},navigator:{},window:{addEventListener(){}},URL,Blob,setTimeout(fn){timers.push(fn);},DataTransformEvents:{emit(...args){events.push(args);}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('base64-decoder-encoder/app.js','utf8'),context);
  return {node,timers,events,flush(){while(timers.length)timers.shift()();}};
}
test('decoder error and edited input clear earlier text, copy and download state',()=>{
  const h=harness();h.node('base64Input').value='SGVsbG8=';h.node('decodeBtn').listeners.click();h.flush();
  assert.equal(h.node('copyDecodedText').hidden,false);
  h.node('base64Input').value='AA=';h.node('decodeBtn').listeners.click();h.flush();
  assert.equal(h.node('copyDecodedText').hidden,true);assert.equal(h.node('downloadDecoded').disabled,true);
  h.node('base64Input').value='SGVsbG8=';h.node('decodeBtn').listeners.click();h.node('base64Input').listeners.input();h.flush();
  assert.equal(h.node('downloadDecoded').disabled,true);
});
test('clearing the encoder cancels an in-flight file read and suppresses stale output',async()=>{
  const h=harness();let finish;
  h.node('fileInput').files=[{name:'example.txt',size:5,type:'text/plain',arrayBuffer:()=>new Promise(resolve=>finish=resolve)}];
  h.node('fileInput').listeners.change();
  const pending=h.node('encodeBtn').listeners.click();h.flush();await Promise.resolve();
  assert.equal(typeof finish,'function');h.node('clearEncode').listeners.click();finish(new TextEncoder().encode('Hello').buffer);await pending;
  assert.equal(h.node('base64Output').value,'');assert.equal(h.node('copyEncoded').disabled,true);assert.equal(h.node('downloadEncoded').disabled,true);
});
test('Base64 event metadata discards file and clipboard content and rejects unknown tool identifiers',()=>{
  const events=[];const context={document:{dispatchEvent(event){events.push(event.detail);}},CustomEvent:class{constructor(name,options){this.detail=options.detail;}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('assets/events.js','utf8'),context);
  context.DataTransformEvents.emit('base64_encoded',{source:'file',name:'private.txt',content:'secret'},'base64-decoder-encoder');
  assert.equal(JSON.stringify(events[0]),JSON.stringify({name:'base64_encoded',tool:'base64-decoder-encoder',source:'file'}));
  context.DataTransformEvents.emit('base64_encoded',{source:'file'},'unknown');assert.equal(events.length,1);
});


test('examples decode and encode matching text and cancel a pending file encode', async () => {
  const h = harness(); h.node('exampleDecode').listeners.click();
  h.node('decodeBtn').listeners.click(); h.flush();
  assert.equal(h.node('decodedPreview').children[0].textContent, 'Hello, world!');
  let finish;
  h.node('fileInput').files=[{name:'old.txt',size:3,arrayBuffer:()=>new Promise(resolve=>finish=resolve)}];
  h.node('fileInput').listeners.change();
  const pending=h.node('encodeBtn').listeners.click();h.flush();await Promise.resolve();
  h.node('exampleEncode').listeners.click();finish(new TextEncoder().encode('old').buffer);await pending;
  assert.equal(h.node('base64Output').value, '');
  assert.equal(h.node('textSource').hidden, false);
  const encoding=h.node('encodeBtn').listeners.click();h.flush();await encoding;
  assert.equal(h.node('base64Output').value, h.node('base64Input').value);
  h.node('clearEncode').listeners.click();assert.equal(h.node('downloadEncoded').disabled,true);
});
