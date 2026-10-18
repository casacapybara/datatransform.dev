const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const M = require('../csv-merge-join/model.js');
function harness() {
  const nodes = new Map(), downloads = [], events = [];
  function element() {
    return {value:'',textContent:'',checked:false,disabled:false,hidden:false,children:[],listeners:{},files:[],classList:{toggle(){},add(){}},
      set id(v){this._id=v;nodes.set(v,this);},get id(){return this._id;},
      addEventListener(event,fn){this.listeners[event]=fn;},setAttribute(){},append(...els){this.children.push(...els);},replaceChildren(...els){this.children=els;},focus(){},remove(){},click(){downloads.push(this.download);}};
  }
  function node(id) {if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);}
  for (const [id,value] of Object.entries({keepRows:'left',duplicates:'stop',resultView:'merged'}))node(id).value=value;
  node('protect').checked=node('matchStatus').checked=node('modeStack').checked=true;
  const context={window:{CsvMerge:M,CsvSuite:require('../csv-search-filter-transform/model.js'),DataTransformEvents:{emit:(...args)=>events.push(args)}},document:{getElementById:node,createElement:element,body:element()},navigator:{clipboard:{writeText:async text=>{context.copied=text;}}},Blob,URL:{createObjectURL:()=> 'blob:local',revokeObjectURL(){}},setTimeout(){}};
  vm.createContext(context); vm.runInContext(fs.readFileSync('csv-merge-join/app.js','utf8'),context);
  const h={node,context,downloads,events,click(id){return node(id).listeners.click();},change(id,value){node(id).value=value;return node(id).listeners.change();},input(id,value){node(id).value=value;return node(id).listeners.input();},paste(side,text){node(side==='stack'?'stackText':side+'Text').value=text;return h.click(side==='stack'?'addPaste':side+'Load');},mode(mode){node('modeMatch').checked=mode==='match';node('modeStack').checked=mode==='stack';return node(mode==='match'?'modeMatch':'modeStack').listeners.change();},file(side,files){node(side==='stack'?'stackFiles':side+'File').files=files;return node(side==='stack'?'stackFiles':side+'File').listeners.change();}};
  return h;
}
test('examples, mode switching and reset retain only the intended task data', () => {
  const h=harness(); h.click('example'); assert.equal(h.node('download').disabled,false);assert.match(h.node('textPreview').textContent,/Notebook/);
  h.mode('match');assert.equal(h.node('download').disabled,true);h.click('example');assert.match(h.node('textPreview').textContent,/001,C01/);
  h.mode('stack');assert.match(h.node('textPreview').textContent,/Notebook/);
  h.click('reset');h.mode('match');assert.equal(h.node('download').disabled,true);assert.equal(h.node('textPreview').textContent,'');assert.equal(h.node('aSummary').textContent,'No table loaded.');
});
test('stack mapping, exclusion and invalid names refresh or invalidate exports', async () => {
  const h=harness();h.paste('stack','Customer\nA');h.paste('stack','Customer name\nB');
  h.change('stack-source-0-1','0');h.node('stack-include-1').checked=false;h.node('stack-include-1').listeners.change();
  assert.equal(h.node('textPreview').textContent,'Customer\r\nA\r\nB');
  h.input('stack-name-0','');assert.equal(h.node('download').disabled,true);await h.click('copy');assert.equal(h.context.copied,undefined);
  h.input('stack-name-0','Name');await h.click('copy');assert.equal(h.context.copied,'Name\r\nA\r\nB');h.click('download');assert.deepEqual(h.downloads,['stacked-tables.csv']);
});
test('duplicates block merged export but unmatched reports remain available', () => {
  const h=harness();h.mode('match');h.paste('a','id,v\nx,A\ny,B');h.paste('b','id,v\nx,First\nx,Last\nz,No');
  assert.equal(h.node('download').disabled,true);assert.match(h.node('operationStatus').textContent,/repeated/);
  h.change('resultView','unmatchedB');assert.equal(h.node('download').disabled,false);assert.equal(h.node('textPreview').textContent,'id,v\r\nz,No');
  h.change('duplicates','last');h.change('resultView','merged');assert.match(h.node('textPreview').textContent,/Last,Matched/);assert.doesNotMatch(h.node('textPreview').textContent,/First/);
  h.change('keepRows','full');assert.match(h.node('textPreview').textContent,/z,No,Only in second/);
});
test('key edits and column errors clear previous output instead of exporting stale data', async () => {
  const h=harness();h.mode('match');h.click('example');h.change('key-a-0','');assert.equal(h.node('download').disabled,true);assert.equal(h.node('textPreview').textContent,'');
  h.click('download');assert.equal(h.downloads.length,0);h.change('key-a-0','1');assert.equal(h.node('download').disabled,false);
  h.input('match-name-1','Order ID');assert.equal(h.node('download').disabled,true);await h.click('copy');assert.equal(h.context.copied,undefined);
});
test('invalid replacement loads preserve active tables and expose the error', () => {
  const h=harness();h.mode('match');h.click('example');const before=h.node('textPreview').textContent;
  h.paste('a','id,value\nBad');assert.match(h.node('loadStatus').textContent,/Previously loaded data/);assert.equal(h.node('textPreview').textContent,before);
});
test('pending file loads disable exports, and reset, paste, examples and mode changes cancel stale reads', async () => {
  const h=harness();h.click('example');let finish;
  function pending(side='stack'){return h.file(side,[{size:10,name:'late.csv',text:()=>new Promise(resolve=>{finish=resolve;})}]);}
  let p=pending();assert.equal(h.node('download').disabled,true);h.click('reset');finish('id\nlate');await p;assert.equal(h.node('download').disabled,true);
  h.mode('match');h.click('example');p=pending('a');h.paste('a','Customer ID\nC01');finish('id\nlate');await p;assert.doesNotMatch(h.node('aSummary').textContent,/late/);
  p=pending('a');h.click('example');finish('id\nlate');await p;assert.match(h.node('aSummary').textContent,/Orders/);
  p=pending('a');h.mode('stack');finish('id\nlate');await p;h.mode('match');assert.match(h.node('aSummary').textContent,/Orders/);
});
test('batch file loading is atomic and rejects oversize inputs before reading', async () => {
  const h=harness();h.click('example');const before=h.node('textPreview').textContent;
  await h.file('stack',[{size:10,name:'good.csv',text:async()=> 'id\nx'},{size:10,name:'bad.csv',text:async()=> 'a,b\nx'}]);
  assert.equal(h.node('textPreview').textContent,before);assert.match(h.node('loadStatus').textContent,/expected 2/);
  await h.file('stack',[{size:6*1024*1024,name:'large.csv',text:()=>{throw Error('must not read');}}]);assert.match(h.node('loadStatus').textContent,/5 MiB/);
  await h.file('stack',[{size:10,name:'third.csv',text:async()=> 'Product,Units\nPen,10'}]);assert.match(h.node('textPreview').textContent,/Pen,10/);
});
test('copy errors preserve downloads and events never receive input metadata', async () => {
  const h=harness();h.click('example');h.context.navigator.clipboard.writeText=async()=>{throw Error('denied');};await h.click('copy');assert.match(h.node('exportStatus').textContent,/Copy failed/);assert.equal(h.node('download').disabled,false);
  for(const [name,metadata,tool] of h.events){assert.equal(tool,'csv-merge-join');assert.equal(Object.keys(metadata).length,0);assert.ok(name.startsWith('merge_')||name==='tool_opened');}
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
});
