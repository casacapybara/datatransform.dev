const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), crypto = require('node:crypto');
const M = require('../data-file-converter/model.js'), X = require('../data-file-converter/vendor/xlsx.full.min.js');
function converter(text, format='csv', selection={}) {
  const e = M.engine(X), meta=e.load({text,format});
  const table=e.select({hasHeader:true,path:meta.defaultPath,excelValues:'display',...selection});
  return {e,meta,table,out:(format, extra={})=>e.export({columns:table.headers.map((_,i)=>i),format,protect:false,...extra})};
}
function book(sheets, format='xlsx') {
  const b=X.utils.book_new();for(const [name,sheet] of Object.entries(sheets))X.utils.book_append_sheet(b,sheet,name);
  return X.write(b,{type:'array',bookType:format});
}
test('CSV and TSV retain textual IDs, BOM, quoting, blank cells, Unicode and all line endings', () => {
  const csv='\uFEFFid,note,empty\r\n001,"Hello,\r\n""world""",\r\n002,李,';
  const c=converter(csv); // explicitly strip BOM as the load entry point does
  assert.deepEqual(c.table.preview,[['001','Hello,\r\n"world"',''],['002','李','']]);
  const t=converter(c.out('tsv').text,'tsv');assert.deepEqual(t.table.preview,c.table.preview);
  const r=converter(t.out('csv').text);assert.deepEqual(r.table.preview,c.table.preview);
  assert.equal(JSON.parse(c.out('json').text)[0].id,'001');
  assert.deepEqual(converter('id\n""\nA').table.preview,[[''],['A']]);
});
test('headers are optional, normalized without collisions, and malformed CSV cannot truncate data', () => {
  assert.deepEqual(converter('001,Asha\n002,Ben','csv',{hasHeader:false}).table.headers,['Column 1','Column 2']);
  const c=converter('id,id,id (2),\n1,2,3,4');assert.equal(new Set(c.table.headers).size,4);assert.equal(c.table.warnings.length,1);
  assert.throws(()=>converter('id,name\n001'),/expected 2/);
  assert.throws(()=>converter('id\n"A"tail'),/closing quote/);
  assert.throws(()=>converter('id\nA"B'),/Quote the whole/);
  assert.throws(()=>converter('id\n"A'),/unclosed/);
});
test('Markdown escapes pipes, backslashes, HTML, formatting punctuation and cell line breaks', () => {
  const c=converter('name,note\n"A|B","<script> & *bold* `code` \\path\nnext"');
  const md=c.out('md');
  assert.equal(md.extension,'md');assert.match(md.text,/^\| name \| note \|\n\| --- \| --- \|/);
  assert.ok(md.text.includes('A\\|B'));assert.ok(md.text.includes('&lt;script&gt; &amp; \\*bold\\* \\`code\\` \\\\path<br>next'));
  assert.doesNotMatch(md.text,/<script>/);assert.deepEqual(md.preview,c.table.preview);
  assert.equal(converter('id').out('md').text,'| id |\n| --- |');
});
test('JSON number tokens retain long integers, decimals, exponent notation and negative zero exactly', () => {
  const input='[{"id":900719925474099312345,"decimal":0.123456789012345678901,"huge":1e400,"tiny":1e-400,"zero":-0}]';
  const c=converter(input,'json');
  for(const token of ['900719925474099312345','0.123456789012345678901','1e400','1e-400','-0'])assert.ok(c.out('json').text.includes(token));
  assert.ok(c.out('csv').text.includes('900719925474099312345'));
  const workbook=X.read(c.out('xlsx').bytes,{type:'array'}), sheet=workbook.Sheets['Converted data'];
  assert.equal(sheet.A2.t,'s');assert.equal(sheet.A2.v,'900719925474099312345');assert.equal(sheet.B2.v,'0.123456789012345678901');
});
test('nested JSON selects collections and fields without path collisions or special-key loss', () => {
  const c=converter('{"meta":{"total":2},"data":[{"id":"001","customer":{"name":"Asha"},"customer.name":"Literal","tags":[1,true],"__proto__":"safe"},{"id":"002","customer":{"name":"Ben"},"tags":null}]}','json');
  assert.equal(c.meta.defaultPath,'["data"]');
  assert.deepEqual(c.table.headers,['id','customer.name','["customer.name"]','tags','__proto__']);
  const output=c.out('json'), parsed=JSON.parse(output.text);
  assert.equal(parsed[0].__proto__,'safe');assert.equal(parsed[0]['customer.name'],'Asha');assert.deepEqual(parsed[0].tags,[1,true]);
  assert.equal(parsed[1].tags,null);assert.equal(Object.hasOwn(parsed[1],'["customer.name"]'),false);
  const subset=c.e.export({columns:[0,1],format:'json'});assert.deepEqual(Object.keys(JSON.parse(subset.text)[0]),['id','customer.name']);
});
test('multiple JSON arrays require selection; scalar and matrix records have explicit semantics', () => {
  const e=M.engine(X), meta=e.load({format:'json',text:'{"a":[1,2],"b":[3,4]}'});assert.equal(meta.defaultPath,'');
  assert.throws(()=>e.select({path:'',hasHeader:true}),/Choose the JSON collection/);
  assert.deepEqual(e.select({path:'["b"]',hasHeader:true}).preview,[['3'],['4']]);
  assert.deepEqual(converter('[true,null,"x"]','json').table.preview,[['true'],[''],['x']]);
  const matrix=converter('[["id","name"],["001","Asha"]]','json');assert.equal(matrix.meta.collections[0].matrix,true);assert.deepEqual(matrix.table.headers,['id','name']);
  assert.throws(()=>converter('[{"id":1},2]','json'),/Mixed record shapes/);
});
test('a primitive value never supplies fields when another record uses a nested object at the same path', () => {
  const c=converter('[{"a":123,"b":"Text"},{"a":{"token":"Real field"},"b":{"length":4}}]','json');
  const rows=JSON.parse(c.out('json').text);
  assert.equal(Object.hasOwn(rows[0],'a.token'),false);assert.equal(Object.hasOwn(rows[0],'b.length'),false);
  assert.equal(rows[1]['a.token'],'Real field');assert.equal(rows[1]['b.length'],4);
});
test('JSON and JSON Lines validation rejects duplicate keys, invalid grammar and excessive nesting', () => {
  for(const bad of ['{"id":1,"id":2}','[1,]','{"x":01}','{"x":NaN}','{"x":1e}','"unterminated','[true false]','{}tail','{"x":"bad\nstring"}'])assert.throws(()=>converter(bad,'json'),/JSON/);
  assert.throws(()=>converter('['.repeat(42)+'1'+']'.repeat(42),'json'),/40 nesting/);
  const c=converter('{"id":"001","ok":true}\r\n\r\n{"id":"002","ok":false}','jsonl');
  assert.equal(c.table.count,2);assert.equal(c.out('jsonl').text.split('\n').length,2);
  assert.throws(()=>converter('{"id":1}\n{"id":}','jsonl'),/record 2/);
});
test('spreadsheet protection covers headers and values, while Markdown and JSON retain original values', () => {
  const c=converter('=header,id\n=1+1,001\n@cmd,002\n"\tvalue",003');
  assert.match(c.out('csv',{protect:true}).text,/^'=header/);assert.match(c.out('csv',{protect:true}).text,/'=1\+1/);
  assert.match(c.out('csv').text,/^=header/);assert.equal(JSON.parse(c.out('json').text)[0]['=header'],'=1+1');
  const b=X.read(c.out('xlsx').bytes,{type:'array'});assert.equal(b.Sheets['Converted data'].A2.t,'s');assert.equal(b.Sheets['Converted data'].A2.f,undefined);
});
test('Excel worksheet selection preserves formatted IDs and supports raw numbers and dates', () => {
  const s=X.utils.aoa_to_sheet([['id','amount','date'],[1,12.5,45000]]);s.A2.z='00000';s.B2.z='$0.00';s.C2.z='yyyy-mm-dd';
  const bytes=book({Summary:X.utils.aoa_to_sheet([['heading'],['hello']]),Data:s});
  const e=M.engine(X), meta=e.load({format:'excel',bytes});assert.equal(meta.sheets.length,2);
  const display=e.select({sheet:'Data',hasHeader:true,excelValues:'display'});assert.deepEqual(display.preview[0],['00001','$12.50','2023-03-15']);
  const raw=e.select({sheet:'Data',hasHeader:true,excelValues:'raw'});assert.deepEqual(raw.preview[0],['1','12.5','45000']);
  assert.equal(JSON.parse(e.export({columns:[0,1,2],format:'json'}).text)[0].amount,12.5);
  assert.throws(()=>e.select({sheet:'Missing',hasHeader:true}),/available worksheet/);
});
test('legacy binary XLS works and plain text masquerading as Excel is rejected', () => {
  const e=M.engine(X);e.load({format:'auto',name:'example.xls',bytes:book({Data:X.utils.aoa_to_sheet([['id'],['001']])},'biff8')});
  assert.deepEqual(e.select({sheet:'Data',hasHeader:true,excelValues:'display'}).preview,[['001']]);
  assert.throws(()=>e.load({format:'excel',bytes:new TextEncoder().encode('id\n001').buffer}),/valid .xlsx/);
});
test('Excel cached formulas are values only, missing cached formulas block export, and errors remain text', () => {
  const s=X.utils.aoa_to_sheet([['value'],[2]]);s.A2.f='1+1';
  const e=M.engine(X);e.load({format:'excel',bytes:book({Data:s})});
  const table=e.select({sheet:'Data',hasHeader:true,excelValues:'display'});assert.equal(table.preview[0][0],'2');assert.match(table.warnings.join(' '),/stored results/);
  const out=X.read(e.export({columns:[0],format:'xlsx'}).bytes,{type:'array'});assert.equal(out.Sheets['Converted data'].A2.f,undefined);
  const missing=X.utils.aoa_to_sheet([['value']]);missing.A2={t:'n',f:'1+1'};missing['!ref']='A1:A2';
  e.load({format:'excel',bytes:book({Data:missing})});assert.throws(()=>e.select({sheet:'Data',hasHeader:true,excelValues:'display'}),/no stored result/);
});
test('Excel rejects huge declared ranges, large cells and excessive ZIP expansion', () => {
  const sheet=X.utils.aoa_to_sheet([['id'],['x']]);sheet['!ref']='A1:A30000';
  const e=M.engine(X);e.load({format:'excel',bytes:book({Data:sheet})});assert.throws(()=>e.select({sheet:'Data',hasHeader:true,excelValues:'display'}),/Worksheet range/);
  const c=converter('id\n'+ 'a'.repeat(32768));assert.throws(()=>c.out('xlsx'),/32,767/);
  const bytes=book({Data:X.utils.aoa_to_sheet([['id'],['x']])}), u=new Uint8Array(bytes), v=new DataView(bytes);
  for(let i=0;i<u.length-46;i++)if(v.getUint32(i,true)===0x02014b50){v.setUint32(i+24,M.LIMITS.expandedBytes+1,true);break;}
  assert.throws(()=>e.load({format:'excel',bytes}),/expanded-size/);
});
test('empty results and excluded fields cannot produce stale or misleading exports', () => {
  const c=converter('id,name');assert.equal(c.out('json').text,'[]');assert.equal(c.out('jsonl').text,'');
  assert.throws(()=>c.e.export({columns:[],format:'csv'}),/at least one/);
  assert.throws(()=>c.e.export({columns:[0,0],format:'csv'}),/once/);
  assert.throws(()=>c.e.load({text:'bad\n"unterminated',format:'csv'}),/unclosed/);assert.throws(()=>c.e.export({columns:[0],format:'csv'}),/valid source/);
});
test('resource limits, invalid UTF-8, field counts and unknown formats are enforced', () => {
  assert.throws(()=>converter('a'.repeat(M.LIMITS.bytes+1)),/5 MiB/);
  assert.throws(()=>converter(Array.from({length:102},(_,i)=>'h'+i).join(',')),/100 columns/);
  assert.throws(()=>converter('id\n'+Array(20001).fill('x').join('\n')),/20,001/);
  assert.throws(()=>M.engine(X).load({bytes:new Uint8Array([0xff]).buffer,format:'csv'}),/UTF-8/);
  assert.throws(()=>converter('id\nx').out('unknown'),/supported output/);
  assert.throws(()=>converter('[]','json'),/no records/);
  assert.throws(()=>converter('x'.repeat(201)+'\nvalue'),/200 characters/);
  assert.throws(()=>converter('[{"'+ 'x'.repeat(201)+'":1}]','json'),/200 characters/);
});
test('bundled Excel library matches the pinned official source and licence fingerprint', () => {
  const hash=path=>crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
  assert.equal(X.version,'0.20.3');assert.equal(hash('data-file-converter/vendor/xlsx.full.min.js'),'cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41');
  assert.equal(hash('data-file-converter/vendor/LICENSE.txt'),'4d2a38ac35cda06a555c84074a819d413339cd3691b822cae50f8f322fe01f64');
});
