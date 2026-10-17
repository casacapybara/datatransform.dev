const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('../list-comparison/model.js');
const membership = ({ both, leftOnly, rightOnly, leftCount, rightCount }) => ({ both, leftOnly, rightOnly, leftCount, rightCount });
const { compare, report, LIMITS } = require('../list-comparison/model.js');
test('list membership preserves left spelling and handles case, whitespace and HTML as text', () => {
  assert.deepEqual(membership(compare(' Apple \nPear\n<script>x</script>', 'apple\nPlum')), { both: ['Apple'], leftOnly: ['<script>x</script>', 'Pear'], rightOnly: ['Plum'], leftCount: 3, rightCount: 2 });
  assert.deepEqual(compare(' A\na', 'a', { caseInsensitive: false, trimWhitespace: false }).leftOnly, [' A']);
  assert.deepEqual(compare('é\ne\u0301\n😀', 'é\n😀', { sortOutput: false }).both, ['é', '😀']);
});
test('deduplication off retains source occurrences with membership rather than frequency subtraction', () => {
  const r = compare('A\na\nx\nx', 'a\ny\ny', { dedupeWithinLists: false, sortOutput: false });
  assert.deepEqual(membership(r), { both: ['A', 'a'], leftOnly: ['x', 'x'], rightOnly: ['y', 'y'], leftCount: 4, rightCount: 3 });
  assert.equal(compare('A\na', 'a').leftCount, 1);
});
test('empty lists, all line endings and retained blanks have explicit semantics', () => {
  assert.equal(compare('', '', { ignoreBlankLines: false }).leftCount, 0);
  assert.deepEqual(compare('a\rb\r\nc\nd', '').leftOnly, ['a', 'b', 'c', 'd']);
  assert.deepEqual(compare('a\n', '', { ignoreBlankLines: false, sortOutput: false }).leftOnly, ['a', '']);
  assert.equal(compare(' \n\t', '').leftCount, 0);
  assert.equal(compare(' \n\t', '', { trimWhitespace: false }).leftCount, 2);
});
test('reports preserve final spaces and blank items, all groups and natural sorting', () => {
  const r = compare('item10\nitem2', 'item1');
  assert.deepEqual(r.leftOnly, ['item2', 'item10']);
  const text = report(compare('tail  \n', '', { trimWhitespace: false, ignoreBlankLines: false, sortOutput: false }), 'leftOnly');
  assert.ok(text.endsWith('tail  \n\n'));
  const full = report(r, 'all', 'Old', 'New', 'test date');
  assert.match(full, /Generated: test date/); assert.match(full, /Items only in "Old"/); assert.match(full, /item1/);
  assert.throws(() => report(r, '__proto__'), /mode/);
});
test('resource limits reject oversized inputs, lines and names while accepting boundaries', () => {
  assert.equal(compare('x'.repeat(LIMITS.inputChars), '').leftCount, 1);
  assert.throws(() => compare('x'.repeat(LIMITS.inputChars + 1), ''), /characters/);
  assert.equal(compare(Array(LIMITS.lines).fill('x').join('\n'), '').leftCount, 1);
  assert.throws(() => compare('\n'.repeat(LIMITS.lines), ''), /lines/);
  assert.throws(() => report(compare('', ''), 'all', 'x'.repeat(101)), /names/);
});

