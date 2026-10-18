const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

// Exercise runtime selection and cancellation with the real comparison model.
function page(protocol, supportsWorker = true) {
  class Element {
    constructor() { this.children = []; this.listeners = {}; this.attrs = {}; this.hidden = true; this.value = ''; this.classList = { add() {}, remove() {}, toggle() {} }; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.append(child); }
    click() {} remove() {}
    replaceChildren(...children) { this.children = children; }
    setAttribute(name, value) { this.attrs[name] = value; }
    removeAttribute(name) { delete this.attrs[name]; }
  }
  const elements = Object.fromEntries(['example', 'original', 'updated', 'compare', 'message', 'results', 'diff-output', 'diff-status', 'previous', 'next', 'copyReport', 'downloadReport', 'exportStatus', 'exportFormat', 'textPreview'].map(id => [id, new Element()]));
  const timers = new Map(); let sequence = 0; const workers = [];
  const scope = vm.createContext({
    CsvSuite:require('../csv-search-filter-transform/model.js'), Blob, URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},
    location: { protocol }, navigator: {clipboard:{writeText:async text=>scope.copied=text}},
    document: { body:new Element(), getElementById: id => elements[id], querySelectorAll: () => [], createElement: () => new Element(), createDocumentFragment: () => new Element() },
    setTimeout: callback => { const id = ++sequence; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    Worker: supportsWorker ? class {
      constructor(url) { this.url = url; this.listeners = {}; workers.push(this); }
      addEventListener(name, callback) { this.listeners[name] = callback; }
      postMessage(data) { this.data = data; }
      terminate() { this.terminated = true; }
    } : undefined,
  });
  for (const file of ['text-diff/vendor/diff-match-patch.js', 'text-diff/diff-model.js', 'text-diff/app.js']) vm.runInContext(readFileSync(file, 'utf8'), scope);
  return { scope, elements, workers, timers, runPending() { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } } };
}
test('direct local files compare successfully without attempting a forbidden worker', () => {
  const p = page('file:');
  p.elements.original.value = 'Before\n'; p.elements.updated.value = 'After\n';
  p.elements.compare.listeners.click();
  assert.equal(p.workers.length, 0);
  p.runPending();
  assert.equal(p.elements.results.hidden, false);
  assert.match(p.elements.message.textContent, /Comparison complete/);
  assert.equal(p.elements.compare.disabled, false);
});
test('editing cancels a queued local comparison and prevents stale results', () => {
  const p = page('file:');
  p.elements.compare.listeners.click(); p.elements.updated.listeners.input();
  p.runPending();
  assert.equal(p.elements.results.hidden, true);
  assert.equal(p.timers.size, 0);
  assert.equal(p.elements.compare.disabled, false);
});
test('hosted comparison retains the background worker and handles its result', () => {
  const p = page('https:');
  p.elements.original.value = 'Same'; p.elements.updated.value = 'Same';
  p.elements.compare.listeners.click();
  assert.equal(p.workers.length, 1);
  assert.equal(p.workers[0].url, './diff-worker.js');
  assert.equal(p.workers[0].data.original, 'Same');
  p.workers[0].listeners.message({ data: { result: { rows: [], identical: true } } });
  assert.equal(p.elements.message.textContent, 'The texts are identical.');
  assert.equal(p.workers[0].terminated, true);
  assert.equal(p.timers.size, 0);
});
test('browsers without workers can still compare identical text', () => {
  const p = page('https:', false);
  p.elements.original.value = p.elements.updated.value = 'Same';
  p.elements.compare.listeners.click(); p.runPending();
  assert.equal(p.elements.message.textContent, 'The texts are identical.');
  assert.equal(p.elements.results.hidden, false);
});

test('all text diff formats copy complete line content and reset invalidates exports',async()=>{
 const p=page('file:');p.elements.original.value='a|b\n';p.elements.updated.value='c\n';p.elements.compare.listeners.click();p.runPending();
 for(const format of ['csv','json','txt','md']){p.elements.exportFormat.value=format;p.elements.exportFormat.listeners.change();await p.elements.copyReport.listeners.click();assert.match(p.scope.copied,/a/);assert.equal(p.elements.textPreview.textContent,p.scope.copied);assert.match(p.elements.exportStatus.textContent,/copied/);p.elements.downloadReport.listeners.click();assert.match(p.elements.exportStatus.textContent,/Download started/);}
 p.elements.updated.listeners.input();assert.equal(p.elements.textPreview.textContent,'');assert.equal(p.elements.copyReport.disabled,true);assert.equal(p.elements.downloadReport.disabled,true);
});


test('example cancels pending comparisons and produces a changed report', () => {
  const p = page('file:');
  p.elements.original.value = 'old'; p.elements.updated.value = 'old';
  p.elements.compare.listeners.click();
  p.elements.example.listeners.click(); p.runPending();
  assert.equal(p.elements.results.hidden, true);
  assert.equal(p.elements.copyReport.disabled, true);
  p.elements.compare.listeners.click(); p.runPending();
  assert.equal(p.elements.results.hidden, false);
  assert.match(p.elements.message.textContent, /Comparison complete/);
  assert.equal(p.elements.copyReport.disabled, false);
});


test('formatted preview is bounded while copying retains the complete report', async () => {
  const p = page('file:');
  p.elements.original.value = 'a'.repeat(31000);
  p.elements.updated.value = 'updated';
  p.elements.exportFormat.value = 'json';
  p.elements.compare.listeners.click(); p.runPending();
  await p.elements.copyReport.listeners.click();
  assert.ok(p.scope.copied.length > 30000);
  assert.equal(p.elements.textPreview.textContent.slice(0, 30000), p.scope.copied.slice(0, 30000));
  assert.match(p.elements.textPreview.textContent.slice(30000), /Preview truncated/);
  assert.ok(p.elements.textPreview.textContent.length < 30100);
  p.elements.updated.listeners.input();
  assert.equal(p.elements.textPreview.textContent, '');
});
