const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../mask-sensitive-data/model.js'),X=require('../data-file-converter/vendor/xlsx.full.min.js');
test('masking removes full columns and preserves exact repeated relationships, blanks, order and all rows',()=>{
 const source={headers:['id','name','email','team'],rows:[['001','Asha','secret@example.test','Sales'],['002','Asha','','Support'],['003','asha','','Sales'],['004','','','Support']]};
 const r=M.transform(source,['mask','mask','remove','keep']);assert.deepEqual(r.table.headers,['id','name','team']);assert.equal(r.table.rows.length,4);assert.equal(r.table.rows[0][1],r.table.rows[1][1]);assert.notEqual(r.table.rows[0][1],r.table.rows[2][1]);assert.notEqual(r.table.rows[0][0],r.table.rows[0][1]);assert.equal(r.table.rows[3][1],'');assert.equal(source.rows[0][1],'Asha');assert.deepEqual(r.summary.removed,['email']);
});
test('masking rejects unreviewable choices and supports header-only tables',()=>{
 const table={headers:['name'],rows:[]};assert.throws(()=>M.transform(table,['remove']),/at least/);assert.throws(()=>M.transform(table,['invalid']),/Choose/);assert.throws(()=>M.transform(table,[]),/every column/);assert.deepEqual(M.transform(table,['mask']).table,table);
});
test('exports contain only chosen masked data in every format and never export mappings',()=>{
 const s=M.session(X);s.load({format:'csv',text:'name,secret,formula\nAlice,private,=1+1\nAlice,private,=1+1'});s.select({hasHeader:true});s.run({actions:['mask','remove','keep']});
 for(const format of ['csv','tsv','json','txt','md']){const out=s.export({format,protect:true});assert.ok(!out.text.includes('private'));assert.ok(!out.text.includes('Alice'));assert.ok(!out.text.includes('secret'));assert.ok(out.text.includes('Value 1-000001'));}
 assert.match(s.export({format:'csv',protect:true}).text,/'=1\+1/);s.load({format:'csv',text:'bad'});assert.throws(()=>s.export({format:'csv'}),/Preview/);
});
