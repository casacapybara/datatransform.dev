const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../csv-search-filter-transform/model.js');
const opts = {format:'csv', helpers:false, protect:false, trimValues:true, split:false, splitColumn:'fields', omitEmpty:true, indent:2, variable:'data'};
const filters = {columns:[0,1],mode:'contains',text:'',trim:true,caseSensitive:false,repeat:false};
function rows(csv, options = {}) { const d = M.parse(csv); return {d, items:M.filter(d, {...filters,...options})}; }
test('CSV preserves BOM, quoted commas, quotes, Unicode, embedded CRLF and empty records', () => {
  const csv = '\uFEFFname,fields,empty\r\n"A ""quote""","name, date",\r\n"高\r\n文",,\r\n,,\r\n';
  const {d,items} = rows(csv);
  assert.equal(d.rows.length, 3); assert.equal(d.rows[1].data[0], '高\r\n文');
  assert.equal(M.serialize(d.headers, items, opts).text, csv.slice(1,-2));
  assert.equal(M.parse('one\n""').rows.length, 1);
  assert.equal(M.parse('one\n\n').rows.length, 0);
});
test('malformed CSV is rejected without silently dropping cells', () => {
  for (const csv of ['a,b\n1', 'a,b\n1,2,3','a\n"oops','a\n"ok"bad','a\npart"quote']) assert.throws(()=>M.parse(csv));
  assert.throws(()=>M.parse('a\n'+'x'.repeat(M.LIMITS.bytes)), /5 MiB/);
  assert.throws(()=>M.parse(Array(101).fill('a').join(',')), /100 columns/);
});
test('empty and duplicate headers remain distinct, including special object keys', () => {
  const {d,items} = rows('a,a,,__proto__,constructor\n1,2,3,4,5');
  assert.equal(new Set(d.headers).size, 5);
  const json = JSON.parse(M.serialize(d.headers, items, {...opts, format:'json'}).text);
  assert.deepEqual(Object.values(json[0]), ['1','2','3','4','5']);
  assert.equal(json[0].__proto__, '4');
});
test('constraints search selected cells, and negative matching excludes any term anywhere', () => {
  const csv = 'name,city\nAsha,London\nBen,Bristol\nLondon,Paris';
  assert.equal(rows(csv,{text:'london'}).items.length, 2);
  assert.equal(rows(csv,{text:'london',columns:[1]}).items.length, 1);
  assert.equal(rows(csv,{text:'London\nBEN',mode:'notContains'}).items.length, 0);
  assert.equal(rows(csv,{text:'LON',mode:'startsWith'}).items.length, 2);
  assert.equal(rows(csv,{text:'don',mode:'endsWith'}).items.length, 2);
  assert.equal(rows(csv,{text:'london',mode:'exact',caseSensitive:true}).items.length, 0);
  assert.equal(rows(csv,{text:'\n\n',columns:[]}).items.length, 3);
  assert.throws(()=>rows(csv,{text:'a',columns:[]}), /Select at least/);
});
test('repeat mode emits once per matching criterion, not once per matching cell', () => {
  const {items} = rows('a,b\nfoo,foo bar', {text:'foo\nFOO\nbar',repeat:true});
  assert.equal(items.length, 2); assert.deepEqual(items[0].columns,[0,1]);
  assert.equal(rows('a,b\nfoo,foo bar', {text:'foo\nbar',repeat:false}).items.length,1);
});
test('changes compose in order without mutating input; selection, rename and order apply to all formats', () => {
  const {d,items} = rows('id,name,fields\n001,Asha,"a, b,,"');
  const changed = M.transform(items,[{column:1,value:'First'},{column:1,value:'Last'},{column:0,value:''}]);
  assert.deepEqual(d.rows[0].data,['001','Asha','a, b,,']);
  const projection = [{index:2,name:'List'},{index:1,name:'Person'}];
  assert.equal(M.serialize(d.headers,changed,{...opts,projection}).text, 'List,Person\r\n"a, b,,",Last');
  const json = M.serialize(d.headers,changed,{...opts,projection,format:'json',split:true});
  assert.deepEqual(JSON.parse(json.text),[{List:['a','b'],Person:'Last'}]);
  const js = M.serialize(d.headers,changed,{...opts,projection,format:'js',variable:'class'});
  assert.match(js.text, /^const _class = /); assert.doesNotThrow(()=>new Function(js.text));
});
test('output column validation prevents lossy JSON and helper names avoid collisions', () => {
  const {d,items} = rows('Source record,a\n1,2');
  for (const projection of [[],[{index:0,name:''}],[{index:0,name:'a'},{index:1,name:' a '}]]) assert.throws(()=>M.serialize(d.headers,items,{...opts,projection}));
  const result = M.serialize(d.headers,items,{...opts,format:'json',helpers:true});
  assert.equal(Object.keys(JSON.parse(result.text)[0]).length,5);
  assert.match(result.text, /Source record \(2\)/);
});
test('JSON whitespace, arrays and numeric-looking header order survive serialization', () => {
  const {d,items} = rows('1,2,fields\n001, 02 ," a, ,b,"');
  for (const indent of [0,2,4]) {
    const result = M.serialize(d.headers,items,{...opts,format:'json',indent,projection:[{index:1,name:'2'},{index:0,name:'1'},{index:2,name:'fields'}],split:true});
    assert.ok(result.text.indexOf('"2"') < result.text.indexOf('"1"'));
    assert.deepEqual(JSON.parse(result.text), [{'1':'001','2':'02',fields:['a','b']}]);
  }
  assert.deepEqual(JSON.parse(M.serialize(d.headers,items,{...opts,format:'json',split:true,trimValues:false,omitEmpty:false}).text)[0].fields,[' a',' ','b','']);
});
test('CSV spreadsheet protection is explicit and does not change loaded values or JSON', () => {
  const {d,items} = rows('a,b\n=1+1,\t@SUM(1)');
  const protectedCsv = M.serialize(d.headers,items,{...opts,protect:true}).text;
  assert.equal(M.parse(protectedCsv).rows[0].data[0],"'=1+1");
  assert.equal(items[0].data[0], '=1+1');
  assert.equal(JSON.parse(M.serialize(d.headers,items,{...opts,format:'json'}).text)[0].a,'=1+1');
});
test('empty output is valid in every format and search budgets are enforced', () => {
  for (const format of ['csv','json','js']) assert.ok(M.serialize(['a'],[],{...opts,format}).text);
  assert.throws(()=>M.terms(Array.from({length:101},(_,i)=>'term'+i).join('\n')),/100 distinct/);
  const dataset = {headers:['a'],rows:Array(50001).fill({data:['a'],record:2})};
  assert.throws(()=>M.filter(dataset,{...filters,text:Array.from({length:100},(_,i)=>'t'+i).join('\n')}),/too large/);
});
test('JavaScript exports preserve __proto__ as an own data key', () => {
  const {d,items} = rows('__proto__,id\ntext,001');
  const output = M.serialize(d.headers,items,{...opts,format:'js'});
  const data = new Function(output.text+'; return data;')();
  assert.equal(Object.hasOwn(data[0],'__proto__'),true); assert.equal(data[0].__proto__,'text');
});
test('expanded CSV and JSON exports stop at the output size limit', () => {
  const item = {record:2,criteria:[],columns:[],data:['x'.repeat(21000)]};
  for (const format of ['csv','json']) assert.throws(()=>M.serialize(['value'],Array(1000).fill(item),{...opts,format}), /20 million characters/);
});
test('empty-cell filters use any/all selected columns and explicit whitespace rules', () => {
  const d = M.parse('a,b\n,\n ,x\ny,z');
  const filter = extra => M.filter(d,{...filters,text:'ignored',mode:'empty',...extra});
  assert.equal(filter({}).length,2);assert.equal(filter({cellPolicy:'all'}).length,1);
  assert.equal(filter({trim:false}).length,1);assert.equal(filter({mode:'nonEmpty',cellPolicy:'all'}).length,1);
  assert.equal(filter({mode:'nonEmpty',columns:[1]}).length,2);
  assert.throws(()=>filter({columns:[]}), /Select at least/);
  assert.deepEqual(filter({})[1].columns,[0]);
});
test('literal find/replace composes with set changes, supports case and replacement metacharacters', () => {
  const {items} = rows('a,b\n"A.b a.b [x]",keep');
  const replacement = {type:'replace',column:0,find:'a.b',value:'$&',caseSensitive:false};
  assert.equal(M.transform(items,[replacement])[0].data[0], '$& $& [x]');
  assert.equal(M.transform(items,[{...replacement,caseSensitive:true}])[0].data[0], 'A.b $& [x]');
  assert.equal(M.transform(items,[{...replacement,find:'[x]',value:''}])[0].data[0], 'A.b a.b ');
  assert.equal(M.transform(items,[{column:0,value:'old old'},{...replacement,find:'old',value:'new'}])[0].data[0], 'new new');
  assert.equal(items[0].data[1],'keep');assert.throws(()=>M.transform([],[{...replacement,find:''}]), /Enter text/);
});
test('duplicates compare tuples without collisions, preserve the first and offer normalization', () => {
  const {items} = rows('a,b\nA,1\nA,2\na ,3\nA,1\n,4\n,5');
  const whole = M.deduplicate(items,{enabled:true,columns:[0,1]});assert.equal(whole.removed,1);
  const keyed = M.deduplicate(items,{enabled:true,columns:[0],trim:true,ignoreCase:true});
  assert.equal(keyed.removed,4);assert.deepEqual(keyed.items.map(r=>r.data),[['A','1'],['','4']]);
  assert.throws(()=>M.deduplicate(items,{enabled:true,columns:[]}), /key column/);
  assert.equal(M.deduplicate(items,{enabled:false,columns:[]}).items, items);
  const unusual = [{data:['a|b','c']},{data:['a','b|c']}];assert.equal(M.deduplicate(unusual,{enabled:true,columns:[0,1]}).removed,0);
});
test('multi-column sort is stable, numeric when chosen, blank-last and non-mutating', () => {
  const {items} = rows('group,value,id\nb,2,1\na,10,2\na,2,3\na,2,4\na,,5');
  const sorted = M.sortRows(items,[{column:0,type:'text',direction:'asc'},{column:1,type:'number',direction:'desc'}]);
  assert.deepEqual(sorted.map(r=>r.data[2]),['2','3','4','5','1']);assert.equal(items[0].data[2],'1');
  assert.deepEqual(M.sortRows(items,[{column:1,type:'text',direction:'asc'}]).map(r=>r.data[1]),['10','2','2','2','']);
  for (const value of ['abc','Infinity','0x10','9007199254740993']) assert.throws(()=>M.sortRows([{data:[value]}],[{column:0,type:'number',direction:'asc'}]));
});
test('manual rows bypass prior transformations but participate in dedupe/sort and every export', () => {
  const {d,items} = rows('id,name\n1,Asha');
  const manual = ['2','Manual\n"quoted"'];
  const all = M.appendManual(M.transform(items,[{column:1,value:'Changed'}]),[manual,['1','Changed']],2);
  assert.equal(all[1].record,'Manual');assert.equal(all[1].data[1],manual[1]);
  const result = M.sortRows(M.deduplicate(all,{enabled:true,columns:[0,1]}).items,[{column:0,type:'number',direction:'desc'}]);
  for (const format of ['csv','json','js']) assert.match(M.serialize(d.headers,result,{...opts,format,helpers:true}).text,/Manual/);
  assert.throws(()=>M.appendManual(items,[['wrong width']],2));assert.throws(()=>M.appendManual(Array(M.LIMITS.rows).fill(items[0]),[manual],2), /20,000/);
});
test('empty constraints ignore unused term limits and blank single-column manual rows round trip', () => {
  const dataset = M.parse('a\n""');
  const empty = M.filter(dataset,{...filters,columns:[0],mode:'empty',text:Array(101).fill(0).map((_,i)=>String(i)).join('\n')});
  assert.equal(empty.length,1);
  const output = M.serialize(['a'],M.appendManual([], [['']],1),opts);
  assert.equal(M.parse(output.text).rows.length,1);
});
test('replacement expansion stops before allocating oversized output cells', () => {
  assert.throws(()=>M.transform([{data:['a'.repeat(10000)]}],[{type:'replace',column:0,find:'a',value:'x'.repeat(10000)}]), /20 million/);
});