test('merged list and combined differences use matching keys with predictable source order', () => {
  const r = compare(' A\na\nx\nx', 'a\ny\ny', { sortOutput: false, dedupeWithinLists: false });
  assert.deepEqual(r.union, ['A', 'x', 'y']);
  assert.deepEqual(r.differences, ['x', 'x', 'y', 'y']);
  assert.deepEqual(compare('A', 'a', { caseInsensitive: false, sortOutput: false }).union, ['A', 'a']);
  assert.deepEqual(compare('', '').union, []);
});
test('frequency counts all occurrences before dedupe, including unmatched counts and empty items', () => {
  const r = compare('A\na\nx', 'a\ny\ny', { sortOutput: false });
  assert.deepEqual(r.frequency, [
    { item: 'A', left: 2, right: 1, difference: 1 },
    { item: 'x', left: 1, right: 0, difference: 1 },
    { item: 'y', left: 0, right: 2, difference: -2 },
  ]);
  assert.deepEqual(r.frequency, compare('A\na\nx', 'a\ny\ny', { sortOutput: false, dedupeWithinLists: false }).frequency);
  assert.equal(compare('\n', '', { ignoreBlankLines: false }).frequency[0].left, 2);
  const table = report(compare('a\tb\n"q"', ''), 'frequency');
  assert.match(table, /"a\\tb"\t1\t0\t1/);
  assert.match(table, /Difference \(left minus right\)/);
});
test('items-only exports have no headings, preserve whitespace and distinguish no items from an empty item', () => {
  assert.equal(report(compare('A\nB', 'B'), 'union', '', '', undefined, 'items'), 'A\nB\n');
  assert.equal(report(compare('A', 'B'), 'both', '', '', undefined, 'items'), '');
  assert.equal(report(compare('\n', '', { ignoreBlankLines: false }), 'leftOnly', '', '', undefined, 'items'), '\n');
  assert.equal(report(compare(' x  ', '', { trimWhitespace: false }), 'leftOnly', '', '', undefined, 'items'), ' x  \n');
  assert.throws(() => report(compare('', ''), 'all', '', '', undefined, 'items'), /list view/);
});
test('cleanup composes in documented order and changes keys and output without touching source', () => {
  const left = 'ID-a__b.txt\nID-a__b.txt';
  const cleanup = { prefix: 'ID-', suffix: '.txt', replaceEnabled: true, find: '__', replacement: '  ', collapseWhitespace: true };
  const result = compare(left, 'a b', {}, cleanup);
  assert.deepEqual(result.both, ['a b']); assert.equal(result.frequency[0].left, 2);
  assert.equal(result.preview.left[0].before, 'ID-a__b.txt'); assert.equal(result.preview.left[0].after, 'a b');
  assert.deepEqual(compare(left, 'a b').both, []);
  assert.deepEqual(compare('ID-ID-x.txt.txt', '', {}, { prefix: 'ID-', suffix: '.txt' }).leftOnly, ['ID-x.txt']);
});
test('cleanup replacements are literal and NFC is opt-in and preserves accents', () => {
  assert.deepEqual(compare('a.a', '', {}, { replaceEnabled: true, find: '.', replacement: '$&' }).leftOnly, ['a$&a']);
  assert.deepEqual(compare('a.a', '', {}, { replaceEnabled: true, find: '.', replacement: '' }).leftOnly, ['aa']);
  assert.deepEqual(compare('e\u0301', 'é').both, []);
  assert.deepEqual(compare('e\u0301', 'é', {}, { unicodeNormalize: true }).both, ['é']);
  assert.deepEqual(compare('é', 'e', {}, { unicodeNormalize: true }).both, []);
  assert.deepEqual(compare('a\t   b', 'a b', {}, { collapseWhitespace: true }).both, ['a b']);
});
test('cleanup validates enabled replacements and bounds expansion before constructing large strings', () => {
  assert.throws(() => compare('', '', {}, { replaceEnabled: true }), /text to find/);
  assert.throws(() => compare('a', '', {}, { prefix: 'x'.repeat(1001) }), /1,000/);
  assert.throws(() => compare('a', '', {}, { replacement: '\n' }), /line breaks/);
  assert.throws(() => compare('a'.repeat(1000000), '', {}, { replaceEnabled: true, find: 'a', replacement: 'x'.repeat(1000) }), /Cleanup output/);
  assert.throws(() => compare(Array(1001).fill('a').join('\n'), '', {}, { replaceEnabled: true, find: 'a', replacement: 'x'.repeat(1000) }), /Cleanup output/);
});
