const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../summarise-reshape/model.js'),C=require('../data-file-converter/model.js'),X=require('../data-file-converter/vendor/xlsx.full.min.js');
const table={headers:['Team','Month','Sales'],rows:[['North','Jan','0.1'],['North','Feb','0.2'],['South','Jan','9007199254740993.01'],['South','Feb','']]};
const summary={task:'summary',groups:[0],aggregate:'sum',value:2,resultName:'Total',totals:true};
const run=o=>M.transform(table,o).table;
test('grouped totals preserve decimals and large integers without changing the source',()=>{
 const before=JSON.stringify(table);assert.deepEqual(run(summary).rows,[['North','0.3'],['South','9007199254740993.01'],['Grand total','9007199254740993.31']]);assert.equal(JSON.stringify(table),before);
 assert.deepEqual(run({...summary,aggregate:'count'}).rows,[['North','2'],['South','2'],['Grand total','4']]);
 assert.deepEqual(run({...summary,groups:[],aggregate:'average'}).rows,[['3002399751580331.1033333333']]);
 for(const [aggregate,expected]of [['min','0.1'],['max','0.2'],['average','0.15'],['first','0.1']])assert.equal(run({...summary,aggregate}).rows[0][1],expected);
});
test('numeric failures identify source rows; blanks stay blank and negative averages round away from zero',()=>{
 assert.throws(()=>M.transform({headers:['x'],rows:[['£12']]},{...summary,groups:[],value:0}),/Data row 1, x/);
 assert.equal(M.transform({headers:['x'],rows:[['-0.0000000001'],['0']]},{...summary,groups:[],value:0,aggregate:'average'}).table.rows[0][0],'-0.0000000001');
 assert.equal(M.transform({headers:['x'],rows:[['']]},{...summary,groups:[],value:0}).table.rows[0][0],'');
});
test('unpivot retains identifying fields and supports blank omission and all columns',()=>{
 assert.deepEqual(run({task:'unpivot',columns:[1,2],nameColumn:'Field',valueColumn:'Value',skipBlank:true}).rows.slice(-1),[['South','Month','Feb']]);
 assert.equal(run({task:'unpivot',columns:[0,1,2],nameColumn:'Field',valueColumn:'Value'}).rows.length,12);
 assert.throws(()=>run({task:'unpivot',columns:[1],nameColumn:'Sales',valueColumn:'Value'}),/unique/);
});
test('pivot preserves text and order, rejects duplicate combinations by default and combines explicitly',()=>{
 const pivot={task:'pivot',groups:[0],pivot:1,value:2,aggregate:'block'};assert.deepEqual(run(pivot),{headers:['Team','Jan','Feb'],rows:[['North','0.1','0.2'],['South','9007199254740993.01','']]});
 const duplicate={headers:table.headers,rows:[...table.rows,['North','Jan','0.3']]};assert.throws(()=>M.transform(duplicate,pivot),/same identifying/);assert.equal(M.transform(duplicate,{...pivot,aggregate:'sum'}).table.rows[0][1],'0.4');
 assert.deepEqual(M.transform({headers:table.headers,rows:[['A','Jan','x'],['B','Feb','y']]},{...pivot,aggregate:'count'}).table.rows,[['A','1','0'],['B','0','1']]);
 assert.throws(()=>M.transform({headers:table.headers,rows:[['A','Team','x']]},pivot),/unique/);
 assert.throws(()=>run({...pivot,pivot:0}),/different/);
});
test('multi-value expansion uses a literal separator, preserves empty items and repeats other fields',()=>{
 const source={headers:['ID','Tags'],rows:[['001','a.* b.*'],['002','']]},options={task:'expand',value:1,delimiter:'.*',trim:true};
 assert.deepEqual(M.transform(source,options).table.rows,[['001','a'],['001','b'],['001',''],['002','']]);assert.equal(M.transform(source,{...options,skipBlank:true}).table.rows.length,2);assert.throws(()=>M.transform(source,{...options,delimiter:''}),/separator/);
});
test('expansion and pivot bounds prevent oversized output',()=>{
 assert.throws(()=>M.transform({headers:['x'],rows:[[';'.repeat(20000)]]},{task:'expand',value:0,delimiter:';'}),/20,000/);
 assert.throws(()=>M.transform({headers:['key','value'],rows:Array.from({length:101},(_,i)=>[String(i),'x'])},{task:'pivot',groups:[],pivot:0,value:1,aggregate:'block'}),/100 columns/);
});
test('session exports full data, protects formulas, clears failed runs and imports JSON/Excel',()=>{
 const s=M.session(X);s.load({text:'[{"id":"001","tags":"=A;B"}]',format:'json'});s.select({path:'[]',hasHeader:true});s.run({task:'expand',value:1,delimiter:';'});
 assert.match(s.export({format:'csv',protect:true}).text,/'=A/);assert.deepEqual(JSON.parse(s.export({format:'json'}).text),[{id:'001',tags:'=A'},{id:'001',tags:'B'}]);assert.throws(()=>s.run({task:'expand',value:1,delimiter:''}));assert.throws(()=>s.export({format:'csv'}),/Preview/);
 const book=X.utils.book_new();X.utils.book_append_sheet(book,X.utils.aoa_to_sheet([['Team','Sales'],['A',0.1],['A',0.2]]),'Data');const bytes=X.write(book,{type:'array',bookType:'xlsx'});s.load({bytes,name:'sample.xlsx',format:'excel'});s.select({sheet:'Data',hasHeader:true,excelValues:'raw'});s.run({...summary,value:1});assert.match(s.export({format:'csv'}).text,/A,0.3/);
});
