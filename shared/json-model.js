(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('../data-file-converter/model.js'));else root.JsonTools=factory(root.DataConverter);})(globalThis,function(M){
'use strict';
const limits={...M.LIMITS,bytes:32*1024*1024,rows:250000,cells:2000000,characters:64000000,nodes:2000000,depth:100};
function parse(text,format='json'){
  if(new TextEncoder().encode(text).length>limits.bytes)throw Error('JSON input exceeds 32 MiB.');
  text=text.replace(/^\uFEFF/,'');
  if(format==='jsonl'){const lines=text.split(/\r\n|\r|\n/);let nodes=0;const records=[];lines.forEach((s,i)=>{if(!s.trim())return;try{const r=M.jsonParse(s,limits);nodes+=r.nodes;if(nodes>limits.nodes||records.length>=limits.rows)throw Error('JSON Lines exceeds the value or record limit.');records.push(r.value);}catch(e){throw Error(`Line ${i+1}: ${e.message}`);}});if(!records.length)throw Error('Load at least one JSON Lines record.');return records;}
  return M.jsonParse(text,limits).value;
}
function pretty(v){const chunks=[];let characters=0;function write(s){characters+=s.length;if(characters>limits.characters)throw Error('Formatted output exceeds 64 million characters. Use minified JSON or a smaller document.');chunks.push(s);}function visit(value,depth){if(value instanceof M.JsonNumber||value===null||typeof value!=='object'){write(M.stringify(value));return;}const array=Array.isArray(value),keys=Object.keys(value);write(array?'[':'{');if(keys.length){write('\n');keys.forEach((k,i)=>{write('  '.repeat(depth+1));if(!array)write(JSON.stringify(k)+': ');visit(value[k],depth+1);write(i===keys.length-1?'\n':',\n');});write('  '.repeat(depth));}write(array?']':'}');}visit(v,0);return chunks.join('');}
function get(v,path){for(const key of path){if(v===null||typeof v!=='object'||v instanceof M.JsonNumber||!Object.hasOwn(v,key))return undefined;v=v[key];}return v;}
function pointer(path){return path.length?'/'+path.map(k=>String(k).replace(/~/g,'~0').replace(/\//g,'~1')).join('/'):'';}
function pointerPath(p){if(p==='')return [];if(!p.startsWith('/')||/~(?![01])/u.test(p))throw Error('Use a JSON Pointer such as /customers/0/name.');return p.slice(1).split('/').map(k=>k.replace(/~1/g,'/').replace(/~0/g,'~'));}
function normalized(token){const m=String(token).match(/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);if(!m)throw Error('Enter a valid number.');let d=(m[2]+(m[3]||'')).replace(/^0+/,'');if(!d)return {sign:0,d:'0',e:0n};const e=BigInt(m[4]||0)-BigInt((m[3]||'').length)+BigInt(d.length);return {sign:m[1]?-1:1,d:d.replace(/0+$/,''),e};}
function compare(a,b){a=normalized(a);b=normalized(b);if(a.sign!==b.sign)return Math.sign(a.sign-b.sign);if(!a.sign)return 0;if(a.e!==b.e)return (a.e>b.e?1:-1)*a.sign;const n=Math.max(a.d.length,b.d.length),x=a.d.padEnd(n,'0'),y=b.d.padEnd(n,'0');return (x===y?0:x>y?1:-1)*a.sign;}
function matches(v,f){
  if(f.op==='missing')return v===undefined;if(f.op==='present')return v!==undefined;if(f.op==='null')return v===null;
  if(v===undefined)return false;
  if(f.op==='contains')return M.cellText(v).toLocaleLowerCase().includes(f.value.toLocaleLowerCase());
  if(['gt','lt','gte','lte'].includes(f.op)){if(!(v instanceof M.JsonNumber))return false;const c=compare(v.token,f.value);return f.op==='gt'?c>0:f.op==='lt'?c<0:f.op==='gte'?c>=0:c<=0;}
  const equal=v instanceof M.JsonNumber?/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(f.value)&&compare(v.token,f.value)===0:typeof v==='string'?v===f.value:M.stringify(v)===f.value;
  return f.op==='ne'?!equal:equal;
}
function select(value,path){const v=get(value,path);if(v===undefined)throw Error('Choose an available record collection.');const records=Array.isArray(v)?v:[v];if(!records.length)return {records,table:{headers:['Value'],rows:[],warnings:[],limits}};return {records,table:M.jsonTable(records,false,limits)};}
function filter(selection,options){const {table,records}=selection;const filters=options.filters||[];for(const f of filters){if(!table.headers.includes(f.field))throw Error('Choose an available filter field.');if(['gt','gte','lt','lte'].includes(f.op))normalized(f.value);}
  const rows=[],originals=[];records.forEach((record,i)=>{const row=table.rows[i];const results=filters.map(f=>matches(row[table.headers.indexOf(f.field)],f));if((!options.search||M.stringify(record).toLocaleLowerCase().includes(options.search.toLocaleLowerCase()))&&(!filters.length||(options.match==='any'?results.some(Boolean):results.every(Boolean)))){rows.push(row);originals.push(record);}});return {table:{...table,rows},originals,total:records.length};}
function edit(value,p,operation,text){const path=pointerPath(p),copy=parse(M.stringify(value));const replacement=operation==='remove'?undefined:parse(text);if(!path.length){if(operation==='remove')throw Error('The root document cannot be removed.');return replacement;}const parent=get(copy,path.slice(0,-1)),key=path.at(-1);if(!parent||typeof parent!=='object'||parent instanceof M.JsonNumber)throw Error('The parent path does not exist.');
  if(Array.isArray(parent)){if(operation==='add'&&key==='-'){parent.push(replacement);return copy;}if(!/^(0|[1-9]\d*)$/.test(key))throw Error('Use an array index.');const i=Number(key);if(i>parent.length||operation!=='add'&&i===parent.length)throw Error('Array index does not exist.');if(operation==='remove')parent.splice(i,1);else if(operation==='add')parent.splice(i,0,replacement);else parent[i]=replacement;}
  else {if(operation!=='add'&&!Object.hasOwn(parent,key))throw Error('The field does not exist.');if(operation==='remove')delete parent[key];else parent[key]=replacement;}return copy;
}
function diff(a,b){const changes=[];let total=0;function emit(kind,path,before,after){total++;if(changes.length<1000)changes.push({kind,path:pointer(path),before:before===undefined?'(missing)':M.stringify(before).slice(0,2000),after:after===undefined?'(missing)':M.stringify(after).slice(0,2000)});}
function walk(x,y,path){if(x instanceof M.JsonNumber&&y instanceof M.JsonNumber){if(compare(x.token,y.token)!==0)emit('changed',path,x,y);return;}if(x===y)return;if(x===undefined){emit('added',path,x,y);return;}if(y===undefined){emit('removed',path,x,y);return;}if(x&&y&&typeof x==='object'&&typeof y==='object'&&!(x instanceof M.JsonNumber)&&!(y instanceof M.JsonNumber)&&Array.isArray(x)===Array.isArray(y)){for(const key of new Set([...Object.keys(x),...Object.keys(y)]))walk(Object.hasOwn(x,key)?x[key]:undefined,Object.hasOwn(y,key)?y[key]:undefined,[...path,key]);}else emit('changed',path,x,y);}
walk(a,b,[]);return {changes,total};}
return {limits,parse,pretty,get,pointer,pointerPath,compare,matches,select,filter,edit,diff};
});
