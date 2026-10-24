const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const M=require('../data-file-converter/model.js');
const adapter=()=>import('../shared/parquet.mjs');
function arrayBuffer(bytes){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}
test('Parquet reads independent DuckDB GZIP fixture without rounding decimal, unsigned integer or timestamp',async()=>{
 const P=await adapter(),state=await P.inspect(P.bufferFile(arrayBuffer(fs.readFileSync('tests/fixtures/parquet-types.parquet')))),table=await P.read(state,M);
 assert.equal(table.rows[0][0].token,'18446744073709551615');assert.equal(table.rows[0][1].token,'12345678901234567890.123456789012345678');assert.equal(table.rows[0][2],'2026-10-24');assert.equal(table.rows[0][3],'2026-10-24T10:11:12.123456');assert.equal(table.rows[0][4],true);assert.equal(table.rows[0][5],null);
 const exported=P.write(table,{columns:[0,1,2,3,4,5]},M);const roundtrip=await P.read(await P.inspect(P.bufferFile(exported.bytes)),M);assert.deepEqual(roundtrip.rows.map(r=>r.map(M.cellText)),table.rows.map(r=>r.map(M.cellText)));
});
test('Parquet export retains text IDs, blanks, booleans, null and exact decimal digits',async()=>{
 const P=await adapter(),table=M.jsonTable(M.jsonParse('[{"id":"001","n":9007199254740993,"amount":0.1234567890123456789,"active":true,"empty":""},{"id":"002","n":null,"amount":-123.5,"active":false}]').value);
 const result=P.write(table,{columns:[0,1,2,3,4]},M);const loaded=await P.read(await P.inspect(P.bufferFile(result.bytes)),M);assert.equal(loaded.rows[0][0],'001');assert.equal(loaded.rows[0][1].token,'9007199254740993');assert.equal(loaded.rows[0][2].token,'0.1234567890123456789');assert.equal(loaded.rows[0][4],'');assert.equal(loaded.rows[1][4],null);
});
test('Parquet type conversion rejects invalid booleans, integers, dates, decimals and timestamps',async()=>{
 const P=await adapter();function write(value,type){return P.write({headers:['value'],rows:[[value]]},{columns:[0],types:[type]},M);}
 for(const [value,type]of [['yes','boolean'],['1.5','integer'],['18446744073709551616','integer'],['2026-02-30','date'],['x','decimal'],['2026-02-30T00:00:00Z','timestamp']])assert.throws(()=>write(value,type));
 assert.throws(()=>write(new M.JsonNumber('1e400'),'decimal'),/precision|exponent/);assert.throws(()=>write(new M.JsonNumber('1e-400'),'decimal'),/scale/);
});
test('Parquet supports empty typed tables, negative timestamps and null-only decimal schemas',async()=>{
 const P=await adapter();for(const table of [{headers:['id'],rows:[]},{headers:['stamp'],rows:[['1969-12-31T23:59:59.999999Z']],types:['timestamp']},{headers:['amount'],rows:[[null]],types:['decimal'],schema:[{scale:5,precision:15}]}]){
 const r=P.write(table,{columns:[0]},M),state=await P.inspect(P.bufferFile(r.bytes)),loaded=await P.read(state,M);assert.equal(loaded.rows.length,table.rows.length);if(table.types?.[0]==='timestamp')assert.equal(loaded.rows[0][0],'1969-12-31T23:59:59.999999000Z');if(table.types?.[0]==='decimal'){assert.equal(loaded.schema[0].scale,5);assert.equal(loaded.schema[0].precision,15);}}
});
test('Parquet desktop limits are enforced before decoding oversized tables or expanded pages',async()=>{
 const P=await adapter();assert.ok(P.limits.bytes>5*1024*1024);assert.ok(P.limits.rows>20000);await assert.rejects(P.inspect({byteLength:P.limits.bytes+1}),/256 MiB/);
 const state=await P.inspect(P.bufferFile(arrayBuffer(fs.readFileSync('tests/fixtures/parquet-types.parquet'))));state.count=P.limits.rows+1;await assert.rejects(P.read(state,M),/250,000/);state.count=1;state.metadata.row_groups[0].columns[0].meta_data.total_uncompressed_size=BigInt(P.limits.expandedBytes+1);await assert.rejects(P.read(state,M),/128 MiB/);
});

test('independent Zstandard and LZ4 fixtures decode exact types',async()=>{
 const P=await adapter();for(const codec of ['zstd','lz4_raw']){const bytes=arrayBuffer(fs.readFileSync('tests/fixtures/parquet-types-'+codec+'.parquet'));const table=await P.read(await P.inspect(P.bufferFile(bytes)),M);assert.equal(table.rows[0][1].token,'12345678901234567890.123456789012345678');}
});
