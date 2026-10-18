const {test} = require('node:test');
const assert = require('node:assert/strict');
const CSV = require('../csv-search-filter-transform/model.js');
const C = require('../data-file-converter/model.js');
const Merge = require('../csv-merge-join/model.js');
const Cleaner = require('../data-cleaner/model.js');
const Quality = require('../data-quality-checker/model.js');
const Comparison = require('../compare-tables/model.js');

test('table formats preserve special values, escape Markdown and use matching extensions', () => {
  const values = ['001', '=SUM(A1)', 'a|b <script> & *x* \\', 'a\tb\n"c"', ''];
  const headers = values.map((_, i) => 'field' + i);
  for (const format of ['csv','json','txt','md']) {
    const a = CSV.serialize(headers, [{data:values}], {format,protect:true});
    const b = C.output({headers,rows:[values]}, {columns:headers.map((_,i)=>i),format,protect:true});
    for (const output of [a,b]) {
      assert.equal(output.extension, format);
      if (format === 'json') assert.deepEqual(JSON.parse(output.text), [Object.fromEntries(headers.map((h,i)=>[h,values[i]]))]);
      if (format === 'txt') {
        assert.deepEqual(C.delimited(output.text,'\t')[1],values);
        assert.match(output.mime,/text\/plain/);
      }
      if (format === 'md') {
        assert.match(output.text,/a\\\|b/);
        assert.match(output.text,/&lt;script&gt;/);
        assert.match(output.text,/<br>/);
        assert.doesNotMatch(output.text,/<script>/);
        assert.match(output.mime,/text\/markdown/);
      }
      if (format === 'csv') assert.equal(C.delimited(output.text,',')[1][1], "'=SUM(A1)");
    }
  }
});

test('merge, cleanup, quality and comparison support all four text formats without truncation', () => {
  for (const format of ['csv','json','txt','md']) {
    const table = {headers:['id','name'],rows:[{data:['001','a|b']}]};
    assert.equal(Merge.serialize(table,true,format).extension,format);
    const cleaner = Cleaner.session();
    cleaner.load({format:'csv',text:'id,name\n001, ALICE '});
    cleaner.select({hasHeader:true});
    cleaner.run({family:'text',columns:[1],output:'replace',errors:'keep',text:{trim:true,case:'none',prefix:'',suffix:''}});
    assert.equal(cleaner.export({view:'data',format}).extension,format);
    assert.equal(cleaner.export({view:'issues',format}).extension,format);
    const source = {headers:['id'],rows:[['001'],['001']],structure:[]};
    const report = Quality.check(source,{duplicateRows:true,rules:[],keys:[]});
    for (const view of ['issues','rows','profile']) assert.equal(Quality.serialize(source,report,view,true,format).extension,format);
    const comparison = Comparison.compare(Comparison.parse('id,name\n001,A'),Comparison.parse('id,name\n001,B'),[{left:0,right:0,key:true},{left:1,right:1}]);
    assert.match(Comparison.report(comparison,format),/changed/);
  }
});

test('plain text converter preserves exact JSON number tokens', () => {
  const engine = C.engine();
  engine.load({format:'json',text:'[{"id":9007199254740993}]'});
  engine.select({path:'[]'});
  assert.match(engine.export({columns:[0],format:'txt'}).text,/9007199254740993/);
});
