const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../compare-tables/model.js');
const parse = M.parse;
function compare(a, b, keys = [0]) {
  const original = parse(a), updated = parse(b), pairs = M.align(original, updated);
  pairs.forEach(p => p.key = keys.includes(p.left));
  return M.compare(original, updated, pairs);
}
test('matches reordered records and columns, preserving textual IDs and exact changed values', () => {
  const r = compare('id,name,status\n001,Ada,Active\n002,Sam,Pending\n003,Lee,Active', 'status,name,id\nApproved,Sam,002\nActive,Robin,004\nActive,Ada,001');
  assert.deepEqual(r.summary, {added: 1, removed: 1, changed: 1, changedCells: 1, unchanged: 1});
  assert.equal(r.added[0].data[2], '004');
  assert.equal(r.removed[0].data[0], '003');
  assert.deepEqual(r.changed[0].cells[0], {originalColumn: 'status', updatedColumn: 'status', before: 'Pending', after: 'Approved'});
  assert.deepEqual(r.changed[0].key, ['002']);
});
test('composite keys avoid delimiter collisions, compare exact case and whitespace', () => {
  const r = compare('id,part,value\n"a,b",c,01\na,"b,c",02', 'id,part,value\na,"b,c",02\n"a,b",c,1', [0, 1]);
  assert.equal(r.summary.changed, 1); assert.equal(r.summary.unchanged, 1);
  const exact = compare('id,v\na,x\nb,z', 'id,v\nA,x\nb,z ');
  assert.equal(exact.summary.added, 1); assert.equal(exact.summary.removed, 1); assert.equal(exact.summary.changedCells, 1);
});
test('explicitly maps renamed columns and reports ignored schema columns', () => {
  const a = parse('id,name,ignored\n1,Ada,old'), b = parse('new_id,label,extra\n1,Ada,new');
  const r = M.compare(a, b, [{left: 0, right: 0, key: true}, {left: 1, right: 1}]);
  assert.equal(r.summary.unchanged, 1);
  assert.deepEqual(r.ignoredColumns, {original: ['ignored'], updated: ['extra']});
  assert.deepEqual(r.columns[0], {original: 'id', updated: 'new_id', identifying: true});
});
test('rejects ambiguous keys and invalid or reused column matches', () => {
  assert.throws(() => compare('id,v\n1,x\n1,y', 'id,v\n1,x'), /Original records 2 and 3/);
  assert.throws(() => compare('id,v\n1,x', 'id,v\n1,x\n1,y'), /Updated records 2 and 3/);
  assert.throws(() => compare('id,v\n" ",x', 'id,v\n1,x'), /blank identifying/);
  assert.throws(() => compare('id,part\n1,', 'id,part\n1,2', [0, 1]), /blank identifying/);
  const a = parse('id,name\n1,Ada');
  assert.throws(() => M.compare(a, a, M.align(a, a)), /identifying column/);
  assert.throws(() => M.compare(a, a, [{left: 0, right: 0, key: true}, {left: 1, right: 0}]), /only once/);
  assert.throws(() => M.compare(a, a, [{left: 0, right: 20, key: true}]), /valid columns/);
});
test('handles header-only tables, all added/removed records, quoted cells and malicious text', () => {
  const r = compare('id,v', 'id,v\n1,"a,b"\n2,"<script>alert(1)</script>"');
  assert.equal(r.summary.added, 2); assert.equal(r.added[0].data[1], 'a,b');
  assert.equal(compare('id,v\n1,x', 'id,v').summary.removed, 1);
  assert.equal(compare('id,v', 'id,v').summary.unchanged, 0);
  const q = compare('id,v\n1,"line1\nline2"', 'id,v\n1,"quote ""ok"""');
  assert.equal(q.changed[0].cells[0].before, 'line1\nline2');
  assert.equal(q.changed[0].cells[0].after, 'quote "ok"');
  assert.throws(() => parse('id,v\n1'), /expected 2/);
});
test('downloads include full changes, mappings and counts with spreadsheet-safe CSV values', () => {
  const r = compare('id,v\n1,"=SUM(A1)"\n2,old', 'id,v\n1,"@formula"\n3,new');
  assert.deepEqual(JSON.parse(M.report(r, 'json')), r);
  const csv = parse(M.report(r, 'csv'));
  assert.equal(csv.rows.length, 5);
  const changed = csv.rows.find(row => row.data[0] === 'changed');
  assert.equal(changed.data[6], "'=SUM(A1)"); assert.equal(changed.data[7], "'@formula");
  assert.equal(changed.data[1], '["1"]');
  assert.equal(parse(M.report(compare('id,v', 'id,v'), 'csv')).rows.length, 0);
});
test('comparison scales to the supported record limit and counts only changed cells', () => {
  const rows = Array.from({length: 20000}, (_, i) => `${i},value`);
  const a = parse('id,v\n' + rows.join('\n'));
  const b = parse('v,id\n' + rows.map((_, i) => `value,${19999-i}`).join('\n'));
  const mappings = M.align(a, b); mappings[0].key = true;
  assert.equal(M.compare(a, b, mappings).summary.unchanged, 20000);
});

test('report budgets stop repeated long column names and header limits bound mapping controls', () => {
  assert.throws(() => parse('id,' + 'x'.repeat(1001)), /1,000 characters/);
  const header = 'id,' + 'x'.repeat(1000);
  const rows = Array.from({length:11000}, (_, i) => `${i},before`).join('\n');
  const updated = Array.from({length:11000}, (_, i) => `${i},after`).join('\n');
  const result = compare(header + '\n' + rows, header + '\n' + updated);
  assert.throws(() => M.report(result, 'json'), /20 million/);
  assert.throws(() => M.report(result, 'csv'), /20 million/);
});
