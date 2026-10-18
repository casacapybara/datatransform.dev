(function(){
  'use strict';
  const M=window.TableReshaper,$=id=>document.getElementById(id),timers=new Map();
  let worker=null,local=null,generation=0,request=0,active=0,meta=null,headers=[],selected=new Set(),ready=false,latest=null,sourceName='',demo=false;
  let task='summary',groups=new Set();
  function emit(name){try{window.DataTransformEvents?.emit(name,{},'summarise-reshape');}catch{}}
  function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
  function status(id,text,error=false){$(id).textContent=text;$(id).classList.toggle('error',error);}
  function stop(){generation++;active=++request;timers.forEach(clearTimeout);timers.clear();worker?.terminate();worker=local=null;}
  function clearExport(){latest=null; $('textPreview').textContent = '';$('download').disabled=$('copy').disabled=true;$('resultTable').replaceChildren(node('p','No output available.','empty'));}
  function clearResult(){ready=false;clearExport();$('summary').hidden=true;$('summary').replaceChildren();$('summaryNote').textContent='';}
  function clearSelection(){headers=[];selected=new Set();groups=new Set();clearResult();$('columns').replaceChildren();$('groups').replaceChildren();$('run').disabled=$('reshapingControls').disabled=true;$('sourceWarnings').replaceChildren();$('sourcePreview').replaceChildren(node('p','No data loaded.','empty'));}
  function clearSource(){meta=null;clearSelection();$('sourceControls').disabled=true;$('sheetGroup').hidden=$('jsonGroup').hidden=true;$('headerGroup').hidden=false;$('worksheet').replaceChildren();$('jsonCollection').replaceChildren();}
  function visibility(){
    const summary=task==='summary',pivot=task==='pivot',unpivot=task==='unpivot',expand=task==='expand';
    $('groupOptions').hidden=!(summary||pivot);$('unpivotOptions').hidden=!unpivot;$('pivotOptions').hidden=!pivot;$('aggregateOptions').hidden=!(summary||pivot);$('valueOptions').hidden=unpivot||summary&&$('aggregate').value==='count'||pivot&&$('aggregate').value==='count';$('resultNameGroup').hidden=!summary;$('summaryOptions').hidden=!summary;$('expandOptions').hidden=!expand;$('blankOptions').hidden=!(unpivot||expand);$('blockOption').hidden=!pivot;
    $('taskHelp').textContent=pivot?'Choose distinct identifying, heading and value columns. Repeated combinations require a calculation.':summary?'Numbers use a decimal point without currency or thousands separators. Blank numeric cells are skipped.':'';
  }
  function invalidate(){active=++request;clearResult();visibility();$('run').disabled=!headers.length;status('runStatus','Settings changed. Select Preview new table to run them.');status('exportStatus','Preview the current settings before exporting.');}
  function tableView(id,names,rows,caption,empty='No rows in this view.'){
    const table=node('table'),head=node('thead'),body=node('tbody'),tr=node('tr');names.forEach(h=>{const th=node('th',h);th.scope='col';tr.append(th);});head.append(tr);rows.forEach(row=>{const tr=node('tr');row.forEach(v=>tr.append(node('td',v)));body.append(tr);});table.append(node('caption',caption,'sr-only'),head,body);$(id).replaceChildren(table);if(!rows.length)$(id).append(node('p',empty,'empty'));
  }
  function fail(action,message){
    if(action==='load'){clearSource();status('loadStatus',message+' No data is loaded.',true);status('dataStatus','Choose another file or correct the source.');}
    if(action==='select'){clearSelection();status('dataStatus',message,true);}
    if(action!=='export'){clearResult();$('run').disabled=!headers.length;status('runStatus',message,true);}else clearExport();
    status('exportStatus',message,true);emit('reshape_failed');
  }
  function backend(){
    const g=generation;if(location.protocol==='file:'){local=M.session(window.XLSX);return;}
    if(!window.Worker)throw new Error('This browser cannot start background reshaping. Try a current browser.');
    worker=new Worker('reshape-worker.js');worker.onmessage=event=>{if(g!==generation)return;clearTimeout(timers.get(event.data.id));timers.delete(event.data.id);if(event.data.id===active)receive(event.data);};
    worker.onerror=()=>{if(g!==generation)return;stop();clearSource();status('loadStatus','Background processing stopped. Load the data again or use a smaller file.',true);status('runStatus','No reshaping is available.');status('exportStatus','No output available.',true);emit('reshape_failed');};
  }
  function send(action,options){
    const id=active=++request,g=generation;
    if(worker){timers.set(id,setTimeout(()=>{if(g!==generation)return;stop();clearSource();status('loadStatus','Processing exceeded 20 seconds. Load a smaller file.',true);status('runStatus','Reshaping cancelled.');status('exportStatus','No output available.',true);emit('reshape_failed');},20000));try{worker.postMessage({id,action,options},options.bytes?[options.bytes]:[]);}catch(e){clearTimeout(timers.get(id));timers.delete(id);fail(action,e.message);}}
    else if(local)setTimeout(()=>{if(id!==active||g!==generation)return;try{receive({id,action,result:local[action](options)});}catch(e){receive({id,action,error:e.message});}},0);
  }
  function chooseData(){
    active=++request;clearSelection();if(!meta)return;const candidate=meta.collections.find(c=>JSON.stringify(c.path)===$('jsonCollection').value);$('headerGroup').hidden=['json','jsonl'].includes(meta.format)&&!candidate?.matrix;status('dataStatus','Reading the selected table…');status('runStatus','Waiting for source data.');status('exportStatus','No output yet.');send('select',{sheet:$('worksheet').value,path:$('jsonCollection').value,hasHeader:$('hasHeader').checked,excelValues:$('excelValues').value});
  }
  function recipe(){return {task,groups:[...groups].sort((a,b)=>a-b),columns:[...selected].sort((a,b)=>a-b),value:Number($('valueField').value),pivot:Number($('pivotColumn').value),aggregate:$('aggregate').value,resultName:$('resultName').value,nameColumn:$('nameColumn').value,valueColumn:$('valueColumn').value,totals:$('totals').checked,delimiter:$('delimiter').value,trim:$('trimParts').checked,skipBlank:$('skipBlank').checked};}
  function exportReport(){if(!ready)return;clearExport();status('exportStatus','Preparing output…');send('export',{format:$('outputFormat').value||'csv',protect:$('protect').checked});}
  function run(){if(!headers.length)return;clearResult();$('run').disabled=true;status('runStatus','Preparing the new table…');status('exportStatus','Processing source data…');send('run',recipe());}
  function picker(id,set){$(id).replaceChildren(...headers.map((h,i)=>{const label=node('label',undefined,'check'),cb=node('input');cb.type='checkbox';cb.id=`${id}-${i}`;cb.addEventListener('change',()=>{if(cb.checked)set.add(i);else set.delete(i);invalidate();});label.append(cb,node('span',h));return label;}));}
  function receive(message){
    if(message.id!==active)return;if(message.error){fail(message.action,message.error);return;}const r=message.result;
    if(message.action==='load'){
      meta=r;$('sourceControls').disabled=false;$('sheetGroup').hidden=r.format!=='excel';$('jsonGroup').hidden=!['json','jsonl'].includes(r.format);
      $('worksheet').replaceChildren(...r.sheets.map(s=>{const o=node('option',s.name+(s.hidden?' (hidden worksheet)':''));o.value=s.name;return o;}));if(r.sheets.length)$('worksheet').value=r.sheets[0].name;
      const placeholder=node('option','Choose a record collection');placeholder.value='';$('jsonCollection').replaceChildren(placeholder,...r.collections.map(c=>{const o=node('option',c.label);o.value=JSON.stringify(c.path);return o;}));$('jsonCollection').value=r.defaultPath;
      status('loadStatus',`Loaded ${sourceName}. Input format: ${r.format==='excel'?'Excel':r.format.toUpperCase()}.`);chooseData();emit('reshape_loaded');
    }else if(message.action==='select'){
      headers=r.headers;$('reshapingControls').disabled=false;$('sourceWarnings').replaceChildren(...r.warnings.map(s=>node('li',s)));tableView('sourcePreview',headers,r.preview,'First 5 source rows');
      picker('columns',selected);picker('groups',groups);
      for(const id of ['valueField','pivotColumn'])$(id).replaceChildren(...headers.map((h,i)=>{const option=node('option',h);option.value=String(i);return option;}));
      $('valueField').value=String(Math.max(0,headers.length-1));$('pivotColumn').value=String(Math.min(1,headers.length-1));
      status('dataStatus',`${r.count.toLocaleString()} rows · ${headers.length} columns.`);invalidate();
      if(demo){demo=false;if(task==='unpivot'){for(let i=1;i<headers.length;i++){selected.add(i);$('columns-'+i).checked=true;}}else if(task==='summary'||task==='pivot'){groups.add(0);$('groups-0').checked=true;}else $('valueField').value='1';run();}
    }else if(message.action==='run'){
      ready=true;$('run').disabled=false;$('summary').hidden=false;const s=r.summary;
      $('summary').replaceChildren(...[[s.sourceRows,'Source rows'],[s.sourceColumns,'Source columns'],[s.rows,'Output rows'],[s.columns,'Output columns']].map(([n,label])=>{const card=node('div');card.append(node('strong',n.toLocaleString()),node('span',label));return card;}));
      $('summaryNote').textContent='Every run starts from the loaded source. Preview and export reflect the current settings.';
      status('runStatus',`New table: ${s.rows.toLocaleString()} rows · ${s.columns} columns.`);exportReport();emit('reshape_completed');
    }else if(message.action==='export'){
      tableView('resultTable',r.headers,r.preview,'First 100 output rows','No data rows in this view. Column headings are still available.');
      if(r.blocked){status('exportStatus',r.blocked,true);return;}
      latest=r;$('textPreview').textContent = r.text.slice(0, 30000) + (r.text.length > 30000 ? '\n… Preview truncated; download or copy for the complete output.' : ''); $('download').disabled=$('copy').disabled=false;status('exportStatus',`Ready to download ${r.count.toLocaleString()} ${r.count===1?'row':'rows'}.`);
    }
  }
  function resetOptions(){for(const [id,value]of Object.entries({aggregate:task==='pivot'?'block':'count',resultName:'Result',nameColumn:'Field',valueColumn:'Value',delimiter:';',outputFormat:'csv'}))$(id).value=value;$('trimParts').checked=true;$('totals').checked=$('skipBlank').checked=false;visibility();}
  function startLoad(input,name,isDemo=false){stop();clearSource();demo=isDemo;sourceName=name;status('loadStatus','Loading replaces the previous source…');status('dataStatus','Reading source data…');status('runStatus','Waiting for source data.');status('exportStatus','No output yet.');try{backend();send('load',input);}catch(e){fail('load',e.message);}}
  $('inputFile').addEventListener('change',async()=>{
    const file=$('inputFile').files[0];$('inputFile').value='';if(!file)return;stop();clearSource();demo=false;const g=generation;status('loadStatus',`Reading ${file.name}…`);status('dataStatus','Reading the selected file…');status('runStatus','Waiting for source data.');status('exportStatus','No output yet.');
    if(file.size>window.DataConverter.LIMITS.bytes){fail('load','Input exceeds 5 MiB.');return;}try{const bytes=await file.arrayBuffer();if(g!==generation)return;$('inputText').value='';startLoad({bytes,name:file.name,format:$('inputFormat').value},file.name);}catch{if(g===generation)fail('load','Could not read that file.');}
  });
  $('loadText').addEventListener('click',()=>startLoad({text:$('inputText').value,format:$('inputFormat').value},'pasted text'));
  function sourceEdited(){stop();clearSource();demo=false;status('loadStatus','Source changed. Load the pasted text or choose the file again.');status('dataStatus','Load the updated source to choose columns.');status('runStatus','No reshaping is available.');status('exportStatus','No output available.');}
  $('inputText').addEventListener('input',sourceEdited);$('inputFormat').addEventListener('change',sourceEdited);
  ['worksheet','jsonCollection','hasHeader','excelValues'].forEach(id=>$(id).addEventListener('change',()=>{demo=false;chooseData();}));
  for(const id of ['valueField','pivotColumn','aggregate','totals','trimParts','skipBlank'])$(id).addEventListener('change',invalidate);
  for(const id of ['resultName','nameColumn','valueColumn','delimiter'])$(id).addEventListener('input',invalidate);
  ['protect','outputFormat'].forEach(id=>$(id).addEventListener('change',exportReport));$('run').addEventListener('click',run);
  for(const name of M.TASKS)$('task-'+name).addEventListener('click',()=>{task=name;for(const n of M.TASKS)$('task-'+n).setAttribute('aria-pressed',String(n===task));$('aggregate').value=task==='pivot'?'block':'count';invalidate();});
  $('example').addEventListener('click',()=>{resetOptions();$('inputFormat').value='csv';$('hasHeader').checked=true;let text;
    if(task==='unpivot')text='Team,January,February\nNorth,12,18\nSouth,9,15';
    else if(task==='expand')text='ID,Tags,Owner\n001,planning; review,Asha\n002,review; release,Ben';
    else {text='Team,Month,Sales\nNorth,January,12.50\nNorth,February,18.25\nSouth,January,9.00\nSouth,February,15.75';$('aggregate').value=task==='pivot'?'block':'sum';}
    visibility();$('inputText').value=text;startLoad({text,format:'csv'},'fictional example',true);
  });
  $('reset').addEventListener('click',()=>{stop();clearSource();demo=false;resetOptions();$('inputText').value=$('inputFile').value='';$('inputFormat').value='auto';$('excelValues').value='display';$('hasHeader').checked=$('protect').checked=true;['pastePanel','sourcePreviewPanel'].forEach(id=>{$(id).open=false;});status('loadStatus','All data and settings cleared.');status('dataStatus','Load data to choose columns.');status('runStatus','Load data and choose columns to begin.');status('exportStatus','Preview reshaping to create an output.');emit('reshape_cleared');});
  $('copy').addEventListener('click',async()=>{if(!latest)return;const result=latest;try{await navigator.clipboard.writeText(result.text);if(latest===result)status('exportStatus','Output copied to clipboard.');emit('reshape_copied');}catch{if(latest===result)status('exportStatus','Copy failed. Download the output instead.',true);}});
  $('download').addEventListener('click',()=>{if(!latest)return;const a=node('a'),url=URL.createObjectURL(new Blob([latest.text],{type:latest.mime}));a.href=url;a.download=`reshaped-table.${latest.extension}`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status('exportStatus','Download started.');emit('reshape_downloaded');});
  window.addEventListener('pagehide',stop);resetOptions();emit('tool_opened');
})();
