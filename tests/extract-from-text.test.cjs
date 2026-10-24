const {test}=require('node:test'),assert=require('node:assert/strict'),M=require('../extract-from-text/model.js');
const options={mode:'email',unique:true,ignoreCase:true};
test('email extraction deduplicates exact values with counts and CRLF/CR/LF locations',()=>{
 const r=M.extract('a@example.test\r\nX a@example.test\rA@example.test\nlast',options);assert.deepEqual(r.table.rows,[['a@example.test','2','1','1'],['A@example.test','1','3','1']]);assert.equal(r.summary.matches,3);
 assert.deepEqual(M.extract('x a@example.test\na@example.test',{...options,unique:false}).table.rows,[['a@example.test','1','3'],['a@example.test','2','1']]);
});
test('URL extraction keeps query strings, strips sentence punctuation and leaves balanced parentheses',()=>{
 const r=M.extract('See https://example.test/path?q=demo. (https://example.test/a) https://example.test/a(b) ftp://example.test',{...options,mode:'url'});
 assert.deepEqual(r.table.rows.map(r=>r[0]),['https://example.test/path?q=demo','https://example.test/a','https://example.test/a(b)']);
});
test('label extraction treats punctuation literally, matches whole labels and trims values',()=>{
 const r=M.extract('Order.id: 001\rOrderXid: no\n order.id : 002  \nOrder.id: ',{...options,mode:'label',label:'Order.id',separator:':'});assert.deepEqual(r.table.rows.map(r=>r[0]),['001','002']);
 assert.throws(()=>M.extract('x',{...options,mode:'label',label:'',separator:':'}),/label/);
});
test('advanced capture groups retain zeroes, skip empty matches and handle Unicode positions',()=>{
 const r=M.extract('😀 DEMO-001\nDEMO-002',{...options,mode:'pattern',pattern:'DEMO-([0-9]+)',group:1});assert.deepEqual(r.table.rows,[['001','1','1','4'],['002','1','2','1']]);
 assert.equal(M.extract('😀',{...options,mode:'pattern',pattern:'(?:)',group:0}).summary.matches,0);
 assert.throws(()=>M.extract('a',{...options,mode:'pattern',pattern:'[',group:0}),/invalid/);
 assert.throws(()=>M.extract('a',{...options,mode:'pattern',pattern:'a',group:1}),/does not exist/);
 assert.throws(()=>M.extract('a',{...options,mode:'pattern',pattern:'a',group:-1}),/whole number/);
});
test('input and match limits reject oversized work and all output formats preserve extracted text',()=>{
 assert.throws(()=>M.extract('é'.repeat(600000),options),/1 MiB/);
 assert.throws(()=>M.extract('a '.repeat(20001),{...options,mode:'pattern',pattern:'a',group:0}),/20,000/);
 const result=M.extract('x@example.test\nx@example.test',options);for(const format of ['csv','tsv','json','md','txt','items']){const out=M.output(result,{format,protect:true});assert.ok(out.text.includes('x@example.test'));assert.equal(out.count,1);}assert.equal(M.output(result,{format:'items'}).text,'x@example.test');
 assert.equal(M.output(M.extract('',options),{format:'items'}).text,'');
});
test('URL cleanup strips mixed trailing sentence punctuation and unmatched brackets without losing balanced path brackets',()=>{
 const result=M.extract('See (https://example.test/help.)] and https://example.test/a(b)].',{...options,mode:'url'});
 assert.deepEqual(result.table.rows.map(row=>row[0]),['https://example.test/help','https://example.test/a(b)']);
});
