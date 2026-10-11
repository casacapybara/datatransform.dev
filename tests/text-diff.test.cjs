const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const context = vm.createContext({});
for (const file of ['text-diff/vendor/diff-match-patch.js', 'text-diff/diff-model.js']) {
  vm.runInContext(readFileSync(file, 'utf8'), context, { filename: file });
}
const compare = context.TextDiffModel.compare;
function check(a, b) {
  const result = compare(a, b);
  assert.equal(result.identical, a === b);
  for (const [side, expected] of [['left', a], ['right', b]]) {
    const lines = result.rows.map(row => row[side]).filter(Boolean);
    assert.equal(lines.map(line => line.text).join(''), expected);
    lines.forEach((line, i) => {
      assert.equal(line.number, i + 1);
      assert.equal(line.parts.map(part => part.text).join(''), line.text);
      assert.ok(line.parts.every(part => side === 'left' ? part.op !== 1 : part.op !== -1));
    });
  }
  if (a === b) assert.ok(result.rows.every(row => !row.changed));
  else assert.ok(result.rows.some(row => row.changed));
  return result;
}
test('empty, identical, insertion and deletion retain exact source text', () => {
  for (const [a, b] of [['', ''], ['same\n\nend\n', 'same\n\nend\n'], ['', 'added\n'], ['removed\n', '']]) check(a, b);
});
test('line alignment preserves independent numbering and blank placeholders', () => {
  const result = check('one\ntwo\nthree\n', 'zero\none\nthree\n');
  assert.equal(result.rows[0].left, null);
  assert.equal(result.rows[0].right.number, 1);
  assert.equal(result.rows[1].left.number, 1);
  assert.equal(result.rows[1].right.number, 2);
  assert.equal(result.rows[2].right, null);
});
test('whitespace, case, line endings, Unicode and HTML-like strings remain text', () => {
  for (const [a, b] of [['A \n', 'a\n'], ['a\r\nb\r\n', 'a\nb\n'], ['last', 'last\n'], ['💚 café e\u0301\n東京', '💙 café é\n京都'], ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>']]) check(a, b);
});
test('deterministic varied edits never lose content or line numbering', () => {
  let seed = 12345;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const vocabulary = ['alpha\n', '\n', '💚 beta\n', '<b>x</b>\n', ' \t\n', 'last'];
  for (let i = 0; i < 150; i++) {
    const make = () => Array.from({ length: Math.floor(random() * 20) }, () => vocabulary[Math.floor(random() * vocabulary.length)]).join('');
    check(make(), make());
  }
});
test('limits accept exact boundaries and reject excess or non-text inputs', () => {
  check('a'.repeat(200000), 'a'.repeat(200000));
  check('x\n'.repeat(5000), 'x\n'.repeat(5000));
  assert.throws(() => compare('a'.repeat(200001), ''), /input_limit/);
  assert.throws(() => compare('x\n'.repeat(5001), ''), /input_limit/);
  assert.throws(() => compare(null, ''), /input_type/);
});
test('large replacement stays within the UI worker deadline', () => {
  const start = Date.now();
  check('a'.repeat(150000), 'b'.repeat(150000));
  assert.ok(Date.now() - start < 7000);
});
test('upstream library retains its pinned byte-for-byte fingerprint', () => {
  const hash = createHash('sha256').update(readFileSync('text-diff/vendor/diff-match-patch.js')).digest('hex');
  assert.equal(hash, '9a79cf031ac7c2e366416181051acb3e6d2cacf79c5354148f4c71ea20c7e4a3');
});
test('events discard content and unknown names and survive unavailable dispatch', () => {
  const events = [];
  const scope = vm.createContext({ document: { dispatchEvent: event => events.push(event) }, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } });
  vm.runInContext(readFileSync('assets/events.js', 'utf8'), scope);
  scope.DataTransformEvents.emit('comparison_completed', { result: 'different', input: 'private', clipboard: 'private' });
  scope.DataTransformEvents.emit('comparison_failed', { reason: 'private error text' });
  scope.DataTransformEvents.emit('private input');
  assert.deepEqual(JSON.parse(JSON.stringify(events.map(event => event.detail))), [{ name: 'comparison_completed', tool: 'text-diff', result: 'different' }, { name: 'comparison_failed', tool: 'text-diff' }]);
  scope.document.dispatchEvent = () => { throw new Error('unavailable'); };
  assert.doesNotThrow(() => scope.DataTransformEvents.emit('tool_opened'));
});
