(function(){
  'use strict';
  const M=window.DataCleaner,$=id=>document.getElementById(id),timers=new Map();
  let worker=null,local=null,generation=0,request=0,active=0,meta=null,headers=[],selected=new Set(),ready=false,latest=null,sourceName='',demo=false;
  const values={family:'text',textCase:'none',textPrefix:'',textSuffix:'',dateInput:'ymd',dateOutput:'ymd',sourceZone:'UTC',targetZone:'UTC',inputDecimal:'.',inputGroup:',',outputDecimal:'.',outputGroup:'none',places:'preserve',removeCurrency:'',addCurrency:'',outputMode:'replace',errorPolicy:'block'};
  const checks={textTrim:true,textSpaces:false,textInvisible:false,textNfc:false,textLines:false,parentheses:true};
  function emit(name){try{window.DataTransformEvents?.emit(name,{},'data-cleaner');}catch{}}
  function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
  function status(id,text,error=false){$(id).textContent=text;$(id).classList.toggle('error',error);}
  function stop(){generation++;active=++request;timers.forEach(clearTimeout);timers.clear();worker?.terminate();worker=local=null;}
  function clearExport(){latest=null; $('textPreview').textContent = '';$('download').disabled=$('copy').disabled=true;$('resultTable').replaceChildren(node('p','No output available.','empty'));}
  function clearResult(){ready=false;clearExport();$('summary').hidden=true;$('summary').replaceChildren();$('summaryNote').textContent='';$('changesPreview').replaceChildren(node('p','Run the current cleanup to see changes.','empty'));}
  function clearSelection(){headers=[];selected=new Set();clearResult();$('columns').replaceChildren();$('selectedCount').textContent='0 selected';$('run').disabled=$('cleanupControls').disabled=true;$('sourceWarnings').replaceChildren();$('sourcePreview').replaceChildren(node('p','No data loaded.','empty'));}
  function clearSource(){meta=null;clearSelection();$('sourceControls').disabled=true;$('sheetGroup').hidden=$('jsonGroup').hidden=true;$('headerGroup').hidden=false;$('worksheet').replaceChildren();$('jsonCollection').replaceChildren();}
  function visibility(){
    for(const family of ['text','date','number'])$(family+'Options').hidden=$('family').value!==family;
    const input=$('dateInput').value,output=$('dateOutput').value,direct=M.dateOnly(input)&&M.dateOnly(output);
    $('sourceZoneGroup').hidden=direct||!(input.startsWith('local')||M.dateOnly(input));
    $('targetZoneGroup').hidden=direct||['seconds','milliseconds'].includes(output);
    $('dateHelp').textContent=direct?'Calendar dates keep the same date; time zones are not applied.':'Use UTC or a supported IANA time zone, such as Europe/London. A date without a clock time means midnight in the source zone.';
  }
  function invalidate(){active=++request;clearResult();visibility();$('run').disabled=!headers.length||!selected.size;status('runStatus','Settings changed. Select Preview cleanup to run them.');status('exportStatus','Run the current cleanup before exporting.');}
  function tableView(id,names,rows,caption,empty='No rows in this view.'){
    const table=node('table'),head=node('thead'),body=node('tbody'),tr=node('tr');names.forEach(h=>{const th=node('th',h);th.scope='col';tr.append(th);});head.append(tr);rows.forEach(row=>{const tr=node('tr');row.forEach(v=>tr.append(node('td',v)));body.append(tr);});table.append(node('caption',caption,'sr-only'),head,body);$(id).replaceChildren(table);if(!rows.length)$(id).append(node('p',empty,'empty'));
  }
  function fail(action,message){
    if(action==='load'){clearSource();status('loadStatus',message+' No data is loaded.',true);status('dataStatus','Choose another file or correct the source.');}
    if(action==='select'){clearSelection();status('dataStatus',message,true);}
    if(action!=='export'){clearResult();$('run').disabled=!headers.length||!selected.size;status('runStatus',message,true);}else clearExport();
    status('exportStatus',message,true);emit('cleanup_failed');
  }
  function backend(){
    const g=generation;if(location.protocol==='file:'){local=M.session(window.XLSX);return;}
    if(!window.Worker)throw new Error('This browser cannot start background cleanup. Try a current browser.');
    worker=new Worker('cleaner-worker.js');worker.onmessage=event=>{if(g!==generation)return;clearTimeout(timers.get(event.data.id));timers.delete(event.data.id);if(event.data.id===active)receive(event.data);};
    worker.onerror=()=>{if(g!==generation)return;stop();clearSource();status('loadStatus','Background processing stopped. Load the data again or use a smaller file.',true);status('runStatus','No cleanup is available.');status('exportStatus','No output available.',true);emit('cleanup_failed');};
  }
  function send(action,options){
    const id=active=++request,g=generation;
    if(worker){timers.set(id,setTimeout(()=>{if(g!==generation)return;stop();clearSource();status('loadStatus','Processing exceeded 20 seconds. Load a smaller file.',true);status('runStatus','Cleanup cancelled.');status('exportStatus','No output available.',true);emit('cleanup_failed');},20000));try{worker.postMessage({id,action,options},options.bytes?[options.bytes]:[]);}catch(e){clearTimeout(timers.get(id));timers.delete(id);fail(action,e.message);}}
    else if(local)setTimeout(()=>{if(id!==active||g!==generation)return;try{receive({id,action,result:local[action](options)});}catch(e){receive({id,action,error:e.message});}},0);
  }
  function chooseData(){
    active=++request;clearSelection();if(!meta)return;const candidate=meta.collections.find(c=>JSON.stringify(c.path)===$('jsonCollection').value);$('headerGroup').hidden=['json','jsonl'].includes(meta.format)&&!candidate?.matrix;status('dataStatus','Reading the selected table…');status('runStatus','Waiting for source data.');status('exportStatus','No output yet.');send('select',{sheet:$('worksheet').value,path:$('jsonCollection').value,hasHeader:$('hasHeader').checked,excelValues:$('excelValues').value});
  }
  function recipe(){return {family:$('family').value,columns:[...selected].sort((a,b)=>a-b),output:$('outputMode').value,errors:$('errorPolicy').value,
    text:{trim:$('textTrim').checked,spaces:$('textSpaces').checked,invisible:$('textInvisible').checked,nfc:$('textNfc').checked,lineEndings:$('textLines').checked,case:$('textCase').value,prefix:$('textPrefix').value,suffix:$('textSuffix').value},
    date:{input:$('dateInput').value,output:$('dateOutput').value,sourceZone:$('sourceZone').value,targetZone:$('targetZone').value},
    number:{inputDecimal:$('inputDecimal').value,inputGroup:$('inputGroup').value,outputDecimal:$('outputDecimal').value,outputGroup:$('outputGroup').value,places:$('places').value,removeCurrency:$('removeCurrency').value,addCurrency:$('addCurrency').value,parentheses:$('parentheses').checked}};}
  function reportHelp(){$('viewHelp').textContent=$('reportView').value==='data'?'Every source row, with the selected replacements or appended cleaned columns.':'Each value that could not be converted, with its source data row and explanation.';}
  function exportReport(){reportHelp();if(!ready)return;clearExport();status('exportStatus','Preparing output…');send('export',{view:$('reportView').value,format:$('outputFormat').value || 'csv',protect:$('protect').checked});}
  function run(){if(!headers.length||!selected.size)return;clearResult();$('run').disabled=true;status('runStatus','Preparing cleanup preview…');status('exportStatus','Processing selected columns…');send('run',recipe());}
  function updateSelected(){$('selectedCount').textContent=`${selected.size} selected`;}
  function receive(message){
    if(message.id!==active)return;if(message.error){fail(message.action,message.error);return;}const r=message.result;
    if(message.action==='load'){
      meta=r;$('sourceControls').disabled=false;$('sheetGroup').hidden=r.format!=='excel';$('jsonGroup').hidden=!['json','jsonl'].includes(r.format);
      $('worksheet').replaceChildren(...r.sheets.map(s=>{const o=node('option',s.name+(s.hidden?' (hidden worksheet)':''));o.value=s.name;return o;}));if(r.sheets.length)$('worksheet').value=r.sheets[0].name;
      const placeholder=node('option','Choose a record collection');placeholder.value='';$('jsonCollection').replaceChildren(placeholder,...r.collections.map(c=>{const o=node('option',c.label);o.value=JSON.stringify(c.path);return o;}));$('jsonCollection').value=r.defaultPath;
      status('loadStatus',`Loaded ${sourceName}. Input format: ${r.format==='excel'?'Excel':r.format.toUpperCase()}.`);chooseData();emit('cleanup_loaded');
    }else if(message.action==='select'){
      headers=r.headers;$('cleanupControls').disabled=false;$('sourceWarnings').replaceChildren(...r.warnings.map(s=>node('li',s)));tableView('sourcePreview',headers,r.preview,'First 5 source rows');
      $('columns').replaceChildren(...headers.map((h,i)=>{const label=node('label',undefined,'check'),cb=node('input');cb.type='checkbox';cb.id=`column-${i}`;cb.addEventListener('change',()=>{if(cb.checked)selected.add(i);else selected.delete(i);updateSelected();invalidate();});label.append(cb,node('span',h));return label;}));
      status('dataStatus',`${r.count.toLocaleString()} ${r.count===1?'row':'rows'} · ${headers.length} columns. Choose the columns to clean.`);status('runStatus','Select columns and a cleanup type, then preview the changes.');
      if(demo){demo=false;selected.add(1);$('column-1').checked=true;updateSelected();$('run').disabled=false;run();}
    }else if(message.action==='run'){
      ready=true;$('run').disabled=false;$('summary').hidden=false;const s=r.summary;
      $('summary').replaceChildren(...[[s.rows,'Source rows'],[s.changed,'Changed cells'],[s.unchanged,'Unchanged cells'],[s.errors,'Values needing attention']].map(([n,label])=>{const card=node('div');card.append(node('strong',n.toLocaleString()),node('span',label));return card;}));
      $('summaryNote').textContent=`${s.columns} ${s.columns===1?'column':'columns'} selected. ${s.blank} blank date/number cells skipped. Every run starts from the loaded source.`;
      tableView('changesPreview',['Data row','Field','Before','After','Outcome'],r.preview,'First 100 changed or failed values','No selected values changed or failed.');$('changesPanel').open=true;
      status('runStatus',`${s.changed.toLocaleString()} cells changed. ${s.errors.toLocaleString()} ${s.errors===1?'value':'values'} could not be converted.`);exportReport();emit('cleanup_completed');
    }else if(message.action==='export'){
      tableView('resultTable',r.headers,r.preview,'First 100 output rows','No data rows in this view. Column headings are still available.');
      if(r.blocked){status('exportStatus',r.blocked,true);return;}
      latest={...r,view:$('reportView').value};$('textPreview').textContent = r.text.slice(0, 30000) + (r.text.length > 30000 ? '\n… Preview truncated; download or copy for the complete output.' : ''); $('download').disabled=$('copy').disabled=false;status('exportStatus',`Ready to download ${r.count.toLocaleString()} ${r.count===1?'row':'rows'}.`);
    }
  }
  function resetOptions(){Object.entries(values).forEach(([id,value])=>{$(id).value=value;});Object.entries(checks).forEach(([id,value])=>{$(id).checked=value;});visibility();}
  function startLoad(input,name,isDemo=false){stop();clearSource();demo=isDemo;sourceName=name;status('loadStatus','Loading replaces the previous source…');status('dataStatus','Reading source data…');status('runStatus','Waiting for source data.');status('exportStatus','No output yet.');try{backend();send('load',input);}catch(e){fail('load',e.message);}}
  $('inputFile').addEventListener('change',async()=>{
    const file=$('inputFile').files[0];$('inputFile').value='';if(!file)return;stop();clearSource();demo=false;const g=generation;status('loadStatus',`Reading ${file.name}…`);status('dataStatus','Reading the selected file…');status('runStatus','Waiting for source data.');status('exportStatus','No output yet.');
    if(file.size>window.DataConverter.LIMITS.bytes){fail('load','Input exceeds 5 MiB.');return;}try{const bytes=await file.arrayBuffer();if(g!==generation)return;$('inputText').value='';startLoad({bytes,name:file.name,format:$('inputFormat').value},file.name);}catch{if(g===generation)fail('load','Could not read that file.');}
  });
  $('loadText').addEventListener('click',()=>startLoad({text:$('inputText').value,format:$('inputFormat').value},'pasted text'));
  function sourceEdited(){stop();clearSource();demo=false;status('loadStatus','Source changed. Load the pasted text or choose the file again.');status('dataStatus','Load the updated source to choose columns.');status('runStatus','No cleanup is available.');status('exportStatus','No output available.');}
  $('inputText').addEventListener('input',sourceEdited);$('inputFormat').addEventListener('change',sourceEdited);
  ['worksheet','jsonCollection','hasHeader','excelValues'].forEach(id=>$(id).addEventListener('change',()=>{demo=false;chooseData();}));
  Object.keys(values).forEach(id=>$(id).addEventListener(['textPrefix','textSuffix','sourceZone','targetZone','removeCurrency','addCurrency'].includes(id)?'input':'change',invalidate));Object.keys(checks).forEach(id=>$(id).addEventListener('change',invalidate));
  for(const [id,include]of [['selectAll',true],['selectNone',false]])$(id).addEventListener('click',()=>{selected=new Set(include?headers.map((_,i)=>i):[]);headers.forEach((_,i)=>{$(`column-${i}`).checked=include;});updateSelected();invalidate();});
  ['reportView','protect','outputFormat'].forEach(id=>$(id).addEventListener('change',exportReport));$('run').addEventListener('click',run);
  $('example').addEventListener('click',()=>{
    const family=$('family').value;resetOptions();$('family').value=family;$('inputFormat').value='csv';$('hasHeader').checked=true;let text;
    if(family==='date'){text='id,when\n001,01/02/2026\n002,31/12/2026\n003,29/02/2026';$('dateInput').value='dmy';}
    else if(family==='number'){text='id,amount\n001,"(£1,234.505)"\n002,"£9,007,199,254,740,993.005"\n003,"£12,34"';$('removeCurrency').value='£';$('places').value='2';}
    else{text='id,name\n001," REF-  ALICE\u00a0  SMITH "\n002,"REF-Bob\u200b  JONES"';$('textPrefix').value='REF-';$('textCase').value='lower';$('textSpaces').checked=$('textInvisible').checked=true;}
    visibility();$('inputText').value=text;startLoad({text,format:'csv'},`${family} example`,true);
  });
  $('reset').addEventListener('click',()=>{stop();clearSource();demo=false;resetOptions();$('inputText').value=$('inputFile').value='';$('inputFormat').value='auto';$('excelValues').value='display';$('hasHeader').checked=$('protect').checked=true;$('reportView').value='data';['pastePanel','sourcePreviewPanel','changesPanel'].forEach(id=>{$(id).open=false;});reportHelp();status('loadStatus','All data and settings cleared.');status('dataStatus','Load data to choose columns.');status('runStatus','Load data and choose columns to begin.');status('exportStatus','Preview cleanup to create an output.');emit('cleanup_cleared');});
  $('copy').addEventListener('click',async()=>{if(!latest)return;const result=latest;try{await navigator.clipboard.writeText(result.text);if(latest===result)status('exportStatus','Output copied to clipboard.');emit('cleanup_copied');}catch{if(latest===result)status('exportStatus','Copy failed. Download the output instead.',true);}});
  $('download').addEventListener('click',()=>{if(!latest)return;const a=node('a'),url=URL.createObjectURL(new Blob([latest.text],{type:latest.mime}));a.href=url;a.download=`${latest.view==='data'?'cleaned-data':'cleanup-exceptions'}.${latest.extension}`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status('exportStatus','Download started.');emit('cleanup_downloaded');});
  window.addEventListener('pagehide',stop);resetOptions();reportHelp();emit('tool_opened');
})();
