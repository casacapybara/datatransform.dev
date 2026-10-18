const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { defaults, cleanupDefaults } = require('../list-comparison/model.js');
function page({ copyFails = false, analyticsFails = false } = {}) {
  class Element {
    constructor() { this.children = []; this.value = ''; this.checked = true; this.listeners = {}; this.disabled = false; this.attrs = {}; this.textContent = ''; this.classList = { toggle() {} }; }
    addEventListener(name, cb) { this.listeners[name] = cb; }
    setAttribute(name, value) { this.attrs[name] = value; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    focus() { this.focused = true; }
    click() {} remove() {}
  }
  const elements = {}, timers = new Map(), copied = [], downloads = []; let sequence = 0;
  const modes = ['both', 'leftOnly', 'rightOnly', 'all', 'union', 'differences', 'frequency'].map(mode => Object.assign(new Element(), { dataset: { mode } }));
  const scope = vm.createContext({
    document: { getElementById(id) { return elements[id] ||= Object.assign(new Element(), { checked: defaults[id] ?? cleanupDefaults[id] ?? false, value: id === 'outputFormat' ? 'report' : (typeof cleanupDefaults[id] === 'string' ? cleanupDefaults[id] : '') }); }, querySelectorAll() { return modes; }, createElement() { return new Element(); }, body: { appendChild(link) { downloads.push(link); } }, dispatchEvent() {} },
    CsvSuite: require('../csv-search-filter-transform/model.js'),
    navigator: { clipboard: { async writeText(text) { if (copyFails) throw new Error('Denied'); copied.push(text); } } },
    setTimeout(cb) { const id = ++sequence; timers.set(id, cb); return id; }, clearTimeout(id) { timers.delete(id); },
    confirm: () => true, Blob, URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    DataTransformEvents: { emit() { if (analyticsFails) throw new Error('Unavailable'); } },
  });
  for (const file of ['model.js', 'app.js']) vm.runInContext(readFileSync('list-comparison/' + file, 'utf8'), scope);
  const flush = () => { for (const [id, cb] of [...timers]) { timers.delete(id); cb(); } };
  const input = (id, value) => { elements[id].value = value; elements[id].listeners.input(); };
  return { elements, modes, timers, copied, downloads, input, flush };
}
test('edits invalidate old exports immediately; limits and clear cannot expose stale reports', async () => {
  const p = page({ analyticsFails: true }), e = p.elements;
  assert.equal(e.copyBtn.disabled, true);
  p.input('leftText', 'a'); p.flush(); assert.equal(e.copyBtn.disabled, false);
  p.input('leftText', 'x'.repeat(1000001)); assert.equal(e.copyBtn.disabled, true); assert.equal(e.output.textContent, '');
  await e.copyBtn.listeners.click(); assert.equal(p.copied.length, 0);
  p.flush(); assert.match(e.status.textContent, /limited/);
  p.input('leftText', 'a'); e.clearBtn.listeners.click(); p.flush();
  assert.equal(e.output.textContent, ''); assert.equal(e.copyBtn.disabled, true); assert.equal(e.leftText.focused, true);
});
test('copy and downloads use complete reports rather than the bounded preview; modes expose state', async () => {
  const p = page(), e = p.elements;
  p.input('leftText', 'x'.repeat(40000)); p.modes[1].listeners.click();
  assert.equal(e.output.textContent.length, 30000); assert.equal(p.modes[1].attrs['aria-pressed'], 'true');
  await e.copyBtn.listeners.click(); assert.ok(p.copied[0].length > 40000);
  e.downloadBtn.listeners.click(); assert.match(p.downloads[0].download, /list-comparison-.*\.txt/);
});
test('clipboard failure reports an error and keeps download available', async () => {
  const p = page({ copyFails: true }); p.input('leftText', 'a'); p.flush();
  await p.elements.copyBtn.listeners.click(); assert.match(p.elements.status.textContent, /Copy failed/); assert.equal(p.elements.downloadBtn.disabled, false);
});
test('list analytics discard arbitrary data and tolerate missing event support', () => {
  const events = [], scope = vm.createContext({ document: { dispatchEvent(event) { events.push(event.detail); } }, CustomEvent: class { constructor(name, options) { this.detail = options.detail; } } });
  vm.runInContext(readFileSync('assets/events.js', 'utf8'), scope);
  scope.DataTransformEvents.emit('list_compared', { input: 'secret', count: 10 }, 'list-comparison');
  assert.deepEqual(JSON.parse(JSON.stringify(events)), [{ name: 'list_compared', tool: 'list-comparison' }]);
});

test('cleanup and format edits invalidate exports and recompute new list modes', async () => {
  const p = page(), e = p.elements;
  p.input('leftText', 'ID-a\nID-a'); p.input('rightText', 'a\nb');
  p.input('prefix', 'ID-'); p.flush();
  assert.match(e.cleanupPreview.textContent, /ID-a/); assert.match(e.output.textContent, /a/);
  p.input('outputFormat', 'items'); p.modes[4].listeners.click();
  assert.equal(e.output.textContent, 'a\nb\n');
  await e.copyBtn.listeners.click(); assert.equal(p.copied[0], 'a\nb\n');
  p.modes[6].listeners.click(); assert.equal(e.outputFormat.disabled, false); assert.equal(e.outputFormat.value, 'report');
  assert.match(e.output.textContent, /"a"\t2\t1\t1/);
  assert.equal(e.frequencyPreview.hidden, false);
  assert.equal(e.frequencyPreview.children[0].children[1].children[0].children[1].textContent, '2');
  e.replaceEnabled.checked = true; e.replaceEnabled.listeners.input();
  assert.equal(e.copyBtn.disabled, true); p.flush(); assert.match(e.status.textContent, /text to find/);
  assert.equal(e.cleanupPreview.textContent, '');
  assert.equal(e.frequencyPreview.hidden, true); assert.equal(e.frequencyPreview.children.length, 0);
});
test('empty items-only result remains a valid zero-byte copy and download', async () => {
  const p = page(), e = p.elements; p.input('leftText', 'a'); p.input('rightText', 'b'); p.input('outputFormat', 'items'); p.flush();
  assert.equal(e.output.textContent, ''); assert.equal(e.copyBtn.disabled, false);
  await e.copyBtn.listeners.click(); assert.deepEqual(p.copied, ['']);
  e.downloadBtn.listeners.click(); assert.equal(p.downloads.length, 1);
});

test('structured list formats can be copied and downloaded in every view',async()=>{
 const p=page(),e=p.elements;p.input('leftText','a|b\nx');p.input('rightText','x\ny');p.flush();
 for(const mode of p.modes){mode.listeners.click();for(const format of ['csv','json','md','report']){
   p.input('outputFormat',format);p.flush();await e.copyBtn.listeners.click();assert.ok(p.copied.at(-1));assert.equal(e.textPreview.textContent,p.copied.at(-1));assert.equal(e.formattedPanel.hidden,mode.dataset.mode!=='frequency');
   if(format==='json')assert.ok(Array.isArray(JSON.parse(p.copied.at(-1))));
   e.downloadBtn.listeners.click();assert.ok(p.downloads.at(-1).download.endsWith('.'+(format==='report'?'txt':format)));
 }}
});


test('example resets cleanup and modes and provides shared, exclusive and frequency results', () => {
  const p = page(), e = p.elements;
  p.input('prefix', 'Ap'); p.input('leftText', 'old');
  e.example.listeners.click(); p.flush();
  assert.equal(e.prefix.value, ''); assert.equal(e.bothCount.textContent, '2');
  assert.equal(e.leftOnlyCount.textContent, '2'); assert.equal(e.rightOnlyCount.textContent, '1');
  assert.equal(e.copyBtn.disabled, false);
  p.modes.find(m=>m.dataset.mode==='frequency').listeners.click();
  assert.match(e.output.textContent, /"Apples"\t2\t1\t1/);
  e.clearBtn.listeners.click(); assert.equal(e.copyBtn.disabled, true);
});
