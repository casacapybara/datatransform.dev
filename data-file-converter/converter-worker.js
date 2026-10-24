'use strict';
importScripts('vendor/xlsx.full.min.js', 'model.js');
const converter = DataConverter.engine(XLSX);
let parquet = null, parquetState = null, pending = Promise.resolve();
function library() { if (!parquet) { importScripts('../shared/parquet-bundle.js'); parquet = ParquetAdapter; } return parquet; }
async function handle({id, action, options}) {
  try {
    if (!['load','select','export'].includes(action)) throw new Error('Unknown conversion action.');
    let result;
    if (action === 'load') {
      parquetState = null;
      converter.load({format:'csv',text:'placeholder'});
      if (options.format === 'parquet' || options.format === 'auto' && /\.parquet$/i.test(options.name || '')) {
        const P=library(); const file=options.file ? {byteLength:options.file.size,slice:(a,b)=>options.file.slice(a,b).arrayBuffer()} : P.bufferFile(options.bytes);
        parquetState=await P.inspect(file);
        result={format:'parquet',sheets:[],collections:[],defaultPath:'[]',count:parquetState.count};
      } else result=converter.load(options);
    } else if (action === 'select') {
      if (parquetState) result=converter.typedTable(await library().read(parquetState,DataConverter));
      else result=converter.select(options);
      const table=converter.typedSnapshot(); result.types=table.types || table.headers.map((_,i)=>{const values=table.rows.map(r=>r[i]).filter(v=>v!=null);return values.length&&values.every(v=>typeof v==='boolean')?'boolean':values.length&&values.every(v=>v instanceof DataConverter.JsonNumber)?(values.every(v=>/^-?\d+$/.test(v.token))?'integer':'decimal'):'text';});
    } else if (options.format === 'parquet') result=library().write(converter.typedSnapshot(),options,DataConverter);
    else result=converter.export(options);
    self.postMessage({id,action,result},result.bytes?[result.bytes]:[]);
  } catch(err) { self.postMessage({id,action,error:err.message || 'Conversion failed. Try a smaller file.'}); }
}
self.onmessage=event=>{ return pending=pending.then(()=>handle(event.data)); };
