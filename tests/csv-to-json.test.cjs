const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const M = require('../csv-to-json/model.js');
const convert = (text, options = {}) => M.convert({text, ...options});

test('CSV to JSON retains textual IDs, BOM, Unicode, doubled quotes and embedded line breaks', () => {
  const result = convert('\uFEFFid,note\r\n001,"Chloé,\r\n""hello"""\r\n002,=1+1', {trimValues: false});
  assert.deepEqual(JSON.parse(result.text), [{id:'001',note:'Chloé,\r\n"hello"'},{id:'002',note:'=1+1'}]);
  assert.equal(result.count, 2); assert.equal(result.columns, 2);
  assert.equal(result.extension, 'json'); assert.match(result.mime, /application\/json/);
});
test('malformed quoting and uneven records block conversion without truncating cells', () => {
  for (const text of ['id\nAl"ice"','id\n"Alice"tail','id\n"Alice','id,name\n001','id,name\n001,Alice,extra']) assert.throws(() => convert(text));
});
test('empty quoted, comma-only and whitespace records survive while physical blank lines are skipped', () => {
  assert.deepEqual(JSON.parse(convert('id\n\n""\r\n \n002', {trimValues:false}).text), [{id:''},{id:' '},{id:'002'}]);
  assert.deepEqual(JSON.parse(convert('id,name\n,\n002,Bob').text), [{id:'',name:''},{id:'002',name:'Bob'}]);
  assert.equal(convert('id\n""').count, 1);
  const empty = convert('id,name'); assert.equal(empty.count, 0); assert.equal(empty.columns, 2); assert.equal(empty.text, '[]');
});
test('header cleanup avoids collisions and preserves special and numeric-looking names', () => {
  const result = convert('__proto__,constructor,a,a,Column 5,,2,1\np,c,first,second,named,blank,two,one');
  const row = JSON.parse(result.text)[0];
  assert.equal(Object.hasOwn(row, '__proto__'), true); assert.equal(row.__proto__, 'p'); assert.equal(row.constructor, 'c');
  assert.equal(Object.keys(row).length, 8); assert.equal(row.a, 'first'); assert.equal(row['a (2)'], 'second');
  assert.equal(row['Column 5'], 'named'); assert.equal(row['Column 6'], 'blank');
  assert.ok(result.warnings.length); assert.ok(result.text.indexOf('"2"') < result.text.indexOf('"1"'));
});
test('splitting, trimming and empty-item settings are explicit and do not change source text', () => {
  const text = 'id,Fields\n 001 ," name, ,date,"';
  assert.deepEqual(JSON.parse(convert(text).text), [{id:'001',Fields:'name, ,date,'}]);
  assert.deepEqual(JSON.parse(convert(text,{split:true,splitColumn:'fields'}).text), [{id:'001',Fields:['name','date']}]);
  assert.deepEqual(JSON.parse(convert(text,{split:true,splitColumn:'FIELDS',trimValues:false,omitEmpty:false}).text), [{id:' 001 ',Fields:[' name',' ','date','']}]);
  assert.throws(() => convert(text,{split:true,splitColumn:''}), /Enter the name/);
  assert.throws(() => convert(text,{split:true,splitColumn:'missing'}), /No column/);
  assert.throws(() => convert('fields,Fields\na,b',{split:true,splitColumn:'fields'}), /Several columns/);
});
test('JavaScript exports run in strict mode and retain own __proto__ properties', () => {
  for (const variable of ['class','const','null','await','eval','arguments','123 name','data']) {
    const result = convert('__proto__,id,fields\nretained,001,"a,b"', {format:'js',variable,split:true,splitColumn:'fields'});
    const name = require('../csv-search-filter-transform/model.js').variableName(variable);
    const row = vm.runInNewContext('"use strict"; '+result.text+`; ${name}[0]`);
    assert.equal(Object.hasOwn(row, '__proto__'), true); assert.equal(row.__proto__, 'retained'); assert.equal(row.id, '001');
    assert.equal(JSON.stringify(row.fields), '["a","b"]');
    assert.equal(result.extension,'js'); assert.match(result.mime,/text\/javascript/);
    assert.equal(result.warnings.length, variable === 'data' ? 0 : 1);
  }
});
test('indentation and empty JavaScript output remain valid', () => {
  for (const indent of [0,2,4]) {
    const result = convert('id\n001',{indent}); assert.deepEqual(JSON.parse(result.text), [{id:'001'}]);
    assert.equal(result.text.includes('\n'), indent !== 0);
  }
  assert.equal(convert('id',{format:'js'}).text,'const data = [];');
  assert.throws(() => convert('id',{format:'csv'}), /JSON or JavaScript/);
  assert.throws(() => convert('id',{indent:100}), /indentation/);
  assert.throws(() => convert('id',{variable:'a'.repeat(201)}), /200 characters/);
});
test('shared limits bound UTF-8 bytes, rows, columns, cells and expanded JSON', () => {
  assert.throws(() => convert('id\n'+'高'.repeat(1800000)), /5 MiB/);
  assert.throws(() => convert('id\n'+'x\n'.repeat(20001)), /20,000/);
  assert.throws(() => convert(Array(101).fill('id').join(',')), /100 columns/);
  assert.throws(() => convert(Array(100).fill('id').join(',')+'\n'+(Array(100).fill('x').join(',')+'\n').repeat(5000)), /500,000 cells/);
  assert.throws(() => convert('h'.repeat(1000)+'\n'+'x\n'.repeat(20000)), /20 million/);
});
test('both entry points share CSP-compatible assets and the original is excluded from deployment', () => {
  const html = fs.readFileSync('csv-to-json/index.html','utf8');
  assert.equal(fs.readFileSync('CSV to JSON converter/csv_to_json_converter.html','utf8'), html);
  assert.doesNotMatch(html, /<style\b|\sstyle=|\son\w+=|<script(?![^>]*\bsrc=)/i);
  assert.match(html, /href="https:\/\/datatransform.dev\/csv-to-json\/"/);
  assert.match(html, /id="output" tabindex="0"/);
  for (const page of ['index.html','data-file-converter/index.html','csv-search-filter-transform/index.html']) assert.match(fs.readFileSync(page,'utf8'), /href="\.?\.\/csv-to-json\/"/);
});
