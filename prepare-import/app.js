(function(){
  'use strict';
  const M=window.ImportPreparer,$=id=>document.getElementById(id),timers=new Map();
  let worker=null,local=null,generation=0,request=0,active=0,meta=null,headers=[],ready=false,latest=null,sourceName='',demo=false;
  let destination=[],fields=[],templateVersion=0,pendingAction='';
  function emit(name){try{window.DataTransformEvents?.emit(name,{},'prepare-import');}catch{}}
  function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
  function status(id,text,error=false){$(id).textContent=text;$(id).classList.toggle('error',error);}
  function stop(){pendingAction='';generation++;active=++request;timers.forEach(clearTimeout);timers.clear();worker?.terminate();worker=local=null;}
  function clearExport(){latest=null; $('textPreview').textContent = '';$('download').disabled=$('copy').disabled=true;$('resultTable').replaceChildren(node('p','No output available.','empty'));}
  function clearResult(){ready=false;clearExport();$('summary').hidden=true;$('summary').replaceChildren();$('summaryNote').textContent='';}
  function clearSelection(){headers=[];clearResult();buildMappings();$('sourceWarnings').replaceChildren();$('sourcePreview').replaceChildren(node('p','No data loaded.','empty'));}
  function clearSource(){meta=null;clearSelection();$('sourceControls').disabled=true;$('sheetGroup').hidden=$('jsonGroup').hidden=true;$('headerGroup').hidden=false;$('worksheet').replaceChildren();$('jsonCollection').replaceChildren();}
  function canRun(){return headers.length>0&&fields.length>0;}
  function invalidate(){if(!['load','select'].includes(pendingAction))active=++request;clearResult();$('run').disabled=!canRun();status('runStatus','Settings changed. Preview the import file again.');status('exportStatus','Preview the current settings before exporting.');}
  function buildMappings(){
    fields=headers.length&&destination.length?M.autoMap(headers,destination):[];
    $('mappingControls').disabled=!fields.length;$('run').disabled=!canRun();
    $('mappings').replaceChildren(...fields.map((field,i)=>{
      const card=node('div',undefined,'mapping-field'),heading=node('h3'),order=node('span',String(i+1).padStart(2,'0')+' ','mapping-order');heading.id='field-heading-'+i;card.setAttribute('role','group');card.setAttribute('aria-labelledby',heading.id);heading.append(order,node('span',field.name));
      const grid=node('div',undefined,'form-grid');
      function control(id,label,el){const box=node('div'),lab=node('label',label);lab.htmlFor=id;el.id=id;el.className='control';box.append(lab,el);grid.append(box);return el;}
      const source=control('source-'+i,'Source column',node('select'));
      const none=node('option','No source · use default or blank');none.value='';source.append(none,...headers.map((h,c)=>{const o=node('option',h);o.value=String(c);return o;}));source.value=field.source===null?'':String(field.source);
      source.addEventListener('change',()=>{field.source=source.value===''?null:Number(source.value);invalidate();mappingNote();});
      const fallback=control('default-'+i,'Default for blank values',node('input'));fallback.maxLength=1000;fallback.value=field.default;fallback.addEventListener('input',()=>{field.default=fallback.value;invalidate();mappingNote();});
      const conversion=control('conversion-'+i,'Convert values',node('select'));conversion.append(...Object.entries(M.CONVERSIONS).map(([v,label])=>{const o=node('option',label);o.value=v;return o;}));conversion.value=field.conversion;
      conversion.addEventListener('change',()=>{field.conversion=conversion.value;invalidate();});
      const label=node('label',undefined,'check'),required=node('input');required.type='checkbox';required.id='required-'+i;required.checked=field.required;required.addEventListener('change',()=>{field.required=required.checked;invalidate();});label.append(required,node('span','Required · must contain a value'));
      card.append(heading,grid,label);return card;
    }));mappingNote();
  }
  function mappingNote(){status('mappingStatus',fields.length?`${fields.length} destination fields · ${fields.filter(f=>f.source!==null).length} mapped · ${fields.filter(f=>f.source===null&&f.default==='').length} without a source or default. Output follows template order.`:'Load source data and a destination template to map fields.');}
  function tableView(id,names,rows,caption,empty='No rows in this view.'){
    const table=node('table'),head=node('thead'),body=node('tbody'),tr=node('tr');names.forEach(h=>{const th=node('th',h);th.scope='col';tr.append(th);});head.append(tr);rows.forEach(row=>{const tr=node('tr');row.forEach(v=>tr.append(node('td',v)));body.append(tr);});table.append(node('caption',caption,'sr-only'),head,body);$(id).replaceChildren(table);if(!rows.length)$(id).append(node('p',empty,'empty'));
  }
  function fail(action,message){
    if(action==='load'){clearSource();status('loadStatus',message+' No data is loaded.',true);status('dataStatus','Choose another file or correct the source.');}
    if(action==='select'){clearSelection();status('dataStatus',message,true);}
    if(action!=='export'){clearResult();$('run').disabled=!canRun();status('runStatus',message,true);}else clearExport();
    status('exportStatus',message,true);emit('import_failed');
  }
  function backend(){
    const g=generation;if(location.protocol==='file:'){local=M.session(window.XLSX);return;}
    if(!window.Worker)throw new Error('This browser cannot start background import preparation. Try a current browser.');
    worker=new Worker('import-worker.js');worker.onmessage=event=>{if(g!==generation)return;clearTimeout(timers.get(event.data.id));timers.delete(event.data.id);if(event.data.id===active)receive(event.data);};
    worker.onerror=()=>{if(g!==generation)return;stop();clearSource();status('loadStatus','Background processing stopped. Load the data again or use a smaller file.',true);status('runStatus','No import preparation is available.');status('exportStatus','No output available.',true);emit('import_failed');};
  }
  function send(action,options){
    pendingAction=action;const id=active=++request,g=generation;
    if(worker){timers.set(id,setTimeout(()=>{if(g!==generation)return;stop();clearSource();status('loadStatus','Processing exceeded 20 seconds. Load a smaller file.',true);status('runStatus','Import preparation cancelled.');status('exportStatus','No output available.',true);emit('import_failed');},20000));try{worker.postMessage({id,action,options},options.bytes?[options.bytes]:[]);}catch(e){clearTimeout(timers.get(id));timers.delete(id);fail(action,e.message);}}
    else if(local)setTimeout(()=>{if(id!==active||g!==generation)return;try{receive({id,action,result:local[action](options)});}catch(e){receive({id,action,error:e.message});}},0);
  }
  function chooseData(){
    active=++request;clearSelection();if(!meta)return;const candidate=meta.collections.find(c=>JSON.stringify(c.path)===$('jsonCollection').value);$('headerGroup').hidden=['json','jsonl'].includes(meta.format)&&!candidate?.matrix;status('dataStatus','Reading the selected table…');status('runStatus','Waiting for source data.');status('exportStatus','No output yet.');send('select',{sheet:$('worksheet').value,path:$('jsonCollection').value,hasHeader:$('hasHeader').checked,excelValues:$('excelValues').value});
  }
  function exportReport(){if(!ready)return;clearExport();status('exportStatus','Preparing output…');send('export',{view:$('reportView').value,format:$('outputFormat').value,protect:$('protect').checked});}
  function run(){if(!canRun())return;clearResult();$('run').disabled=true;status('runStatus','Preparing and checking the import file…');status('exportStatus','Processing mapped fields…');send('run',{fields});}
  function receive(message){
    if(message.id!==active)return;pendingAction='';if(message.error){fail(message.action,message.error);return;}const r=message.result;
    if(message.action==='load'){
      meta=r;$('sourceControls').disabled=false;$('sheetGroup').hidden=r.format!=='excel';$('jsonGroup').hidden=!['json','jsonl'].includes(r.format);
      $('worksheet').replaceChildren(...r.sheets.map(s=>{const o=node('option',s.name+(s.hidden?' (hidden worksheet)':''));o.value=s.name;return o;}));if(r.sheets.length)$('worksheet').value=r.sheets[0].name;
      const placeholder=node('option','Choose a record collection');placeholder.value='';$('jsonCollection').replaceChildren(placeholder,...r.collections.map(c=>{const o=node('option',c.label);o.value=JSON.stringify(c.path);return o;}));$('jsonCollection').value=r.defaultPath;
      status('loadStatus',`Loaded ${sourceName}. Input format: ${r.format==='excel'?'Excel':r.format.toUpperCase()}.`);chooseData();emit('import_loaded');
    }else if(message.action==='select'){
      headers=r.headers;$('sourceWarnings').replaceChildren(...r.warnings.map(s=>node('li',s)));tableView('sourcePreview',headers,r.preview,'First 5 source rows');
      buildMappings();
      status('dataStatus',`${r.count.toLocaleString()} rows · ${headers.length} source columns. Mappings reset for this source.`);status('runStatus',canRun()?'Check mappings, then preview the import file.':'Load a destination template next.');
      if(demo){demo=false;fields[0].source=0;fields[0].required=true;fields[1].source=1;fields[1].required=true;fields[1].conversion='lower';fields[2].source=2;fields[2].conversion='date-dmy';fields[3].default='active';
        // Refresh the controls to show the example's deliberately renamed mappings.
        const exampleFields=fields.map(f=>({...f}));buildMappings();fields.forEach((f,i)=>{Object.assign(f,exampleFields[i]);$('source-'+i).value=f.source===null?'':String(f.source);$('required-'+i).checked=f.required;$('conversion-'+i).value=f.conversion;$('default-'+i).value=f.default;});mappingNote();run();}
    }else if(message.action==='run'){
      ready=true;$('run').disabled=false;$('summary').hidden=false;const s=r.summary;
      $('summary').replaceChildren(...[[s.rows,'Output rows'],[s.columns,'Template columns'],[s.defaults,'Defaults filled'],[s.issues,'Issues to resolve']].map(([n,label])=>{const card=node('div');card.append(node('strong',n.toLocaleString()),node('span',label));return card;}));
      $('summaryNote').textContent=`${s.changed} values converted. ${s.affected} rows need attention. ${s.unmapped} fields have no source or default.`;
      status('runStatus',s.issues?`${s.issues} issues must be resolved before downloading the import file. Choose Issues needing attention to review them.`:'All selected checks passed. Review the output before importing.');exportReport();emit('import_completed');
    }else if(message.action==='export'){
      tableView('resultTable',r.headers,r.preview,'First 100 output rows','No data rows in this view. Column headings are still available.');
      if(r.blocked){status('exportStatus',r.blocked,true);return;}
      latest={...r,view:$('reportView').value};$('textPreview').textContent = r.text.slice(0, 30000) + (r.text.length > 30000 ? '\n… Preview truncated; download or copy for the complete output.' : ''); $('download').disabled=$('copy').disabled=false;status('exportStatus',`Ready to download ${r.count.toLocaleString()} ${r.count===1?'row':'rows'}.`);
    }
  }
  function startLoad(input,name,isDemo=false){stop();clearSource();demo=isDemo;sourceName=name;status('loadStatus','Loading replaces the previous source…');status('dataStatus','Reading source data…');status('runStatus','Waiting for source data.');status('exportStatus','No output yet.');try{backend();send('load',input);}catch(e){fail('load',e.message);}}
  $('inputFile').addEventListener('change',async()=>{
    const file=$('inputFile').files[0];$('inputFile').value='';if(!file)return;stop();clearSource();demo=false;const g=generation;status('loadStatus',`Reading ${file.name}…`);status('dataStatus','Reading the selected file…');status('runStatus','Waiting for source data.');status('exportStatus','No output yet.');
    if(file.size>window.DataConverter.LIMITS.bytes){fail('load','Input exceeds 5 MiB.');return;}try{const bytes=await file.arrayBuffer();if(g!==generation)return;$('inputText').value='';startLoad({bytes,name:file.name,format:$('inputFormat').value},file.name);}catch{if(g===generation)fail('load','Could not read that file.');}
  });
  $('loadText').addEventListener('click',()=>startLoad({text:$('inputText').value,format:$('inputFormat').value},'pasted text'));
  function sourceEdited(){stop();clearSource();demo=false;status('loadStatus','Source changed. Load the pasted text or choose the file again.');status('dataStatus','Load the updated source to choose columns.');status('runStatus','No import preparation is available.');status('exportStatus','No output available.');}
  $('inputText').addEventListener('input',sourceEdited);$('inputFormat').addEventListener('change',sourceEdited);
  ['worksheet','jsonCollection','hasHeader','excelValues'].forEach(id=>$(id).addEventListener('change',()=>{demo=false;chooseData();}));
  function clearTemplate(message){demo=false;templateVersion++;destination=[];buildMappings();invalidate();status('templateStatus',message);}
  function loadTemplate(text,format){
    clearTemplate('Reading destination template…');
    try{const t=M.template(text,format);destination=t.headers;buildMappings();status('templateStatus',`${t.headers.length} destination columns loaded. ${t.ignored} sample rows ignored. Column names and order are preserved exactly.`);}
    catch(e){status('templateStatus',e.message,true);}
  }
  $('loadTemplate').addEventListener('click',()=>loadTemplate($('templateText').value,$('templateFormat').value));
  $('templateText').addEventListener('input',()=>clearTemplate('Template changed. Select Use this template.'));
  $('templateFormat').addEventListener('change',()=>clearTemplate('Template format changed. Load the template again.'));
  $('templateFile').addEventListener('change',async()=>{
    const file=$('templateFile').files[0];$('templateFile').value='';if(!file)return;clearTemplate('Reading template file…');const version=templateVersion;
    try{if(file.size>window.DataConverter.LIMITS.bytes)throw new Error('Template exceeds 5 MiB.');const bytes=await file.arrayBuffer();if(version!==templateVersion)return;
      const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),format=file.name.toLowerCase().endsWith('.tsv')?'tsv':'csv';$('templateFormat').value=format;$('templateText').value=text;loadTemplate(text,format);
    }catch(e){if(version===templateVersion)status('templateStatus','Could not load template: '+e.message,true);}
  });
  ['reportView','protect','outputFormat'].forEach(id=>$(id).addEventListener('change',exportReport));$('run').addEventListener('click',run);
  $('example').addEventListener('click',()=>{
    templateVersion++;$('templateFormat').value='csv';$('templateText').value='customer_id,email,joined_on,status';loadTemplate($('templateText').value,'csv');$('inputFormat').value='csv';$('hasHeader').checked=true;$('reportView').value='data';$('outputFormat').value='csv';$('protect').checked=false;
    const text='Customer ref,Email address,Start date,Unused note\n001, ALICE@example.test ,18/10/2026,omit this\n002, bob@example.test ,01/09/2026,omit this';$('inputText').value=text;startLoad({text,format:'csv'},'fictional customer example',true);
  });
  $('reset').addEventListener('click',()=>{stop();destination=[];templateVersion++;clearSource();demo=false;$('inputText').value=$('inputFile').value=$('templateText').value=$('templateFile').value='';$('inputFormat').value='auto';$('templateFormat').value='csv';$('excelValues').value='display';$('hasHeader').checked=true;$('protect').checked=false;$('reportView').value='data';$('outputFormat').value='csv';['pastePanel','sourcePreviewPanel'].forEach(id=>{$(id).open=false;});status('templateStatus','No destination template loaded.');status('loadStatus','All data and settings cleared.');status('dataStatus','Load source data to begin.');status('runStatus','Load both inputs to begin.');status('exportStatus','Preview the import file to create an output.');emit('import_cleared');});
  $('copy').addEventListener('click',async()=>{if(!latest)return;const result=latest;try{await navigator.clipboard.writeText(result.text);if(latest===result)status('exportStatus','Output copied to clipboard.');emit('import_copied');}catch{if(latest===result)status('exportStatus','Copy failed. Download the output instead.',true);}});
  $('download').addEventListener('click',()=>{if(!latest)return;const a=node('a'),url=URL.createObjectURL(new Blob([latest.text],{type:latest.mime}));a.href=url;a.download=`${latest.view==='data'?'prepared-import':'import-issues'}.${latest.extension}`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status('exportStatus','Download started.');emit('import_downloaded');});
  window.addEventListener('pagehide',stop);emit('tool_opened');
})();
