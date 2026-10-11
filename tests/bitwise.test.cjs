const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../bitwise-flag-decoder/model.js');
test('unsigned masks decode exactly through bit 63 and bit 127 in all bases', () => {
  for (const width of M.WIDTHS) {
    const high = 1n << BigInt(width - 1), max = (1n << BigInt(width)) - 1n;
    for (const n of [0n, 11n, high, max]) {
      for (const [base, prefix] of [[10, ''], [16, '0x'], [2, '0b'], [8, '0o']]) assert.equal(M.parseValue(prefix + n.toString(base), width), n);
      const reconstructed = M.enabledBits(n, width).reduce((mask, bit) => mask | (1n << BigInt(bit)), 0n);
      assert.equal(reconstructed, n);
    }
    assert.deepEqual(M.enabledBits(high, width), [width - 1]);
    assert.throws(() => M.parseValue((max + 1n).toString(), width), /exceeds/);
  }
  assert.deepEqual(M.enabledBits(M.parseValue('11', 64), 64), [0, 1, 3]);
});
test('blank, invalid, negative and oversized input cannot become a misleading mask', () => {
  assert.equal(M.parseValue('  ', 64), null);
  for (const text of ['-1', '1.2', '1e3', '0x', '0b2', '+5', '12 3', 'NaN', '<script>', '9'.repeat(513)]) assert.throws(() => M.parseValue(text, 64));
  assert.throws(() => M.parseValue('1', 65));
});
test('configuration round trips sparse and Unicode names without storing the mask', () => {
  const config = M.configuration('Permissions', 64, new Map([[63, '高 🦥'], [0, '<script>text</script>'], [1, '']]));
  assert.deepEqual(M.readConfiguration(JSON.stringify(config)), config);
  assert.deepEqual(config.flags.map(flag => flag.bit), [0, 63]);
  assert.deepEqual(Object.keys(config), ['version', 'name', 'bitWidth', 'flags']);
  assert.deepEqual(M.readConfiguration('\uFEFF' + JSON.stringify(config)), config);
});
test('configuration validation rejects duplicate bits, out-of-range bits, wrong types and limits', () => {
  const basic = {version: 1, name: '', bitWidth: 64, flags: []};
  for (const bad of [null, [], {...basic, version: 2}, {...basic, bitWidth: 65}, {...basic, name: 3}, {...basic, name: 'x'.repeat(101)}, {...basic, flags: {}}, {...basic, flags: [{bit: 64, name: 'bad'}]}, {...basic, flags: [{bit: -1, name: 'bad'}]}, {...basic, flags: [{bit: '1', name: 'bad'}]}, {...basic, flags: [{bit: 0, name: 3}]}, {...basic, flags: [{bit: 0, name: 'x'.repeat(201)}]}, {...basic, flags: [{bit: 1, name: 'a'}, {bit: 1, name: 'b'}]}]) assert.throws(() => M.validateConfiguration(bad));
  assert.throws(() => M.readConfiguration('{'), /valid JSON/);
  assert.throws(() => M.readConfiguration(' '.repeat(M.FILE_LIMIT + 1)), /256 KiB/);
  assert.throws(() => M.readConfiguration('高'.repeat(Math.ceil(M.FILE_LIMIT / 3))), /256 KiB/);
});
test('spreadsheet names preserve blank rows, quoted cells, tabs, Unicode and line endings', () => {
  assert.deepEqual(M.bulkNames('Read\r\n\r\n高\r\n', 'names', 3, 64), [{bit:3,name:'Read'}, {bit:4,name:''}, {bit:5,name:'高'}]);
  assert.deepEqual(M.bulkNames('"A\tB"\n"Line 1\nLine 2"\n"Say ""Hi"""', 'names', 0, 8), [{bit:0,name:'A\tB'}, {bit:1,name:'Line 1\nLine 2'}, {bit:2,name:'Say "Hi"'}]);
  assert.deepEqual(M.bulkNames('63\tAdmin\n0\tRead\n1\t\n', 'bits', 0, 64), [{bit:63,name:'Admin'}, {bit:0,name:'Read'}, {bit:1,name:''}]);
  assert.deepEqual(M.bulkNames('\n', 'names', 0, 8), [{bit:0,name:''}]);
});
test('spreadsheet paste rejects ambiguity and overflow before changing labels', () => {
  for (const [text, format, start] of [['Read\nWrite','names',63], ['0\tRead\n0\tWrite','bits',0], ['Bit\tName','bits',0], ['-1\tName','bits',0], ['64\tName','bits',0], ['Read\tWrite','names',0], ['"Missing quote','names',0], ['"Name"bad','names',0], ['x'.repeat(201),'names',0], ['x'.repeat(65537),'names',0]]) assert.throws(() => M.bulkNames(text, format, start, 64));
});

test('even fully named configurations with escaped characters fit the import limit', () => {
  const names = new Map(Array.from({length:128}, (_, bit) => [bit, '\u0000'.repeat(200)]));
  const config = M.configuration('x'.repeat(100), 128, names);
  assert.deepEqual(M.readConfiguration(JSON.stringify(config, null, 2)), config);
});
