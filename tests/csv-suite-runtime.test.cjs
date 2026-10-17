const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const M = require('../csv-search-filter-transform/model.js');
function harness() {
  const nodes = new Map(), downloads = [];
  function element() {
    return {value:'',textContent:'',checked:false,disabled:false,hidden:false,children:[],listeners:{},files:[],classList:{toggle(){}},
      set id(v){this._id=v;nodes.set(v,this);}, get id(){return this._id;},
      addEventListener(event, fn){this.listeners[event]=fn;}, setAttribute(){},
      append(...els){this.children.push(...els);},prepend(...els){this.children.unshift(...els);},replaceChildren(...els){this.children=els;},
      querySelectorAll(selector){return this.children.flatMap(el=>el.children).filter(el=>el.type==='checkbox' && (!selector.includes(':checked') || el.checked));},
      focus(){},remove(){},click(){downloads.push(this.download);}};
  }
  function node(id) {if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);}
  const context = {window:{CsvSuite:M},document:{getElementById:node,createElement:element,body:element()},navigator:{clipboard:{writeText:async text=>{context.copied=text;}}},Blob,URL:{createObjectURL:()=> 'blob:local',revokeObjectURL(){}},setTimeout(){}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('csv-search-filter-transform/app.js','utf8'),context);
  return {node,context,downloads,click(id){return node(id).listeners.click();},edit(id,value){node(id).value=value;return node(id).listeners.input();},load(text){node('csvInput').value=text;node('loadPaste').listeners.click();},file(file){node('csvFile').files=[file];return node('csvFile').listeners.change();}};
}
test('paste, filters and column names refresh exports; invalid names cannot copy or download stale output', async () => {
  const h=harness();h.load('id,name\n001,Asha\n002,Ben');assert.equal(h.node('download').disabled,false);
  h.edit('criteria','Asha');assert.match(h.node('textPreview').textContent,/001,Asha/);assert.doesNotMatch(h.node('textPreview').textContent,/002/);
  h.edit('rename-0','name');assert.equal(h.node('download').disabled,true);assert.equal(h.node('textPreview').textContent,'');
  await h.click('copy');assert.equal(h.context.copied,undefined);
  h.edit('rename-0','ID');h.edit('outputFormat','json');await h.click('copy');assert.equal(JSON.parse(h.context.copied)[0].ID,'001');
  h.click('download');assert.deepEqual(h.downloads,['csv-suite-output.json']);
});
test('multiple changes apply only after a column is chosen, then clear restores source data', () => {
  const h=harness();h.load('id,name\n001,Asha');h.click('addChange');assert.match(h.node('textPreview').textContent,/001,Asha/);
  h.node('change-column-0').value='1';h.node('change-column-0').listeners.change();h.edit('change-value-0','New');
  h.click('addChange');h.node('change-column-1').value='0';h.node('change-column-1').listeners.change();h.edit('change-value-1','002');
  assert.match(h.node('textPreview').textContent,/002,New/);h.click('clearChanges');assert.match(h.node('textPreview').textContent,/001,Asha/);
});
test('invalid replacement preserves the loaded data; reset and newer imports cancel pending reads', async () => {
  const h=harness();h.load('a\nold');h.load('a,b\nbad');assert.match(h.node('loadStatus').textContent,/previously loaded/);assert.match(h.node('textPreview').textContent,/old/);
  let finish;const pending=h.file({size:10,name:'old.csv',text:()=>new Promise(resolve=>finish=resolve)});
  h.load('a\nnew');finish('a\nlate');await pending;assert.match(h.node('textPreview').textContent,/new/);
  const pending2=h.file({size:10,name:'old.csv',text:()=>new Promise(resolve=>finish=resolve)});
  h.click('reset');finish('a\nlate');await pending2;assert.equal(h.node('download').disabled,true);assert.equal(h.node('textPreview').textContent,'');
});
test('zero matches has an empty export, while invalid search selection disables export', () => {
  const h=harness();h.load('a\none');h.edit('criteria','absent');assert.equal(h.node('download').disabled,false);
  h.edit('scope','selected');h.click('selectNone');assert.equal(h.node('download').disabled,true);assert.match(h.node('filterStatus').textContent,/Select at least/);
});
test('file loading uses selected contents and rejects oversized files before reading', async () => {
  const h=harness();await h.file({size:20,name:'sample.csv',text:async()=> 'id,name\n001,Asha'});
  assert.match(h.node('loadStatus').textContent,/Loaded sample.csv/);assert.match(h.node('textPreview').textContent,/001,Asha/);
  await h.file({size:M.LIMITS.bytes+1,name:'large.csv',text:()=>{throw new Error('must not read');}});
  assert.match(h.node('loadStatus').textContent,/exceeds 5 MiB/);assert.match(h.node('textPreview').textContent,/001,Asha/);
});
test('manual rows survive filters and changes, participate in dedupe, and clear on load/reset', () => {
  const h=harness();h.load('id,name\n1,Loaded');h.edit('criteria','no match');
  h.node('manual-value-0').value='2';h.node('manual-value-1').value='Manual';h.click('addManual');
  assert.match(h.node('textPreview').textContent,/2,Manual/);
  h.node('manual-value-0').value='2';h.node('manual-value-1').value='Manual';h.click('addManual');
  h.node('removeDuplicates').checked=true;h.node('removeDuplicates').listeners.input();
  assert.match(h.node('cleanupStatus').textContent,/1 duplicate/);
  h.load('id,name\n3,New');assert.doesNotMatch(h.node('textPreview').textContent,/Manual/);assert.equal(h.node('manualCount').textContent,'0 added rows');
  h.click('reset');assert.equal(h.node('manualControls').disabled,true);
});
test('empty filters, replacement validation and numeric sorting refresh or invalidate exports', () => {
  const h=harness();h.load('id,name\n1,\n2,A.b');h.edit('matchMode','empty');assert.match(h.node('textPreview').textContent,/1,/);assert.doesNotMatch(h.node('textPreview').textContent,/2,A.b/);
  h.edit('matchMode','contains');h.click('addChange');h.node('change-column-0').value='1';h.node('change-column-0').listeners.change();
  h.node('change-type-0').value='replace';h.node('change-type-0').listeners.change();assert.equal(h.node('download').disabled,true);
  h.edit('change-find-0','A.b');h.edit('change-value-0','New');assert.match(h.node('textPreview').textContent,/2,New/);
  h.click('addSort');h.node('sort-column-0').value='1';h.node('sort-column-0').listeners.change();h.node('sort-type-0').value='number';h.node('sort-type-0').listeners.change();
  assert.equal(h.node('download').disabled,true);assert.match(h.node('exportStatus').textContent,/finite numbers/);
  h.click('clearSort');assert.equal(h.node('download').disabled,false);
});
