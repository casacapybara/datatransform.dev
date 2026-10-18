const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../data-quality-checker/model.js'), C = require('../data-file-converter/model.js'), X = require('../data-file-converter/vendor/xlsx.full.min.js');
const defaults = {rules:[],keys:[],duplicateRows:true,trim:true,ignoreCase:false};
const rule = (column, changes={}) => ({column,required:false,type:'none',numberStyle:'decimal',decimal:'dot',dateFormat:'ymd',allowed:'',...changes});
function loaded(text,format='csv',selection={}) { const s=M.session(X), meta=s.load({text,format});const table=s.select({hasHeader:true,path:meta.defaultPath,excelValues:'display',...selection});return {s,table,check:options=>s.check({...defaults,...options})}; }
function raw(headers,rows,structure=[]) { return {headers,rows,structure}; }
test('uneven CSV rows preserve extra data, identify short rows and retain logical data row numbers',()=>{
  const h=loaded('id,note\n001,"Hello,\nworld"\n002\n003,Text,Extra');assert.deepEqual(h.table.headers,['id','note','Extra cell 1']);
  const result=h.check();assert.equal(result.counts.width,2);assert.equal(result.affected,2);
  const rows=h.s.export({view:'rows',protect:false});assert.deepEqual(C.delimited(rows.text,',').slice(1).map(r=>r.slice(2)),[['002','',''],['003','Text','Extra']]);
  assert.match(h.s.export({view:'issues',protect:false}).text,/Expected 2 cells, found 1/);
  assert.equal(C.delimited(rows.text,',')[1][0],'2');
  assert.throws(()=>C.engine(X).load({format:'csv',text:'id,note\n002'}),/expected 2/); // converter remains strict
});
test('headerless, quoted empty, duplicate-header and BOM CSV inputs retain values',()=>{
  const h=loaded('\uFEFF001,A\r\n002,B,C','csv',{hasHeader:false});assert.deepEqual(h.table.headers,['Column 1','Column 2','Column 3']);assert.equal(h.check().counts.width,1);
  assert.equal(loaded('id\n""\n""').check().counts.rowDuplicate,2);
  const d=loaded('id,id,\n1,2,3');assert.equal(new Set(d.table.headers).size,3);assert.ok(d.table.warnings.length);
  assert.throws(()=>loaded('id,note\n001,"bad'),/unclosed/);
});
test('required blanks are whitespace-aware while optional format checks skip empty values',()=>{
  const table=raw(['id','amount'],[['001',''],['002','  '],['003','no'],['004','2']]);
  const r=M.check(table,{...defaults,duplicateRows:false,rules:[rule(1,{required:true,type:'number'})]});
  assert.equal(r.summary.counts.required,2);assert.equal(r.summary.counts.number,1);assert.equal(r.summary.affected,3);
  const optional=M.check(table,{...defaults,rules:[rule(1,{type:'number'})]});assert.equal(optional.summary.issues,1);
});
test('duplicate keys flag every occurrence, preserve leading zeroes and exclude blank key parts',()=>{
  const t=raw(['id','name'],[['001','A'],['001','B'],['1','C'],['','D'],[' ','E']]);
  const r=M.check(t,{...defaults,duplicateRows:false,keys:[0]});assert.equal(r.summary.counts.keyDuplicate,2);assert.equal(r.summary.counts.keyMissing,2);assert.equal(r.summary.duplicateKeyGroups,1);
  assert.deepEqual(r.issues.map(i=>i.row),[1,2,4,5]);assert.equal(r.summary.affected,4);assert.equal(r.issues[0].value,'001');
});
test('composite key tuples avoid delimiter and special-property collisions',()=>{
  const t=raw(['a','b'],[['x','yz'],['xy','z'],['__proto__','constructor'],['__proto__','constructor'],['x','']]);
  const r=M.check(t,{...defaults,keys:[0,1],duplicateRows:false});assert.equal(r.summary.counts.keyDuplicate,2);assert.equal(r.summary.counts.keyMissing,1);assert.equal(r.summary.duplicateKeyGroups,1);
});
test('matching options affect duplicate and category comparisons without mutating source values',()=>{
  const t=raw(['id','status'],[[' A ',' Active '],['a','active']]);const before=JSON.stringify(t);
  const exact=M.check(t,{...defaults,keys:[0],rules:[rule(1,{type:'category',allowed:'Active'})]});assert.equal(exact.summary.counts.category,1);assert.equal(exact.summary.counts.keyDuplicate,undefined);
  const folded=M.check(t,{...defaults,ignoreCase:true,keys:[0],rules:[rule(1,{type:'category',allowed:'Active'})]});assert.equal(folded.summary.counts.category,undefined);assert.equal(folded.summary.counts.keyDuplicate,2);assert.equal(folded.summary.counts.rowDuplicate,2);assert.equal(JSON.stringify(t),before);
  const untrimmed=M.check(t,{...defaults,trim:false,rules:[rule(1,{type:'category',allowed:'Active'})]});assert.equal(untrimmed.summary.counts.category,2);
});
test('date validation uses explicit order and real calendar rules rather than Date.parse rollover',()=>{
  for(const date of ['2024-02-29','2000-02-29','2026-10-17','0001-01-01'])assert.equal(M.validDate(date,'ymd'),true,date);
  for(const date of ['2026-02-29','1900-02-29','2026-04-31','2026-00-01','0000-01-01','2026-1-01','2026-10-17T12:00Z','17/10/2026'])assert.equal(M.validDate(date,'ymd'),false,date);
  assert.equal(M.validDate('13/2/2026','dmy'),true);assert.equal(M.validDate('13/2/2026','mdy'),false);assert.equal(M.validDate('2/13/2026','mdy'),true);assert.equal(M.validDate('2/13/26','mdy'),false);
  const r=M.check(raw(['date'],[['2026-02-30'],['2026-10-17']]),{...defaults,rules:[rule(0,{type:'date'})]});assert.equal(r.summary.counts.date,1);
});
test('number formats validate text without rounding or accepting grouping, currency or Infinity',()=>{
  for(const v of ['0','-1','+2','.5','1.','1e3','900719925474099312345'])assert.equal(M.validNumber(v,'decimal','dot'),true,v);
  for(const v of ['1,234.56','$1','Infinity','NaN','0x10','1e400',' 1 '])assert.equal(M.validNumber(v,'decimal','dot'),false,v);
  assert.equal(M.validNumber('1234,56','decimal','comma'),true);assert.equal(M.validNumber('1.234,56','decimal','comma'),false);
  assert.equal(M.validNumber('12','integer','dot'),true);assert.equal(M.validNumber('12.0','integer','dot'),false);assert.equal(M.validNumber('1e2','integer','dot'),false);
});
test('category checks use literal values, deduplicate by matching rules and validate their limits',()=>{
  const t=raw(['v'],[['A.b'],['ab'],['<img>'],['']]);
  const r=M.check(t,{...defaults,rules:[rule(0,{type:'category',allowed:'A.b\n<img>\nA.b'})]});assert.equal(r.summary.counts.category,1);
  assert.throws(()=>M.check(t,{...defaults,rules:[rule(0,{type:'category',allowed:' \n'})]}),/1 and 100/);
  assert.throws(()=>M.check(t,{...defaults,rules:[rule(0,{type:'category',allowed:Array.from({length:101},(_,i)=>'v'+i).join('\n')})]}),/1 and 100/);
  assert.throws(()=>M.check(t,{...defaults,rules:[rule(0,{type:'category',allowed:'x'.repeat(201)})]}),/200 characters/);
});
test('multiple issues do not inflate affected-row counts and profile examples never alter row exports',()=>{
  const t=raw(['id','name'],[['x',''],['x',''],['y','long'.repeat(40)]]);
  const r=M.check(t,{...defaults,keys:[0],rules:[rule(1,{required:true})]});assert.equal(r.summary.issues,6);assert.equal(r.summary.affected,2);assert.equal(r.summary.unflagged,1);
  assert.equal(r.profile[1][1],'2');assert.ok(r.profile[1][3].endsWith('…'));assert.equal(r.profile[1][3].length,101);
  assert.equal(M.serialize(t,r,'rows',false).count,2);assert.equal(r.profile[0][2],'2');
});
test('helper headers avoid collisions and CSV protection covers report fields and original cell values',()=>{
  const t=raw(['Data row','Issues','=formula'],[['=1','@x','<img src=x>'],['=1','@x','<img src=x>']]);const r=M.check(t,defaults);
  const out=M.serialize(t,r,'rows',true);assert.deepEqual(out.headers.slice(0,2),['Data row (2)','Issues (2)']);assert.match(out.text,/'=formula/);assert.match(out.text,/'=1/);assert.match(out.text,/'@x/);
  assert.equal(out.preview[0].at(-1),'<img src=x>');assert.ok(M.serialize(t,r,'rows',false).text.includes(',=1,@x,'));
  assert.equal(M.serialize(t,r,'issues').count,2);assert.equal(M.serialize(t,r,'profile').count,3);
});
test('Excel, TSV and JSON reuse local import support and preserve exact numeric tokens',()=>{
  const json=loaded('{"data":[{"id":9007199254740993,"name":null},{"id":9007199254740993,"name":"A"}]}','json');assert.equal(json.check({keys:[0]}).counts.keyDuplicate,2);assert.match(json.s.export({view:'rows',protect:false}).text,/9007199254740993/);
  assert.equal(loaded('id\tname\n001\tA\n001\tB','tsv').check({keys:[0]}).counts.keyDuplicate,2);
  const b=X.utils.book_new();X.utils.book_append_sheet(b,X.utils.aoa_to_sheet([['id','name'],['001','A'],['001','B']]),'Data');const s=M.session(X);s.load({bytes:X.write(b,{type:'array',bookType:'xlsx'}),format:'excel'});s.select({sheet:'Data',hasHeader:true,excelValues:'display'});assert.equal(s.check({...defaults,keys:[0]}).counts.keyDuplicate,2);
});
test('invalid configurations and source changes cannot expose earlier reports',()=>{
  const h=loaded('id\nx\nx');h.check();assert.equal(h.s.export({view:'issues'}).count,2);
  assert.throws(()=>h.check({rules:[rule(0)]}),/enable required/);assert.throws(()=>h.s.export({view:'issues'}),/Run the checks/);
  assert.throws(()=>h.check({keys:[0,0]}),/distinct/);assert.throws(()=>h.check({rules:[rule('',{required:true})]}),/Choose a column/);
  assert.throws(()=>h.check({rules:[rule(0,{required:true}),rule(0,{required:true})]}),/one column check/);
  assert.throws(()=>h.s.load({text:'id\n"bad',format:'csv'}),/unclosed/);assert.throws(()=>h.s.export({view:'issues'}),/Run the checks/);
});
test('header-only tables produce an empty issue CSV and useful column profiles',()=>{
  const h=loaded('id,name'), summary=h.check({keys:[0]});assert.equal(summary.rows,0);assert.equal(summary.issues,0);assert.equal(h.s.export({view:'rows'}).count,0);assert.equal(h.s.export({view:'profile'}).count,2);
});
test('resource limits reject oversized input, padded tables and excessive issue accumulation',()=>{
  assert.throws(()=>loaded('x'.repeat(C.LIMITS.bytes+1)),/5 MiB/);
  assert.throws(()=>loaded('id\n1,'+Array(100).fill('x').join(',')),/100 columns/);
  const t=raw(Array.from({length:10},(_,i)=>'c'+i),Array.from({length:11000},()=>Array(10).fill('')));
  assert.throws(()=>M.check(t,{...defaults,duplicateRows:false,rules:t.headers.map((_,i)=>rule(i,{required:true}))}),/100,000 issues/);
});
