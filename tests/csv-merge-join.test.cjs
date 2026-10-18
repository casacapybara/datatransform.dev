const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../csv-merge-join/model.js');
const parse = (s, name = 'Table') => M.parse(s, name);
const data = t => t.rows.map(r => r.data);
function join(a, b, changes = {}) {
  return M.join(a, b, {keys: [{a: 0, b: 0}], columns: M.matchColumns(a, b), keep: 'left', duplicates: 'stop', status: true, ...changes});
}
test('stack aligns reordered headers, preserves missing cells, text, Unicode and source order', () => {
  const tables = [parse('id,name\n001,Asha\n002,李', 'One'), parse('name,id,region\nBen,003,North', 'Two')];
  const cols = M.stackColumns(tables), result = M.stack(tables, cols, true);
  assert.deepEqual(result.headers, ['id', 'name', 'region', 'Source table']);
  assert.deepEqual(data(result), [['001','Asha','','One'], ['002','李','','One'], ['003','Ben','North','Two']]);
  assert.equal(tables[0].rows[0].data[0], '001');
});
test('stack supports explicit remapping, exclusion and output names without changing sources', () => {
  const t = [parse('Customer,Source table\nA,x'), parse('Customer name,Source table\nB,y')], cols = M.stackColumns(t);
  cols[0].sources[1] = 0; cols[0].name = 'Customer name'; cols[2].included = false;
  assert.deepEqual(data(M.stack(t, cols, true)), [['A','x','Table'], ['B','y','Table']]);
  assert.deepEqual(M.stack(t, cols, true).headers, ['Customer name', 'Source table', 'Source table (2)']);
  assert.equal(t[1].headers[0], 'Customer name');
});
test('CSV parsing and export preserve multiline text, quoted values, empty rows and BOMs', () => {
  const a = parse('\uFEFFid,note\r\n001,"Hello,\r\n""world"""\r\n002,');
  const b = parse('id,note\n003,é');
  const out = M.stack([a,b], M.stackColumns([a,b]), false);
  assert.deepEqual(data(parse(M.serialize(out, false).text)), data(out));
  assert.throws(() => parse('id,name\n1'), /expected 2/);
  assert.throws(() => parse('id\n"unclosed'), /unclosed/);
  assert.equal(parse('id,id,\n1,2,3').warnings.length, 1);
});
test('matching supports left, inner and full retention with independent unmatched reports', () => {
  const a = parse('id,value\n001,A\n002,B\n,Blank'), b = parse('id,value\n001,X\n003,Y\n,Empty');
  const left = join(a,b);
  assert.deepEqual(left.merged.headers, ['id','value','id (second)','value (second)','Match status']);
  assert.deepEqual(data(left.merged), [['001','A','001','X','Matched'], ['002','B','','','Only in first'], ['','Blank','','','Only in first']]);
  assert.equal(join(a,b,{keep:'inner'}).merged.rows.length,1);
  const full = join(a,b,{keep:'full'});
  assert.equal(full.merged.rows.length,5);
  assert.deepEqual(data(full.unmatchedA), [['002','B'], ['','Blank']]);
  assert.deepEqual(data(full.unmatchedB), [['003','Y'], ['','Empty']]);
  assert.equal(full.stats.blankA,1); assert.equal(full.stats.blankB,1);
});
test('duplicate right keys block merged output, then first, last and every-match are explicit', () => {
  const a = parse('id\nx\nx\ny'), b = parse('id,v\nx,First\nx,Last\nz,No');
  const stopped = join(a,b);
  assert.match(stopped.blocked,/repeated/); assert.equal(stopped.merged,undefined);
  assert.equal(stopped.stats.duplicateA,1); assert.equal(stopped.stats.duplicateB,1);
  assert.deepEqual(data(stopped.unmatchedB), [['z','No']]);
  assert.deepEqual(data(join(a,b,{duplicates:'first'}).merged)[0], ['x','x','First','Matched']);
  assert.deepEqual(data(join(a,b,{duplicates:'last'}).merged)[0], ['x','x','Last','Matched']);
  assert.equal(join(a,b,{duplicates:'all'}).merged.rows.length,5);
  assert.equal(join(a,b,{duplicates:'first'}).unmatchedB.rows.length,1);
});
test('matching is exact by default, optional cleanup affects keys only and blank keys never match', () => {
  const a = parse('id\n001\nA\n b \n" "'), b = parse('id\n1\na\nb\n" "');
  assert.equal(join(a,b).stats.matchedA,0);
  const clean = join(a,b,{trim:true,ignoreCase:true}); assert.equal(clean.stats.matchedA,2);
  assert.equal(clean.stats.unmatchedA,2); assert.equal(data(clean.merged)[2][0],' b ');
});
test('compound keys avoid concatenation collisions and require every selected value', () => {
  const a = parse('a,b\nx,yz\nxy,z\nx,\n__proto__,constructor'), b = parse('a,b\nx,yz\nxy,z\nx,\n__proto__,constructor');
  const out = join(a,b,{keys:[{a:0,b:0},{a:1,b:1}]});
  assert.equal(out.stats.matchedA,3); assert.equal(out.stats.blankA,1);
  assert.throws(() => join(a,b,{keys:[{a:0,b:0},{a:0,b:1}]}),/once/);
  assert.throws(() => join(a,b,{keys:[{a:'',b:0}]}),/Choose matching/);
});
test('output selection, names and helper collisions are checked before export', () => {
  const a = parse('id,Match status\nx,Original'), b = parse('id,id (second)\nx,y');
  const columns = M.matchColumns(a,b); columns[2].included = false;
  const result = join(a,b,{columns}).merged;
  assert.deepEqual(result.headers,['id','Match status','id (second) (2)','Match status (2)']);
  columns[0].name='Same'; columns[1].name='Same';
  assert.throws(() => join(a,b,{columns}),/unique/);
  assert.throws(() => join(a,b,{columns:[]}),/at least one/);
});
test('spreadsheet formula protection covers headers and data while exact export is available', () => {
  const a = parse('=header,note\n=SUM(A1),"<img src=x onerror=alert(1)>"'), b = parse('=header,note\n@x,Safe');
  const result = M.stack([a,b],M.stackColumns([a,b]),false);
  assert.match(M.serialize(result).text,/^'=header/);
  assert.match(M.serialize(result).text,/'=SUM\(A1\)/);
  assert.match(M.serialize(result,false).text,/^=header/);
  assert.equal(M.serialize(result).preview.rows[0][1],'<img src=x onerror=alert(1)>');
});
test('header-only tables yield valid header-only CSVs and unmatched records', () => {
  const a = parse('id'), b = parse('id\nx');
  assert.equal(join(a,b).merged.rows.length,0); assert.equal(join(a,b).unmatchedB.rows.length,1);
  const result = M.stack([a,parse('id')],M.stackColumns([a,parse('id')]),false);
  assert.equal(M.serialize(result).text,'id');
});
test('input and output budgets stop excessive tables, schemas and join expansion', () => {
  const a = parse('id\nx');
  assert.throws(() => M.checkInputs(Array(11).fill(a)),/10/);
  assert.throws(() => M.checkInputs([{...a,bytes:M.LIMITS.bytes+1}]),/20 MiB/);
  assert.throws(() => M.checkInputs([{...a,rows:Array(20001).fill(a.rows[0])}]),/20,000/);
  const large = {...a, rows:Array(150).fill(a.rows[0])};
  assert.throws(() => join(large,large,{duplicates:'all'}),/20,000 rows/);
  const wideA = parse(Array.from({length:60},(_,i)=>'a'+i).join(',')), wideB = parse(Array.from({length:60},(_,i)=>'b'+i).join(','));
  assert.throws(() => M.stackColumns([wideA,wideB]),/100 columns/);
  assert.throws(() => join(wideA,wideB),/100 columns/);
  const long = {...a,rows:Array(10).fill({data:['x'.repeat(2100000)]})};
  assert.throws(() => M.stack([long,a],M.stackColumns([long,a]),false),/20 million/);
});
