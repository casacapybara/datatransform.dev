'use strict';
importScripts('../data-file-converter/model.js','json-model.js');
const M=DataConverter,J=JsonTools;
let source,selection,filtered,queryResult,pendingEdit,history=[],future=[];
function libs(){if(!self.WorkbenchLibraries)importScripts('workbench-bundle.js');return WorkbenchLibraries;}
function parquet(){if(!self.ParquetAdapter)importScripts('parquet-bundle.js');return ParquetAdapter;}
function loaded(){if(source===undefined)throw Error('Load and validate a document first.');}
function tree(path,offset=0){const v=J.get(source,path);if(v===undefined)throw Error('This location does not exist.');const keys=v&&typeof v==='object'&&!(v instanceof M.JsonNumber)?Object.keys(v):[];return {pointer:J.pointer(path),value:M.stringify(v).slice(0,30000),total:keys.length,children:keys.slice(offset,offset+100).map(k=>{const child=v[k],p=[...path,k];return {key:k,pointer:J.pointer(p),branch:child!==null&&typeof child==='object'&&!(child instanceof M.JsonNumber),summary:child instanceof M.JsonNumber?child.token:child===null?'null':Array.isArray(child)?`Array · ${child.length} items`:typeof child==='object'?`Object · ${Object.keys(child).length} fields`:JSON.stringify(child).slice(0,300)};})};}
function changed(value){source=J.parse(M.stringify(value));selection=filtered=queryResult=pendingEdit=undefined;return {text:J.pretty(source),undo:history.length,redo:future.length};}
function remember(){const text=M.stringify(source);history.push(text);while(history.length>20||history.reduce((n,s)=>n+s.length,0)>32000000)history.shift();future=[];}
async function handle(action,o){
  if(action==='load'){source=selection=filtered=queryResult=pendingEdit=undefined;history=[];future=[];source=J.parse(o.text,o.format);return {collections:o.collections?M.collections(source).items:[],tree:tree([]),text:J.pretty(source)};}
  loaded();
  if(action==='select'){selection=filtered=undefined;selection=J.select(source,o.path);filtered=J.filter(selection,{});return {headers:selection.table.headers,count:selection.records.length,warnings:selection.table.warnings};}
  if(action==='filter'){filtered=undefined;if(!selection)throw Error('Choose a collection first.');filtered=J.filter(selection,o);return {headers:filtered.table.headers,preview:filtered.table.rows.slice(0,100).map(r=>r.map(M.cellText)),count:filtered.originals.length,total:filtered.total};}
  if(action==='record'){if(!filtered||!Number.isInteger(o.index)||o.index<0||o.index>=filtered.originals.length)throw Error('Choose a matching record.');return {text:J.pretty(filtered.originals[o.index])};}
  if(action==='export'){
    if(o.target==='query'){if(!queryResult)throw Error('Run a query first.');return {text:J.pretty(queryResult.values),extension:'json',mime:'application/json'};}
    if(o.target==='document')return {text:o.minify?M.stringify(source):J.pretty(source),extension:'json',mime:'application/json'};
    if(!filtered)throw Error('Find matching records first.');
    if(o.originals)return {text:o.format==='jsonl'?filtered.originals.map(M.stringify).join('\n'):J.pretty(filtered.originals),extension:o.format==='jsonl'?'jsonl':'json',mime:'application/json'};
    if(o.format==='parquet')return parquet().write(filtered.table,o,M);
    let X;if(o.format==='xlsx'){if(!self.XLSX)importScripts('../data-file-converter/vendor/xlsx.full.min.js');X=XLSX;}
    return M.output(filtered.table,o,X);
  }
  if(action==='tree')return tree(J.pointerPath(o.pointer),o.offset||0);
  if(action==='value'){const value=J.get(source,J.pointerPath(o.pointer));if(value===undefined)throw Error('This JSON Pointer does not identify an existing value.');return {text:J.pretty(value)};}
  if(action==='format')return {text:o.minify?M.stringify(source):J.pretty(source)};
  if(action==='query'){queryResult=undefined;queryResult=libs().query(source,o.expression,M,J);return {text:J.pretty(queryResult.values).slice(0,30000),paths:queryResult.paths.slice(0,200),count:queryResult.values.length};}
  if(action==='previewEdit'){pendingEdit=undefined;const value=J.edit(source,o.pointer,o.operation,o.text);pendingEdit=value;return J.diff(source,value);}
  if(action==='applyEdit'){if(pendingEdit===undefined)throw Error('Preview a change first.');const value=pendingEdit;remember();return changed(value);}
  if(action==='undo'){if(!history.length)throw Error('No earlier edit.');future.push(M.stringify(source));return changed(J.parse(history.pop()));}
  if(action==='redo'){if(!future.length)throw Error('No later edit.');history.push(M.stringify(source));return changed(J.parse(future.pop()));}
  if(action==='schema')return libs().validate(source,o.text,M,J);
  if(action==='diff')return J.diff(source,J.parse(o.text));
  throw Error('Unknown JSON action.');
}
let queue=Promise.resolve();
self.onmessage=event=>{const {id,action,options}=event.data;queue=queue.then(async()=>{try{const result=await handle(action,options||{});self.postMessage({id,result},result.bytes?[result.bytes]:[]);}catch(e){self.postMessage({id,error:e.message||'Processing failed.'});}});};
