/* Table reshaping with exact decimal aggregation and bounded expansion. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('../data-file-converter/model.js'):root.DataConverter);if(typeof module==='object'&&module.exports)module.exports=api;else root.TableReshaper=api;})(typeof globalThis!=='undefined'?globalThis:this,function(C){
'use strict';
const TASKS=['summary','unpivot','pivot','expand'], AGGS=['count','sum','average','min','max','first','block'];
function decimal(value,row,column){const s=value.trim();if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)||s.length>1000)throw new Error(`Data row ${row}, ${column}: use a plain decimal number (up to 1,000 characters), without currency or grouping separators.`);const negative=s[0]==='-',parts=s.replace(/^[+-]/,'').split('.');return {n:BigInt((negative?'-':'')+(parts[0]||'0')+(parts[1]||'')),scale:(parts[1]||'').length};}
function format(n,scale){const sign=n<0n?'-':'';let s=(n<0n?-n:n).toString().padStart(scale+1,'0');if(scale)s=s.slice(0,-scale)+'.'+s.slice(-scale);return sign+s.replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');}
function aggregate(kind){return {kind,count:0,numberCount:0,n:0n,scale:0,first:''};}
function add(a,value,row,column){a.count++;if(a.count===1)a.first=value;if(a.kind==='block'&&a.count>1)throw new Error('More than one source row has the same identifying columns and pivot heading. Choose how to combine duplicate values.');if(!['sum','average','min','max'].includes(a.kind)||!value.trim())return;
const d=decimal(value,row,column),scale=Math.max(a.scale,d.scale),old=a.n*10n**BigInt(scale-a.scale),next=d.n*10n**BigInt(scale-d.scale);a.n=!a.numberCount||a.kind==='sum'||a.kind==='average'?old+next:a.kind==='min'?(old<next?old:next):(old>next?old:next);a.scale=scale;a.numberCount++;}
function finish(a){if(a.kind==='count')return String(a.count);if(['first','block'].includes(a.kind))return a.first;if(!a.numberCount)return '';if(a.kind!=='average')return format(a.n,a.scale);const scale=Math.max(a.scale,10),n=a.n*10n**BigInt(scale-a.scale),div=BigInt(a.numberCount);let q=n/div;const rem=n%div;if((rem<0n?-rem:rem)*2n>=div)q+=n<0n?-1n:1n;return format(q,scale);}
function transform(table,o){
const H=table.headers,R=table.rows;if(!TASKS.includes(o.task))throw new Error('Choose a reshaping task.');
function col(c){if(!Number.isInteger(c)||c<0||c>=H.length)throw new Error('Choose a valid source column.');return c;}
function cols(cs,required=false){if(!Array.isArray(cs)||new Set(cs).size!==cs.length||required&&!cs.length)throw new Error('Choose columns without repeats.');cs.forEach(col);return cs;}
const rows=[];let headers=[],chars=0;
function start(names){if(!names.length||names.length>100)throw new Error('Output exceeds 100 columns. Choose fewer fields or pivot headings.');if(names.some(n=>typeof n!=='string'||!n.trim())||new Set(names).size!==names.length)throw new Error('Output column names must be nonblank and unique. Change the new names or pivot values.');headers=names;chars=names.join('').length;}
function push(row){chars+=row.reduce((n,v)=>n+v.length,0);if(rows.length>=20000||(rows.length+2)*headers.length>500000||chars>20000000)throw new Error('Output exceeds 20,000 rows, 500,000 cells or 20 million characters. Use a smaller table or fewer columns.');rows.push(row);}
if(o.task==='unpivot'){
 const values=cols(o.columns,true),keep=H.map((_,i)=>i).filter(i=>!values.includes(i));start([...keep.map(i=>H[i]),o.nameColumn,o.valueColumn]);
 R.forEach(r=>values.forEach(i=>{if(o.skipBlank&&!r[i].trim())return;push([...keep.map(k=>r[k]),H[i],r[i]]);}));
}else if(o.task==='expand'){
 const c=col(o.value);if(typeof o.delimiter!=='string'||!o.delimiter.length||o.delimiter.length>100)throw new Error('Enter a literal separator of 1–100 characters.');start([...H]);
 R.forEach(r=>{let from=0;while(true){const next=r[c].indexOf(o.delimiter,from);let part=r[c].slice(from,next<0?undefined:next);if(o.trim)part=part.trim();if(!o.skipBlank||part.trim()!==''){const row=[...r];row[c]=part;push(row);}if(next<0)break;from=next+o.delimiter.length;}});
}else{
 const groups=cols(o.groups),kind=o.aggregate;if(!AGGS.includes(kind)||(o.task==='summary'&&kind==='block'))throw new Error('Choose a supported calculation.');
 const value=kind==='count'?null:col(o.value),pivot=o.task==='pivot'?col(o.pivot):null;if(groups.includes(value)||groups.includes(pivot)||pivot!==null&&pivot===value)throw new Error('Identifying, heading and value columns must be different.');
 const grouped=new Map(),headings=new Map(),total=aggregate(kind);if(o.task==='summary')start([...groups.map(i=>H[i]),o.resultName]);
 R.forEach((r,index)=>{const key=JSON.stringify(groups.map(i=>r[i]));if(!grouped.has(key))grouped.set(key,{keys:groups.map(i=>r[i]),cells:new Map()});const g=grouped.get(key),heading=pivot===null?'':r[pivot];if(!headings.has(heading)){headings.set(heading,headings.size);if(pivot!==null&&headings.size+groups.length>100)throw new Error('Pivot output exceeds 100 columns. Reduce distinct pivot headings.');}if(!g.cells.has(heading))g.cells.set(heading,aggregate(kind));add(g.cells.get(heading),value===null?'':r[value],index+1,H[value]);if(o.task==='summary'&&o.totals)add(total,value===null?'':r[value],index+1,H[value]);});
 if(o.task==='pivot')start([...groups.map(i=>H[i]),...headings.keys()]);
 if(!R.length&&o.task==='summary'&&!groups.length)push([kind==='count'?'0':'']);
 for(const g of grouped.values())push([...g.keys,...(o.task==='summary'?[finish(g.cells.get(''))]:[...headings.keys()].map(h=>g.cells.has(h)?finish(g.cells.get(h)):kind==='count'?'0':''))]);
 if(o.task==='summary'&&o.totals&&groups.length)push([...groups.map((_,i)=>i===0?'Grand total':''),finish(total)]);
}
return {table:{headers,rows},summary:{sourceRows:R.length,sourceColumns:H.length,rows:rows.length,columns:headers.length}};
}
function session(X){const importer=C.engine(X);let table=null,result=null;return {load(input){table=result=null;return importer.load(input);},select(options){table=result=null;const meta=importer.select(options);table=importer.snapshot();return {...meta,preview:table.rows.slice(0,5)};},run(options){result=null;if(!table)throw new Error('Load source data first.');result=transform(table,options);return {summary:result.summary};},export(options){if(!result)throw new Error('Preview the current reshaping before exporting.');return C.output(result.table,{columns:result.table.headers.map((_,i)=>i),format:options.format||'csv',protect:options.protect});}};}
return {TASKS,transform,session};
});
