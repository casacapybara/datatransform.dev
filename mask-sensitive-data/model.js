/* Column masking never removes records or exports the source-to-placeholder map. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('../data-file-converter/model.js'):root.DataConverter);if(typeof module==='object'&&module.exports)module.exports=api;else root.DataMasker=api;})(typeof globalThis!=='undefined'?globalThis:this,function(C){
 'use strict';
 function transform(table,actions){
  if(!Array.isArray(actions)||actions.length!==table.headers.length||actions.some(a=>!['remove','keep','mask'].includes(a)))throw new Error('Choose Remove, Keep or Consistent placeholder for every column.');
  const columns=actions.flatMap((a,i)=>a==='remove'?[]:[i]);if(!columns.length)throw new Error('Keep or mask at least one column.');
  const maps=table.headers.map(()=>new Map());let replaced=0,characters=0;
  const rows=table.rows.map(row=>columns.map(i=>{let value=row[i];if(actions[i]==='mask'&&value!==''){const map=maps[i];if(!map.has(value))map.set(value,`Value ${i+1}-${String(map.size+1).padStart(6,'0')}`);value=map.get(value);replaced++;}characters+=value.length;if(characters>20000000)throw new Error('Masked output exceeds 20 million characters.');return value;}));
  return {table:{headers:columns.map(i=>table.headers[i]),rows},summary:{rows:rows.length,replaced,removed:table.headers.filter((_,i)=>actions[i]==='remove'),kept:table.headers.filter((_,i)=>actions[i]==='keep'),masked:table.headers.filter((_,i)=>actions[i]==='mask')}};
 }
 function session(X){const importer=C.engine(X);let table=null,result=null;return {
  load(input){table=result=null;return importer.load(input);},
  select(options){table=result=null;const meta=importer.select(options);table=importer.snapshot();return {...meta,preview:table.rows.slice(0,5)};},
  run(options){result=null;if(!table)throw new Error('Load source data first.');result=transform(table,options.actions);return {summary:result.summary,headers:result.table.headers,preview:result.table.rows.slice(0,100)};},
  export(options){if(!result)throw new Error('Preview masking before exporting.');return C.output(result.table,{columns:result.table.headers.map((_,i)=>i),format:options.format,protect:options.protect});}
 };}
 return {transform,session};
});
