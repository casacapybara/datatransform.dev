'use strict';
window.JsonUI=(()=>{
  const $=id=>document.getElementById(id);
  function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
  function message(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
  class Client{
    constructor(){this.generation=0;this.id=0;this.requests=new Map();}
    reset(){this.generation++;this.worker?.terminate();this.worker=null;for(const {reject,timer}of this.requests.values()){clearTimeout(timer);reject(Error('Processing cancelled.'));}this.requests.clear();}
    request(action,options={}){if(!this.worker){this.worker=new Worker('../shared/json-worker.js');this.worker.onmessage=({data})=>{const r=this.requests.get(data.id);if(!r)return;clearTimeout(r.timer);this.requests.delete(data.id);data.error?r.reject(Error(data.error)):r.resolve(data.result);};this.worker.onerror=()=>{this.reset();message('Processing stopped. Reload your document.',true);};}
      const id=++this.id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.reset();message('Processing exceeded 120 seconds. Use a smaller document.',true);},120000);this.requests.set(id,{resolve,reject,timer});this.worker.postMessage({id,action,options});});}
  }
  function table(target,headers,rows,inspect){const t=el('table'),head=el('thead'),tr=el('tr'),body=el('tbody');for(const h of headers){const th=el('th',h);th.scope='col';tr.append(th);}if(inspect)tr.append(el('th','Record'));head.append(tr);rows.forEach((row,i)=>{const tr=el('tr');row.forEach(v=>tr.append(el('td',v)));if(inspect){const td=el('td'),b=el('button','Inspect','button small');b.type='button';b.addEventListener('click',()=>inspect(i));td.append(b);tr.append(td);}body.append(tr);});t.append(head,body);target.replaceChildren(t);if(!rows.length)target.append(el('p','No matching records.','empty'));}
  function preview(result){$('textPreview').textContent=result.text===undefined?'':result.text.slice(0,30000)+(result.text.length>30000?'\n… Preview truncated; download or copy for the complete output.':'');$('sourcePanel').hidden=result.text===undefined;}
  function download(result,name){const url=URL.createObjectURL(new Blob([result.bytes||result.text],{type:result.mime})),a=el('a');a.href=url;a.download=name+'.'+result.extension;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function read(file){if(file.size>32*1024*1024)throw Error('JSON files allow up to 32 MiB.');return new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}
  return {$,el,message,Client,table,preview,download,read};
})();
