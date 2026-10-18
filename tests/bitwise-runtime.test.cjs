const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const model = require('../bitwise-flag-decoder/model.js');
function harness(throwEvents = false) {
  const nodes = new Map(), events = [], downloads = [];
  function element() {
    const classes = new Set();
    return {value:'',textContent:'',type:'',hidden:false,disabled:false,open:false,files:[],dataset:{},children:[],listeners:{},attributes:{},
      classList:{contains:c=>classes.has(c),toggle(c,on){if(on)classes.add(c);else classes.delete(c);}},
      set className(c){c.split(' ').forEach(item=>classes.add(item));},
      setAttribute(k,v){this.attributes[k]=v;},addEventListener(t,fn){this.listeners[t]=fn;},replaceChildren(){this.children=[];},append(n){this.children.push(n);},focus(){},remove(){},click(){downloads.push(this.download);}};
  }
  function node(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);}
  node('inputValue').value='0';node('tableFilter').value='all';node('pasteFormat').value='names';node('startBit').value='0';node('bitWidth').value='64';
  const context={CsvSuite:require('../csv-search-filter-transform/model.js'),BitwiseModel:model,document:{getElementById:node,createElement:element,body:{append(){}}},navigator:{},URL:{createObjectURL(){return 'blob:test';},revokeObjectURL(){}},Blob,setTimeout(){},DataTransformEvents:{emit(name,metadata,tool){if(throwEvents)throw new Error('analytics unavailable');events.push({name,metadata,tool});}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('bitwise-flag-decoder/app.js','utf8'),context);
  return {node,context,events,downloads,edit(id,value){node(id).value=value;node(id).listeners.input();},row(bit){return node('flagsTableBody').children[bit];},async load(file){node('configFile').files=[file];return node('configFile').listeners.change();}};
}
const config = (name, width=64, flags=[{bit:0,name:'Read'}]) => JSON.stringify({version:1,name,bitWidth:width,flags});
test('invalid and blank inputs clear earlier masks and disable misleading copy and selections', () => {
  const h=harness();h.edit('inputValue','9223372036854775808');assert.equal(h.row(63).children[0].children[0].checked,true);
  h.edit('inputValue','-1');assert.equal(h.node('resultDecimal').textContent,'—');assert.equal(h.node('copyResult').disabled,true);assert.equal(h.row(63).children[0].children[0].disabled,true);
  h.edit('inputValue','');assert.equal(h.node('enabledFlags').children.length,0);
  h.node('clearValue').listeners.click();assert.equal(h.node('resultDecimal').textContent,'0');assert.equal(h.node('copyResult').disabled,false);
});
test('import is atomic, preserves values and names, and exposes width overflow', async () => {
  const h=harness();h.edit('inputValue','256');await h.load({size:100,text:async()=>config('Saved',8)});
  assert.equal(h.node('inputValue').value,'256');assert.equal(h.node('bitWidth').value,'8');assert.equal(h.node('resultDecimal').textContent,'—');
  await h.load({size:100,text:async()=>'{bad'});assert.equal(h.node('configName').value,'Saved');assert.equal(h.node('flagsTableBody').children.length,8);
  await h.load({size:model.FILE_LIMIT+1,text:async()=>{throw new Error('must not read');}});assert.match(h.node('configStatusText').textContent,/256 KiB/);
});
test('editing cancels pending imports and an older file cannot overwrite a newer file', async () => {
  const h=harness();let finish;
  const pending=h.load({size:100,text:()=>new Promise(resolve=>finish=resolve)});
  h.edit('configName','Edited');finish(config('Old'));await pending;assert.equal(h.node('configName').value,'Edited');
  const older=h.load({size:100,text:()=>new Promise(resolve=>finish=resolve)});
  await h.load({size:100,text:async()=>config('New')});finish(config('Old'));await older;
  assert.equal(h.node('configName').value,'New');assert.match(h.node('configStatusText').textContent,/Configuration loaded/);
});
test('bulk apply is atomic and affects names without changing mask or other labels', () => {
  const h=harness();h.edit('inputValue','11');const name=h.row(3).children[4].children[0];name.value='Admin';h.node('flagsTableBody').listeners.input({target:name});
  h.edit('bulkNames','Read\nWrite');h.node('applyNames').listeners.click();assert.equal(h.node('inputValue').value,'11');assert.equal(h.row(3).children[4].children[0].value,'Admin');
  h.edit('bulkNames','Read\tBad');assert.equal(h.node('applyNames').disabled,true);h.node('applyNames').listeners.click();assert.equal(h.row(0).children[4].children[0].value,'Read');
  h.node('bitWidth').value='8';h.node('bitWidth').listeners.change();assert.equal(h.node('flagsTableBody').children.length,8);
});
test('optional hooks cannot break the decoder and bitwise events discard all metadata', () => {
  assert.equal(harness(true).node('resultDecimal').textContent,'0');
  const events=[],context={document:{dispatchEvent(e){events.push(e.detail);}},CustomEvent:class{constructor(name,options){this.detail=options.detail;}}};vm.createContext(context);vm.runInContext(fs.readFileSync('assets/events.js','utf8'),context);
  context.DataTransformEvents.emit('bitwise_names_applied',{name:'secret',value:'11',filename:'private.json'},'bitwise-flag-decoder');
  assert.equal(JSON.stringify(events[0]),JSON.stringify({name:'bitwise_names_applied',tool:'bitwise-flag-decoder'}));
});

test('all result formats copy and download exact large masks',async()=>{
 const h=harness();h.context.navigator.clipboard={writeText:async text=>h.context.copied=text};h.edit('inputValue','9223372036854775808');
 for(const format of ['csv','json','txt','md']){h.node('resultFormat').value=format;h.node('resultFormat').listeners.change();await h.node('copyResult').listeners.click();assert.match(h.context.copied,/9223372036854775808/);assert.equal(h.node('textPreview').textContent,h.context.copied);h.node('downloadResult').listeners.click();assert.equal(h.downloads.at(-1),'bitwise-result.'+format);}
 h.edit('inputValue','bad');assert.equal(h.node('textPreview').textContent,'');assert.equal(h.node('downloadResult').disabled,true);
});

test('configuration JSON can be copied independently of the decoded value',async()=>{
 const h=harness();h.context.navigator.clipboard={writeText:async text=>h.context.copied=text};h.edit('inputValue','11');
 h.edit('configName','Saved flags');await h.node('copyConfig').listeners.click();assert.equal(h.node('configPreview').textContent,h.context.copied);const config=JSON.parse(h.context.copied);assert.equal(config.bitWidth,64);assert.equal(config.version,1);assert.equal(config.value,undefined);
 h.context.navigator.clipboard.writeText=async()=>{throw Error('denied');};await h.node('copyConfig').listeners.click();assert.match(h.node('configStatusText').textContent,/Copy failed/);
});


test('example replaces mask and labels and cancels pending configurations', async () => {
  const h = harness(); let finish;
  const pending = h.load({size:100,text:()=>new Promise(resolve=>finish=resolve)});
  h.node('example').listeners.click(); finish(config('Late')); await pending;
  assert.equal(h.node('resultDecimal').textContent, '11');
  assert.equal(h.node('bitWidth').value, '8');
  assert.equal(h.node('configName').value, 'Example permissions');
  assert.match(h.node('enabledFlags').children.map(n=>n.textContent).join(' '), /Read.*Write.*Admin/);
  assert.equal(h.node('copyResult').disabled, false);
});
