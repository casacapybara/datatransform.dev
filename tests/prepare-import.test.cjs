const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../prepare-import/model.js'),C=require('../data-file-converter/model.js'),X=require('../data-file-converter/vendor/xlsx.full.min.js');
const field=(name,source,extra={})=>({name,source,default:'',required:false,conversion:'keep',...extra});
const exportData=r=>M.exportResult(r,{view:'data',format:'csv',protect:false});
test('template preserves exact names/order, ignores sample rows and rejects invalid headers',()=>{
 assert.deepEqual(M.template('\uFEFF" Email ",ID\nsample,001,ignored').headers,[' Email ','ID']);
 assert.deepEqual(M.template('ID\tEmail','tsv').headers,['ID','Email']);
 for(const text of ['',',ID','ID,ID', 'x'.repeat(201),'"unclosed'])assert.throws(()=>M.template(text));
 const fields=M.autoMap(['ID','email','EMAIL'],[' Email ','id','status']);assert.deepEqual(fields.map(f=>f.source),[null,0,null]);
});
test('mapping preserves IDs, reuses columns, omits extras and converts defaults before validation',()=>{
 const table={headers:['ref','mail','date','amount','extra'],rows:[['001',' ALICE@EXAMPLE.TEST ','18/10/2026','9,007,199,254,740,993.005','omit'],['002','  ','','(1,234.50)','omit']]};
 const fields=[field('email',1,{conversion:'lower',default:' NONE@EXAMPLE.TEST ',required:true}),field('customer_id',0),field('joined_on',2,{conversion:'date-dmy',default:'01/01/2026'}),field('amount',3,{conversion:'number-dot'}),field('status',null,{default:'active',required:true}),field('same_id',0),field('optional',null)];
 const r=M.prepare(table,{fields});assert.equal(r.errors.length,0);assert.deepEqual(r.table.headers,fields.map(f=>f.name));
 assert.deepEqual(r.table.rows[0],['alice@example.test','001','2026-10-18','9007199254740993.005','active','001','']);
 assert.deepEqual(r.table.rows[1],['none@example.test','002','2026-01-01','-1234.50','active','002','']);assert.equal(r.summary.defaults,4);
 assert.deepEqual(table.rows[0],['001',' ALICE@EXAMPLE.TEST ','18/10/2026','9,007,199,254,740,993.005','omit']);
 assert.deepEqual(C.delimited(exportData(r).text,',').slice(1),r.table.rows);
});
test('required and conversion issues retain values and block data but permit report export',()=>{
 const r=M.prepare({headers:['date','count'],rows:[['29/02/2026','12,34'],['','3']]},{fields:[field('date',0,{conversion:'date-dmy',required:true}),field('count',1,{conversion:'number-dot'}),field('missing',null,{required:true})]});
 assert.equal(r.errors.length,5);assert.equal(r.summary.affected,2);assert.equal(r.table.rows[0][0],'29/02/2026');assert.ok(exportData(r).blocked);
 const out=M.exportResult(r,{view:'issues',format:'tsv',protect:false});assert.equal(out.count,5);assert.equal(C.delimited(out.text,'\t').length,6);
});
test('European numbers and explicit dates validate without guessing or rounding',()=>{
 const r=M.prepare({headers:['a','b'],rows:[['1.234,005','10/18/2026']]},{fields:[field('amount',0,{conversion:'number-comma'}),field('date',1,{conversion:'date-mdy'})]});assert.deepEqual(r.table.rows,[['1234.005','2026-10-18']]);
});
test('exact output and opt-in formula protection cover values and headers in both formats',()=>{
 const r=M.prepare({headers:['value'],rows:[['-12'],['=1+1']]},{fields:[field('@field',0)]});
 for(const format of ['csv','tsv']){const exact=M.exportResult(r,{view:'data',format,protect:false}),safe=M.exportResult(r,{view:'data',format,protect:true});assert.equal(exact.headers[0],'@field');assert.equal(safe.headers[0],"'@field");assert.deepEqual(safe.preview,[["'-12"],["'=1+1"]]);}
});
test('bad mappings, defaults, conversions and excessive output are rejected',()=>{
 const table={headers:['id'],rows:[['1']]};
 for(const f of [field('id',3),field('id',-1),field('id',undefined),field('id',0,{default:'a'.repeat(1001)}),field('id',0,{conversion:'guess'}),field('',0)])assert.throws(()=>M.prepare(table,{fields:[f]}));
 assert.throws(()=>M.prepare({headers:['a'],rows:Array.from({length:5000},()=>['x'])},{fields:Array.from({length:100},(_,i)=>field('field'+i,0))}),/500,000/);
});
test('session uses shared source readers and clears results on failed runs or new input',()=>{
 const s=M.session(X);s.load({text:'[{"ID":"001","n":9007199254740993}]',format:'json'});s.select({path:'[]'});s.run({fields:[field('ID',0),field('value',1)]});assert.match(s.export({view:'data',format:'csv'}).text,/9007199254740993/);assert.throws(()=>s.run({fields:[]}));assert.throws(()=>s.export({view:'data',format:'csv'}),/Preview/);
 s.load({text:'id\n001',format:'csv'});s.select({hasHeader:true});s.run({fields:[field('id',0)]});s.load({text:'id\n002',format:'csv'});assert.throws(()=>s.export({view:'data',format:'csv'}));
});
