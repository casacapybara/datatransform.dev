const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('index.html', 'utf8');
const config = JSON.parse(fs.readFileSync('config/home-tools.json', 'utf8'));
const toolCount = Object.keys(config).length;

test('build embeds metadata for every card, escapes text and rejects config drift', async () => {
  const { renderHomeTools } = await import('../scripts/home-tools.mjs');
  const html = renderHomeTools(source, config);
  assert.equal((html.match(/data-search-terms=/g) || []).length, toolCount);
  assert.equal((html.match(/aria-label="Categories"/g) || []).length, toolCount);
  assert.match(html, /data-search-terms="[^"]*vlookup/);
  assert.doesNotMatch(html, /<li>vlookup<\/li>/);
  const changed = structuredClone(config);
  changed['text-diff'].searchTerms = ['" onfocus="alert(1)', '<script>'];
  changed['text-diff'].categories = ['<b>Text & comparison</b>'];
  const escaped = renderHomeTools(source, changed);
  assert.match(escaped, /&quot; onfocus=&quot;alert\(1\) &lt;script&gt;/);
  assert.match(escaped, /<li>&lt;b&gt;Text &amp; comparison&lt;\/b&gt;<\/li>/);
  delete changed['text-diff'];
  assert.throws(() => renderHomeTools(source, changed), /Missing home tool metadata: text-diff/);
  assert.throws(() => renderHomeTools(source, { ...config, stale: config['text-diff'] }), /no matching card: stale/);
  assert.throws(() => renderHomeTools(source, { ...config, 'text-diff': { categories: 'Text', searchTerms: [] } }), /must be an array/);
  assert.throws(() => renderHomeTools(source, { ...config, 'text-diff': { ...config['text-diff'], searchTerm: [] } }), /Unknown home tool field/);
  assert.doesNotThrow(() => renderHomeTools(source, { ...config, 'text-diff': { categories: [], searchTerms: [] } }));
});

function harness() {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', hidden: true, disabled: false, textContent: '', listeners: {}, addEventListener(event, fn) { this.listeners[event] = fn; }, focus() { this.focused = true; }, click() { this.listeners.click(); } });
    return nodes.get(id);
  };
  const cards = [...source.matchAll(/<a class="panel tool-card" href="(?:\.\/)?([^/]+)\/">([\s\S]*?)<\/a>/g)].map(([, slug, content]) => ({
    hidden: false, dataset: { searchTerms: config[slug].searchTerms.join(' ') },
    querySelector(selector) { return { textContent: content.match(new RegExp(`<${selector}>(.*?)</${selector}>`))[1] }; },
    querySelectorAll() { return config[slug].categories.map(textContent => ({ textContent })); }
  }));
  const window = { addEventListener(event, fn) { this[event] = fn; } };
  vm.runInNewContext(fs.readFileSync('assets/home-search.js', 'utf8'), { document: { getElementById: node, querySelectorAll: () => cards }, window });
  return { node, window, cards, search(value) { node('tool-search').value = value; node('tool-search').listeners.input(); }, count() { return cards.filter(card => !card.hidden).length; } };
}

test('live search matches title, description, hidden synonyms and categories', () => {
  const h = harness();
  assert.equal(h.count(), toolCount);
  assert.equal(h.node('tool-search-controls').hidden, false);
  for (const query of ['JSON explorer', 'nested fields', 'vlookup', 'Combining']) {
    h.search(query);
    assert.equal(h.count(), 1, query);
  }
  h.search('  JSoN   ÉXPLORER  ');
  assert.equal(h.count(), 1);
  h.search('combining vlookup'); // Words can match different metadata fields.
  assert.equal(h.count(), 1);
  h.search('no-such-tool');
  assert.equal(h.count(), 0);
  assert.equal(h.node('tool-search-empty').hidden, false);
  assert.equal(h.node('tool-search-count').textContent, `0 of ${toolCount} tools`);
  h.node('clear-tool-search').click();
  assert.equal(h.count(), toolCount);
  assert.equal(h.node('tool-search').focused, true);
  assert.equal(h.node('clear-tool-search').disabled, true);
  h.search('   ');
  assert.equal(h.count(), toolCount);
  h.search('<script>');
  assert.equal(h.count(), 0);
  h.node('tool-search').listeners.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(h.count(), toolCount);
  h.node('tool-search').value = 'vlookup';
  h.window.pageshow();
  assert.equal(h.count(), 1);
});
