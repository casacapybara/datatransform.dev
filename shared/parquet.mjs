import { parquetMetadataAsync, parquetRead } from 'hyparquet';
import { snappyUncompress } from 'hyparquet/src/snappy.js';
import { parquetWriteBuffer } from 'hyparquet-writer';
import { gunzip } from 'hyparquet-compressors/src/gzip.js';
import { decompressBrotli } from 'hyparquet-compressors/src/brotli.js';
import { decompressLz4, decompressLz4Raw } from 'hyparquet-compressors/src/lz4.js';
import { decompress as decompressZstd } from 'fzstd';
const decompressGzip=(input,length)=>gunzip(input,new Uint8Array(length));

export const limits = Object.freeze({bytes:256*1024*1024, rows:250000, columns:100, cells:2000000, expandedBytes:128*1024*1024, characters:64000000});
const codecs = {SNAPPY:(input,length)=>{const out=new Uint8Array(length);snappyUncompress(input,out);return out;},GZIP:decompressGzip, BROTLI:decompressBrotli, ZSTD:(input,length)=>decompressZstd(input,new Uint8Array(length)), LZ4:decompressLz4, LZ4_RAW:decompressLz4Raw};
const compressors = Object.fromEntries(Object.entries(codecs).map(([key,fn]) => [key,(input,length) => {
  if (length < 0 || length > limits.expandedBytes) throw Error('A Parquet page exceeds 128 MiB.');
  return fn(input,length);
}]));
export function bufferFile(bytes) { return {byteLength:bytes.byteLength,slice:(a,b)=>bytes.slice(a,b)}; }
export async function inspect(file) {
  if (!file || file.byteLength > limits.bytes) throw Error('Parquet files allow up to 256 MiB.');
  const metadata = await parquetMetadataAsync(file,{geoparquet:false});
  const schema = metadata.schema.slice(1);
  if (!schema.length || schema.length > limits.columns || metadata.schema[0].num_children !== schema.length || schema.some(s=>s.num_children || s.repetition_type === 'REPEATED')) throw Error('Choose a flat Parquet table with at most 100 columns. Nested and repeated columns are not supported.');
  if (new Set(schema.map(s=>s.name)).size !== schema.length) throw Error('Parquet column names must be unique.');
  for (const s of schema) {
    const logical=s.logical_type?.type, converted=s.converted_type;
    if(logical==='DECIMAL'||converted==='DECIMAL'){const precision=s.precision??s.logical_type?.precision,scale=s.scale??s.logical_type?.scale??0;if(!Number.isInteger(precision)||precision<1||precision>38||!Number.isInteger(scale)||scale<0||scale>precision)throw Error(`Column “${s.name}” needs a decimal precision between 1 and 38 and a valid scale.`);}
    if (['INT96','FIXED_LEN_BYTE_ARRAY','BYTE_ARRAY'].includes(s.type) && !(logical==='DECIMAL' || converted==='DECIMAL' || logical==='STRING' || converted==='UTF8')) throw Error(`Column “${s.name}” uses an unsupported binary or legacy type.`);
    if (logical && !['STRING','INTEGER','DECIMAL','DATE','TIMESTAMP'].includes(logical) || converted && !['UTF8','DECIMAL','DATE','TIMESTAMP_MILLIS','TIMESTAMP_MICROS','INT_8','INT_16','INT_32','INT_64','UINT_8','UINT_16','UINT_32','UINT_64'].includes(converted)) throw Error(`Column “${s.name}” uses unsupported type ${logical || converted}.`);
  }
  return {file,metadata,schema:structuredClone(schema),count:Number(metadata.num_rows)};
}
function decimal(v,scale) {
  let n;
  if (v instanceof Uint8Array) { n=0n; for(const b of v)n=n*256n+BigInt(b); if(v[0]&128)n-=1n<<BigInt(v.length*8); }
  else n=BigInt(v);
  const sign=n<0n?'-':''; const digits=(n<0n?-n:n).toString().padStart(scale+1,'0');
  return sign+(scale?digits.slice(0,-scale)+'.'+digits.slice(-scale):digits);
}
export async function read(state,M) {
  const {file,count,schema}=state;
  if(count>limits.rows || (count+1)*schema.length>limits.cells) throw Error('Parquet conversion allows 250,000 rows and 2,000,000 cells. Split this file before converting.');
  let expanded=0n;
  for(const group of state.metadata.row_groups) for(const c of group.columns){if(!c.meta_data || c.file_path)throw Error('External or encrypted Parquet columns are not supported.');if(c.meta_data.total_uncompressed_size<0n)throw Error('Parquet page sizes must not be negative.');expanded+=c.meta_data.total_uncompressed_size;}
  if(expanded>BigInt(limits.expandedBytes))throw Error('Parquet decoded pages exceed 128 MiB. Split this file before converting.');
  const metadata=structuredClone(state.metadata);
  // Decode physical decimal and temporal values first, avoiding the reader's floating-point conversion.
  metadata.schema.slice(1).forEach(s=>{if(['DECIMAL','DATE','TIMESTAMP'].includes(s.logical_type?.type)||['DECIMAL','DATE','TIMESTAMP_MILLIS','TIMESTAMP_MICROS'].includes(s.converted_type)){delete s.logical_type;delete s.converted_type;}});
  const rows=await new Promise((resolve,reject)=>parquetRead({file,metadata,compressors,utf8:false,onComplete:resolve,onPage:page=>{if(page.data?.length>limits.cells)throw Error('Parquet page exceeds the cell limit.');}}).catch(reject));
  const types=schema.map(s=>s.converted_type==='DECIMAL'||s.logical_type?.type==='DECIMAL'?'decimal':s.converted_type==='DATE'||s.logical_type?.type==='DATE'?'date':s.logical_type?.type==='TIMESTAMP'||s.converted_type?.startsWith('TIMESTAMP')?'timestamp':s.type==='BOOLEAN'?'boolean':s.type.startsWith('INT')?'integer':['FLOAT','DOUBLE'].includes(s.type)?'number':'text');
  for(const row of rows)for(let i=0;i<row.length;i++){
    const v=row[i],s=schema[i];if(v==null){row[i]=null;continue;}
    if(types[i]==='decimal')row[i]=new M.JsonNumber(decimal(v,s.scale ?? s.logical_type?.scale ?? 0));
    else if(types[i]==='integer')row[i]=new M.JsonNumber(String(v));
    else if(types[i]==='date')row[i]=new Date(Number(v)*86400000).toISOString().slice(0,10);
    else if(types[i]==='timestamp'){
      const unit=s.logical_type?.unit || (s.converted_type==='TIMESTAMP_MICROS'?'MICROS':'MILLIS'); const div=unit==='NANOS'?1000000000n:unit==='MICROS'?1000000n:1000n; const n=BigInt(v);const seconds=n/div-(n%div<0n?1n:0n), rem=n-seconds*div;
      row[i]=new Date(Number(seconds*1000n)).toISOString().replace('.000Z','.'+rem.toString().padStart(div.toString().length-1,'0')+(s.logical_type?.isAdjustedToUTC===false?'':'Z'));
    } else if(types[i]==='number'){if(!Number.isFinite(v))throw Error(`Column “${s.name}” contains a non-finite number. JSON cannot represent it.`);row[i]=new M.JsonNumber(Object.is(v,-0)?'-0':String(v));}
  }
  return {...M.validateTable(schema.map(s=>s.name),rows,limits),types,schema,warnings:['Parquet types are preserved for Parquet export. Dates and timestamps use ISO text in other formats. Missing values become Parquet nulls.']};
}
function infer(values,M){const data=values.filter(v=>v!=null);if(!data.length)return 'text';if(data.every(v=>typeof v==='boolean'))return 'boolean';if(data.every(v=>v instanceof M.JsonNumber && /^-?\d+$/.test(v.token)))return 'integer';if(data.every(v=>v instanceof M.JsonNumber))return 'decimal';return 'text';}
function scaled(token,scale){const m=token.match(/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);if(!m)throw Error('Enter a decimal number.');const shift=scale+Number(m[4]||0)-(m[3]||'').length;if(Math.abs(shift)>1000)throw Error('Decimal exponent is too large.');let digits=m[2]+(m[3]||'');if(shift<0){if(!/^0*$/.test(digits.slice(shift)))throw Error('Decimal conversion would discard digits.');digits=digits.slice(0,shift)||'0';}else digits+='0'.repeat(shift);return BigInt((m[1]||'')+digits);}
export function suggested(table,M){return table.headers.map((_,i)=>table.types?.[i]||infer(table.rows.map(r=>r[i]),M));}
export function write(table,options,M){
  const columns=options.columns;if(!columns?.length || new Set(columns).size!==columns.length || columns.some(i=>!Number.isInteger(i)||i<0||i>=table.headers.length))throw Error('Choose each output field once.');
  if((table.rows.length+1)*columns.length>limits.cells || table.rows.length>limits.rows)throw Error('Parquet output exceeds the row or cell limit.');
  const defaults=suggested(table,M);
  const columnData=[], schema=[{name:'schema',num_children:columns.length}];
  for(const i of columns){
    const values=table.rows.map(r=>r[i]);const type=options.types?.[i]||defaults[i];let element={name:table.headers[i],repetition_type:'OPTIONAL'},data;
    const text=v=>v instanceof M.JsonNumber?v.token:typeof v==='string'?v:M.cellText(v);
    if(type==='text'){element={...element,type:'BYTE_ARRAY',converted_type:'UTF8'};data=values.map(v=>v==null?null:text(v));}
    else if(type==='boolean'){element.type='BOOLEAN';data=values.map(v=>{if(v==null)return null;if(v===true||v===false)return v;if(v==='true'||v==='false')return v==='true';throw Error('Boolean values must be true or false.');});}
    else if(type==='integer'){element.type='INT64';const original=table.schema?.[i],unsigned=original?.converted_type==='UINT_64'||original?.logical_type?.type==='INTEGER'&&original.logical_type.bitWidth===64&&!original.logical_type.isSigned;if(unsigned)element.converted_type='UINT_64';data=values.map(v=>{if(v==null)return null;const t=text(v);if(!/^-?\d+$/.test(t))throw Error('Integer values must contain whole numbers.');const n=BigInt(t);if(n<(unsigned?0n:-(1n<<63n))||n>(unsigned?(1n<<64n)-1n:(1n<<63n)-1n))throw Error('Integer exceeds its 64-bit range. Choose decimal or text.');return n;});}
    else if(type==='decimal'){
      let scale=table.schema?.[i]?.scale || 0;for(const v of values)if(v!=null){const m=text(v).match(/^-?\d+(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);if(!m)throw Error('Decimal values must be numbers.');scale=Math.max(scale,(m[1]||'').length-Number(m[2]||0));}if(scale>38)throw Error('Decimal scale exceeds 38. Choose text.');
      data=values.map(v=>v==null?null:scaled(text(v),scale));const precision=data.reduce((p,v)=>v==null?p:Math.max(p,(v<0n?-v:v).toString().length),Math.max(scale,1,table.schema?.[i]?.precision||0));if(precision>38)throw Error('Decimal precision exceeds 38 digits. Choose text.');
      element={...element,type:'FIXED_LEN_BYTE_ARRAY',type_length:16,converted_type:'DECIMAL',precision,scale};
    }else if(type==='number'){element.type='DOUBLE';data=values.map(v=>{if(v==null)return null;const t=text(v);if(!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(t)||!Number.isFinite(Number(t)))throw Error('Floating-point values must be finite numbers.');return Number(t);});}
    else if(type==='date'){element={...element,type:'INT32',converted_type:'DATE'};data=values.map(v=>{if(v==null)return null;const t=text(v),n=Date.parse(t+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(t)||!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==t)throw Error('Dates must use YYYY-MM-DD.');return n/86400000;});}
    else if(type==='timestamp'){
      const original=table.schema?.[i];const unit=original?.logical_type?.unit || (original?.converted_type==='TIMESTAMP_MICROS'?'MICROS':original?.converted_type==='TIMESTAMP_MILLIS'?'MILLIS':'NANOS');const digits=unit==='NANOS'?9:unit==='MICROS'?6:3;const utc=original?.logical_type?.isAdjustedToUTC!==false;
      element={...element,type:'INT64',logical_type:{type:'TIMESTAMP',unit,isAdjustedToUTC:utc}};
      data=values.map(v=>{if(v==null)return null;const t=text(v),m=t.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z)?$/);if(!m||utc&&!m[3])throw Error('Timestamps must use ISO dates with Z for UTC.');const seconds=Date.parse(m[1]+'Z');if(!Number.isFinite(seconds)||new Date(seconds).toISOString().slice(0,19)!==m[1])throw Error('Invalid timestamp.');if((m[2]||'').slice(digits).replace(/0/g,''))throw Error('Timestamp precision would be lost.');const n=BigInt(seconds/1000)*10n**BigInt(digits)+BigInt((m[2]||'').padEnd(digits,'0').slice(0,digits)||0);if(n<-(1n<<63n)||n>(1n<<63n)-1n)throw Error('Timestamp exceeds its 64-bit range.');return n;});
    }else throw Error('Choose a supported Parquet column type.');
    schema.push(element);columnData.push({name:element.name,data});
  }
  const bytes=parquetWriteBuffer({columnData,schema,codec:'SNAPPY',rowGroupSize:10000,statistics:false});
  if(bytes.byteLength>limits.bytes)throw Error('Parquet output exceeds 256 MiB.');
  return {bytes,headers:columns.map(i=>table.headers[i]),preview:table.rows.slice(0,100).map(r=>columns.map(i=>M.cellText(r[i]))),count:table.rows.length,extension:'parquet',mime:'application/vnd.apache.parquet',warnings:['Missing values become null. Floating-point columns use approximate binary numbers; choose decimal for exact digits.']};
}
