(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('../data-file-converter/model.js'):root.DataConverter);if(typeof module==='object'&&module.exports)module.exports=api;else root.TextExtractor=api;})(typeof globalThis!=='undefined'?globalThis:this,function(C){
 'use strict';
 const LIMITS=Object.freeze({bytes:1048576,characters:1048576,matches:20000,output:20000000});
 function cleanURL(value){
  const pairs={')':'(',']':'[','}':'{'},counts=new Map();
  for(const character of value)if('()[]{}'.includes(character))counts.set(character,(counts.get(character)||0)+1);
  let end=value.length;
  while(end){
   const last=value[end-1];
   if('.,;!'.includes(last)){end--;continue;}
   if(pairs[last]&&(counts.get(last)||0)>(counts.get(pairs[last])||0)){counts.set(last,counts.get(last)-1);end--;continue;}
   break;
  }
  const s=value.slice(0,end);
  try{const u=new URL(s);return ['http:','https:'].includes(u.protocol)&&u.hostname?s:null;}catch{return null;}
 }
 function extract(text,options){
  if(typeof text!=='string'||text.length>LIMITS.characters||new TextEncoder().encode(text).length>LIMITS.bytes)throw Error('Text input exceeds 1 MiB. Use a smaller file or paste.');
  if(!['email','url','label','pattern'].includes(options.mode))throw Error('Choose an extraction preset.');
  let regex,group=0;
  const insensitive=options.ignoreCase?'i':'';
  if(options.mode==='email')regex=/[A-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+/gi;
  if(options.mode==='url')regex=/\bhttps?:\/\/[^\s<>"']+/gi;
  if(options.mode==='label'){
   const label=String(options.label||'').trim();if(!label||label.length>200||/[\r\n]/.test(label))throw Error('Enter a single label up to 200 characters.');
   if(![':', '='].includes(options.separator))throw Error('Choose a colon or equals sign.');
   const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');regex=new RegExp('^[\\t ]*'+escape(label)+'[\\t ]*'+escape(options.separator)+'[\\t ]*([^\\r\\n]*)','gm'+insensitive);group=1;
  }
  if(options.mode==='pattern'){
   if(typeof options.pattern!=='string'||!options.pattern||options.pattern.length>1000)throw Error('Enter a pattern up to 1,000 characters, without surrounding slashes.');
   group=Number(options.group);if(!Number.isInteger(group)||group<0||group>20)throw Error('Capture group must be a whole number from 0 to 20.');
   try{regex=new RegExp(options.pattern,'gmu'+insensitive);}catch{throw Error('The pattern is invalid. Check the pattern syntax.');}
  }
  const starts=[0];for(const m of text.matchAll(/\r\n|\r|\n/g))starts.push(m.index+m[0].length);
  function position(index){let lo=0,hi=starts.length;while(lo+1<hi){const mid=(lo+hi)>>>1;if(starts[mid]<=index)lo=mid;else hi=mid;}return [String(lo+1),String(index-starts[lo]+1)];}
  const found=[];let match,attempts=0,size=0;
  while((match=regex.exec(text))!==null){
   if(++attempts>LIMITS.matches)throw Error('More than 20,000 matches. Use a narrower pattern or smaller source.');
   if(group>=match.length)throw Error('That capture group does not exist in this pattern. Use 0 for the full match.');
   let value=match[group]??'';if(options.mode==='url')value=cleanURL(value);if(options.mode==='label')value=value.trim();
   if(value){size+=value.length;if(size>LIMITS.output)throw Error('Extracted values exceed 20 million characters.');found.push({value,index:match.index});}
   if(match[0]===''){const code=text.codePointAt(regex.lastIndex);regex.lastIndex+=code>0xffff?2:1;}
  }
  let headers,rows;
  if(options.unique){const values=new Map();for(const item of found){const current=values.get(item.value);if(current)current.count++;else values.set(item.value,{...item,count:1});}headers=['Value','Count','First line','First column'];rows=[...values.values()].map(item=>[item.value,String(item.count),...position(item.index)]);}
  else{headers=['Value','Line','Column'];rows=found.map(item=>[item.value,...position(item.index)]);}
  return {table:{headers,rows},summary:{matches:found.length,rows:rows.length},preview:rows.slice(0,100)};
 }
 function output(result,options){if(!result)throw Error('Extract values before exporting.');if(options.format==='items'){const text=result.table.rows.map(r=>r[0]).join('\n');return {text,extension:'txt',mime:'text/plain;charset=utf-8',headers:['Value'],preview:result.table.rows.slice(0,100).map(r=>[r[0]]),count:result.table.rows.length};}return C.output(result.table,{columns:result.table.headers.map((_,i)=>i),format:options.format,protect:options.protect});}
 return {LIMITS,extract,output,cleanURL};
});
