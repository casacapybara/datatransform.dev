const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
function setup() {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.attrs = {}; this.value = ''; this.files = []; this.hidden = false; this.classList = {toggle() {}}; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(name, cb) { this.listeners[name] = cb; }
    setAttribute(name, value) { this.attrs[name] = value; }
    focus() {} click() {} remove() {}
  }
  const elements = {}, downloads = [];
  const views = ['changed', 'added', 'removed'].map(view => Object.assign(new Element('button'), {dataset: {view}}));
  const scope = vm.createContext({
    document: {getElementById(id) {return elements[id] ||= new Element();}, createElement(tag) {return new Element(tag);}, createTextNode(text) {return {textContent:text};}, querySelectorAll() {return views;}, body: {append(node) {downloads.push(node);}}},
    navigator:{clipboard:{writeText:async text=>scope.copied=text}},
    TableComparison: require('../compare-tables/model.js'), Blob, URL: {createObjectURL() {return 'blob:report';}, revokeObjectURL() {}}, setTimeout() {}
  });
  vm.runInContext(readFileSync('compare-tables/app.js', 'utf8'), scope);
  const event = (id, name = 'click') => elements[id].listeners[name]();
  const input = (id, value) => {elements[id].value = value; event(id, 'input');};
  const text = node => [node.textContent || '', ...(node.children || []).map(text)].join(' ');
  return {elements, views, event, input, downloads, text, scope};
}
test('example, preview views and both download modes work; edits invalidate previous results', () => {
  const p = setup(), e = p.elements;
  p.event('example'); p.event('compare');
  assert.match(e.summary.textContent, /1 added · 1 removed · 1 changed record \(1 cell\)/);
  assert.match(p.text(e.preview), /Pending.*Approved/);
  p.views[1].listeners.click(); assert.match(p.text(e.preview), /Robin/);
  e.format.value = 'json'; p.event('download');
  e.format.value = 'csv'; p.event('download');
  assert.deepEqual(p.downloads.map(d => d.download), ['table-comparison.json', 'table-comparison.csv']);
  p.input('originalText', 'bad');
  assert.equal(e.results.hidden, true); assert.equal(e.download.disabled, true); assert.equal(e.compare.disabled, true);
  p.event('download'); assert.equal(p.downloads.length, 2);
});
test('key and mapping edits hide stale results, with clear errors for missing keys or reused columns', () => {
  const p = setup(), e = p.elements;
  p.event('example'); p.event('compare');
  const rows = e.mappings.children;
  const key = rows[0].children[2].children[0].children[0];
  key.checked = false; key.listeners.change();
  assert.equal(e.results.hidden, true); p.event('compare');
  assert.match(e.compareStatus.textContent, /identifying column/);
  key.checked = true; key.listeners.change();
  const select = rows[1].children[1].children[0]; select.value = '1'; select.listeners.change();
  p.event('compare'); assert.match(e.compareStatus.textContent, /only once/);
});
test('pending file reads disable loading; clear, typing and new files cancel stale contents', async () => {
  const p = setup(), e = p.elements;
  p.event('example'); p.event('compare');
  let complete;
  e.originalFile.files = [{size: 10, text: () => new Promise(resolve => {complete = resolve;})}];
  const reading = p.event('originalFile', 'change');
  assert.equal(e.load.disabled, true); assert.equal(e.results.hidden, true); assert.equal(e.download.disabled, true);
  p.event('clear'); complete('id,v\n1,stale'); await reading;
  assert.equal(e.originalText.value, ''); assert.equal(e.load.disabled, false);
  const reading2 = p.event('originalFile', 'change');
  p.input('originalText', 'id,v\n1,typed'); complete('id,v\n1,stale'); await reading2;
  assert.equal(e.originalText.value, 'id,v\n1,typed');
  let called = false;
  e.originalFile.files = [{size: 6000000, text() {called = true;}}]; await p.event('originalFile', 'change');
  assert.equal(called, false); assert.match(e.loadStatus.textContent, /5 MiB/);
});
test('invalid CSV cannot expose an earlier report; pagination retains the complete data', () => {
  const p = setup(), e = p.elements;
  p.input('originalText', 'id,v');
  p.input('updatedText', 'id,v\n' + Array.from({length:51}, (_, i) => `${i},value`).join('\n'));
  p.event('load');
  const key = e.mappings.children[0].children[2].children[0].children[0]; key.checked = true; key.listeners.change();
  p.event('compare'); p.views[1].listeners.click();
  assert.equal(e.pageCount.textContent, '1–50 of 51'); assert.equal(e.next.disabled, false);
  p.event('next'); assert.equal(e.pageCount.textContent, '51–51 of 51'); assert.equal(e.next.disabled, true);
  p.input('updatedText', 'id,v\n1'); p.event('load');
  assert.match(e.loadStatus.textContent, /expected 2/); assert.equal(e.results.hidden, true); assert.equal(e.download.disabled, true);
});

test('every report format supports copying and downloading, and edits disable both',async()=>{
 const p=setup();p.event('example');p.event('compare');
 for(const format of ['csv','json','txt','md']){p.elements.format.value=format;p.event('format','change');await p.event('copy');assert.match(p.scope.copied,/changed/);assert.equal(p.elements.textPreview.textContent,p.scope.copied);p.event('download');assert.equal(p.downloads.at(-1).download,'table-comparison.'+format);}
 p.input('originalText','changed');assert.equal(p.elements.textPreview.textContent,'');assert.equal(p.elements.copy.disabled,true);
});
