(function () {
  'use strict';
  const M = window.DataQuality, $ = id => document.getElementById(id);
  let worker = null, local = null, generation = 0, request = 0, active = 0, meta = null, headers = [], rules = [], keys = new Set(), reportReady = false, latest = null, sourceName = '', examplePending = false;
  const timers = new Map();
  function emit(name) { try { window.DataTransformEvents?.emit(name,{},'data-quality-checker'); } catch {} }
  function node(tag,text,className) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; }
  function status(id,text,error=false) { $(id).textContent = text; $(id).classList.toggle('error',error); }
  function stop() { generation++; active = ++request; timers.forEach(clearTimeout); timers.clear(); worker?.terminate(); worker = local = null; }
  function clearExport() { latest = null; $('textPreview').textContent = ''; $('copy').disabled = $('download').disabled = true; $('resultTable').replaceChildren(node('p','No report available.','empty')); }
  function clearReport() { reportReady = false; clearExport(); $('summary').hidden = true; $('summary').replaceChildren(); $('summaryNote').textContent = ''; }
  function clearSelection() {
    headers = []; rules = []; keys = new Set(); clearReport(); $('run').disabled = $('checkControls').disabled = true;
    $('rules').replaceChildren(); $('keyColumns').replaceChildren(); $('sourceWarnings').replaceChildren(); $('sourcePreview').replaceChildren(node('p','No data loaded.','empty'));
  }
  function clearSource() { meta = null; clearSelection(); $('sourceControls').disabled = true; $('sheetGroup').hidden = $('jsonGroup').hidden = true; $('headerGroup').hidden = false; $('worksheet').replaceChildren(); $('jsonCollection').replaceChildren(); }
  function invalidate() {
    active = ++request; clearReport(); $('run').disabled = !headers.length;
    status('checkStatus','Checks changed. Select Check data to run them.'); status('exportStatus','Run the current checks before exporting.');
  }
  function tableView(target, names, rows, caption) {
    const table = node('table'), head = node('thead'), body = node('tbody'), tr = node('tr');
    names.forEach(name => { const th = node('th',name); th.scope = 'col'; tr.append(th); }); head.append(tr);
    rows.forEach(row => { const tr = node('tr'); row.forEach(v => tr.append(node('td',v))); body.append(tr); });
    table.append(node('caption',caption,'sr-only'),head,body); $(target).replaceChildren(table);
    if (!rows.length) $(target).append(node('p','No rows in this view. You can still download the column headings.','empty'));
  }
  function fail(action,message) {
    if (action === 'load') { clearSource(); status('loadStatus',message+' No data is loaded.',true); status('dataStatus','Correct the input or choose another file.'); }
    if (action === 'select') { clearSelection(); status('dataStatus',message,true); }
    if (action !== 'export') { clearReport(); $('run').disabled = !headers.length; status('checkStatus',message,true); }
    else clearExport();
    status('exportStatus',message,true); emit('quality_failed');
  }
  function backend() {
    const g = generation;
    if (location.protocol === 'file:') { local = M.session(window.XLSX); return; }
    if (!window.Worker) throw new Error('This browser cannot start background checks. Try a current browser.');
    worker = new Worker('checker-worker.js');
    worker.onmessage = event => {
      if (g !== generation) return;
      clearTimeout(timers.get(event.data.id)); timers.delete(event.data.id);
      if (event.data.id === active) receive(event.data);
    };
    worker.onerror = () => { if (g !== generation) return; stop(); clearSource(); status('loadStatus','Background processing stopped. Load the file again or choose a smaller file.',true); status('checkStatus','No checks are available.'); status('exportStatus','No report available.',true); emit('quality_failed'); };
  }
  function send(action,options) {
    const id = active = ++request, g = generation;
    if (worker) {
      timers.set(id,setTimeout(() => {
        if (g !== generation) return; stop(); clearSource(); status('loadStatus','Processing exceeded 20 seconds. Load a smaller file.',true); status('checkStatus','Processing cancelled.'); status('exportStatus','No report available.',true); emit('quality_failed');
      },20000));
      try { worker.postMessage({id,action,options},options.bytes ? [options.bytes] : []); }
      catch (err) { clearTimeout(timers.get(id)); timers.delete(id); fail(action,err.message); }
    } else if (local) setTimeout(() => { if (g !== generation || id !== active) return; try { receive({id,action,result:local[action](options)}); } catch (err) { receive({id,action,error:err.message}); } },0);
  }
  function options() { return {sheet:$('worksheet').value,path:$('jsonCollection').value,hasHeader:$('hasHeader').checked,excelValues:$('excelValues').value}; }
  function chooseData() {
    active = ++request; clearSelection(); if (!meta) return;
    const candidate = meta.collections.find(c => JSON.stringify(c.path) === $('jsonCollection').value);
    $('headerGroup').hidden = ['json','jsonl'].includes(meta.format) && !candidate?.matrix;
    status('dataStatus','Reading the selected table…'); status('checkStatus','Waiting for the source data.'); status('exportStatus','No report yet.'); send('select',options());
  }
  function select(id,labelText,choices,value,change) {
    const group = node('div'), label = node('label',labelText), input = node('select',undefined,'control'); label.htmlFor = id; input.id = id;
    choices.forEach(([v,text]) => { const o = node('option',text); o.value = String(v); input.append(o); }); input.value = String(value);
    input.addEventListener('change',() => change(input.value)); group.append(label,input); return group;
  }
  function renderRules(focusIndex,focusType='column') {
    $('rules').replaceChildren(...rules.map((rule,i) => {
      const card = node('div',undefined,'check-rule'), main = node('div',undefined,'rule-main'); card.setAttribute('role','group'); card.setAttribute('aria-label',`Column check ${i+1}`);
      const col = select(`rule-column-${i}`,`Check ${i+1} · Column`,[['','Choose a column'],...headers.map((h,c) => [c,h])],rule.column,v => { rule.column = v === '' ? '' : Number(v); invalidate(); });
      const required = node('label',undefined,'check'), cb = node('input'); cb.type = 'checkbox'; cb.checked = rule.required; cb.id = `rule-required-${i}`; cb.addEventListener('change',() => { rule.required = cb.checked; invalidate(); }); required.append(cb,node('span','A value is required')); col.append(required);
      const type = select(`rule-type-${i}`,'Expected value format',[['none','Any value'],['number','Number'],['date','Date'],['category','Allowed categories']],rule.type,v => { rule.type = v; renderRules(i,'type'); invalidate(); });
      const remove = node('button','Remove','button small'); remove.type = 'button'; remove.setAttribute('aria-label',`Remove column check ${i+1}`); remove.addEventListener('click',() => { rules.splice(i,1); renderRules(); invalidate(); $('addRule').focus(); });
      main.append(col,type,remove); card.append(main);
      const extra = node('div',undefined,'rule-extra');
      if (rule.type === 'number') {
        const grid = node('div',undefined,'form-grid'); grid.append(select(`rule-style-${i}`,'Number style',[['decimal','Decimal number'],['integer','Whole number']],rule.numberStyle,v => { rule.numberStyle = v; renderRules(i,'style'); invalidate(); }));
        if (rule.numberStyle === 'decimal') grid.append(select(`rule-decimal-${i}`,'Decimal separator',[['dot','Point · 1234.56'],['comma','Comma · 1234,56']],rule.decimal,v => { rule.decimal = v; invalidate(); }));
        extra.append(grid,node('p','Thousands separators and currency symbols are not accepted.','hint'));
      } else if (rule.type === 'date') extra.append(select(`rule-date-${i}`,'Date format',[['ymd','Year-month-day · 2026-10-17'],['dmy','Day/month/year · 17/10/2026'],['mdy','Month/day/year · 10/17/2026']],rule.dateFormat,v => { rule.dateFormat = v; invalidate(); }));
      else if (rule.type === 'category') {
        const label = node('label','Allowed values (one per line)'), input = node('textarea',undefined,'control'); input.id = `rule-allowed-${i}`; label.htmlFor = input.id; input.value = rule.allowed; input.maxLength = 20000; input.spellcheck = false; input.addEventListener('input',() => { rule.allowed = input.value; invalidate(); }); extra.append(label,input);
      }
      if (rule.type !== 'none') card.append(extra); return card;
    }));
    $('addRule').disabled = rules.length >= Math.min(100,headers.length);
    if (focusIndex !== undefined) $(`rule-${focusType}-${focusIndex}`).focus();
  }
  function reportHelp() {
    $('viewHelp').textContent = {issues:'One row per issue, with a data row number, field, original value and explanation.',rows:'Each flagged source row appears once, with its data row number and issue summary. Source values are preserved.',profile:'Blank counts, distinct nonblank values and up to three examples for every column. Blank counts alone are not issues.'}[$('reportView').value];
  }
  function exportReport() {
    reportHelp(); if (!reportReady) return;
    clearExport(); status('exportStatus','Preparing the selected report…'); send('export',{view:$('reportView').value,format:$('outputFormat').value || 'csv',protect:$('protect').checked});
  }
  function run() {
    if (!headers.length) return; clearReport(); $('run').disabled = true; status('checkStatus','Checking data…'); status('exportStatus','Checking data…');
    send('check',{rules:rules.map(r => ({...r})),keys:[...keys],duplicateRows:$('duplicateRows').checked,trim:$('trim').checked,ignoreCase:$('ignoreCase').checked});
  }
  function receive(message) {
    if (message.id !== active) return; if (message.error) { fail(message.action,message.error); return; }
    const r = message.result;
    if (message.action === 'load') {
      meta = r; $('sourceControls').disabled = false; $('sheetGroup').hidden = r.format !== 'excel'; $('jsonGroup').hidden = !['json','jsonl'].includes(r.format);
      $('worksheet').replaceChildren(...r.sheets.map(s => { const o = node('option',s.name+(s.hidden ? ' (hidden worksheet)' : '')); o.value = s.name; return o; })); if (r.sheets.length) $('worksheet').value = r.sheets[0].name;
      const placeholder = node('option','Choose a record collection'); placeholder.value = ''; $('jsonCollection').replaceChildren(placeholder,...r.collections.map(c => { const o = node('option',c.label); o.value = JSON.stringify(c.path); return o; })); $('jsonCollection').value = r.defaultPath;
      status('loadStatus',`Loaded ${sourceName}. Input format: ${r.format === 'excel' ? 'Excel' : r.format.toUpperCase()}.`); chooseData(); emit('quality_loaded');
    } else if (message.action === 'select') {
      headers = r.headers; $('checkControls').disabled = $('run').disabled = false; $('sourceWarnings').replaceChildren(...r.warnings.map(s => node('li',s)));
      tableView('sourcePreview',headers,r.preview,'First 5 source data rows');
      $('keyColumns').replaceChildren(...headers.map((h,i) => { const label = node('label',undefined,'check'), cb = node('input'); cb.type = 'checkbox'; cb.id = `key-${i}`; cb.addEventListener('change',() => { if (cb.checked) keys.add(i); else keys.delete(i); invalidate(); }); label.append(cb,node('span',h)); return label; }));
      renderRules(); status('dataStatus',`${r.count.toLocaleString()} ${r.count === 1 ? 'row' : 'rows'} · ${headers.length} ${headers.length === 1 ? 'column' : 'columns'}. Source selections reset column checks.`); status('checkStatus','Choose your checks, then select Check data.');
      if (examplePending) {
        examplePending = false; keys.add(0); $('key-0').checked = true;
        rules = [newRule(1),{...newRule(2),type:'date'},{...newRule(3),type:'number'},{...newRule(4),type:'category',allowed:'Active\nPending'}]; renderRules(); run();
      }
    } else if (message.action === 'check') {
      reportReady = true; $('run').disabled = false; $('summary').hidden = false;
      $('summary').replaceChildren(...[[r.rows,'Data rows checked'],[r.affected,'Rows needing attention'],[r.issues,'Issues found'],[r.unflagged,'Rows without flags']].map(([n,label]) => { const card = node('div'); card.append(node('strong',n.toLocaleString()),node('span',label)); return card; }));
      $('summaryNote').textContent = `${r.columnChecks} ${r.columnChecks === 1 ? 'column check' : 'column checks'} · ${r.keyColumns} ${r.keyColumns === 1 ? 'key column' : 'key columns'} · whole-row duplicates ${r.duplicateRows ? 'on' : 'off'}. Duplicate groups: ${r.duplicateRowGroups} whole-row, ${r.duplicateKeyGroups} key. Blank counts are available in Column overview.`;
      status('checkStatus',`${r.affected.toLocaleString()} of ${r.rows.toLocaleString()} data rows flagged by the selected checks.`); exportReport(); emit('quality_checked');
    } else if (message.action === 'export') {
      latest = {...r,view:$('reportView').value}; tableView('resultTable',r.headers,r.preview,'First 100 report rows'); $('textPreview').textContent = r.text.slice(0, 30000) + (r.text.length > 30000 ? '\n… Preview truncated; download or copy for the complete output.' : ''); $('download').disabled = $('copy').disabled = false;
      status('exportStatus',`Ready to download ${r.count.toLocaleString()} ${r.count === 1 ? 'report row' : 'report rows'}.`);
    }
  }
  function newRule(column='') { return {column,required:true,type:'none',numberStyle:'decimal',decimal:'dot',dateFormat:'ymd',allowed:''}; }
  function startLoad(input,name,demo=false) {
    stop(); clearSource(); examplePending = demo; sourceName = name;
    $('duplicateRows').checked = $('trim').checked = true; $('ignoreCase').checked = false;
    status('loadStatus','Loading replaces the previous data…'); status('dataStatus','Reading source data…'); status('checkStatus','Waiting for source data.'); status('exportStatus','No report yet.');
    try { backend(); send('load',input); } catch (err) { fail('load',err.message); }
  }
  $('inputFile').addEventListener('change',async () => {
    const file = $('inputFile').files[0]; $('inputFile').value = ''; if (!file) return;
    stop(); clearSource(); examplePending = false; const g = generation; status('loadStatus',`Reading ${file.name}…`); status('dataStatus','Reading the selected file…'); status('checkStatus','Reading source data…'); status('exportStatus','No report yet.');
    if (file.size > window.DataConverter.LIMITS.bytes) { fail('load','Input exceeds 5 MiB.'); return; }
    try { const bytes = await file.arrayBuffer(); if (g !== generation) return; $('inputText').value = ''; startLoad({bytes,name:file.name,format:$('inputFormat').value},file.name); }
    catch { if (g === generation) fail('load','Could not read that file. Choose it again.'); }
  });
  $('loadText').addEventListener('click',() => startLoad({text:$('inputText').value,format:$('inputFormat').value},'pasted text'));
  function sourceEdited() { stop(); clearSource(); examplePending = false; status('loadStatus','Source changed. Load the pasted text or choose the file again.'); status('dataStatus','Load the updated source to choose data.'); status('checkStatus','Load the updated source before checking.'); status('exportStatus','No report available.'); }
  $('inputText').addEventListener('input',sourceEdited); $('inputFormat').addEventListener('change',sourceEdited);
  ['worksheet','jsonCollection','hasHeader','excelValues'].forEach(id => $(id).addEventListener('change',() => { examplePending = false; chooseData(); }));
  ['duplicateRows','trim','ignoreCase'].forEach(id => $(id).addEventListener('change',invalidate));
  ['reportView','protect','outputFormat'].forEach(id => $(id).addEventListener('change',exportReport));
  $('addRule').addEventListener('click',() => { if (rules.length >= Math.min(100,headers.length)) return; rules.push(newRule()); renderRules(rules.length-1); invalidate(); }); $('run').addEventListener('click',run);
  $('example').addEventListener('click',() => {
    const text = 'id,name,start_date,amount,status\n001,Asha,2026-10-17,12.50,Active\n002,,2026-02-30,twelve,Pending\n001,Chris,17/10/2026,8.00,Unknown\n,Dev,2026-10-18,3.20,Active\n002,,2026-02-30,twelve,Pending\n003,Eve,2026-10-20,9.25,Active\n004,Finn,2026-10-21,4.00,Active,extra cell';
    $('inputText').value = text; $('inputFormat').value = 'csv'; $('hasHeader').checked = true; startLoad({text,format:'csv'},'example records',true);
  });
  $('reset').addEventListener('click',() => {
    stop(); clearSource(); examplePending = false; $('inputText').value = $('inputFile').value = ''; $('inputFormat').value = 'auto'; $('excelValues').value = 'display'; $('hasHeader').checked = $('duplicateRows').checked = $('trim').checked = $('protect').checked = true; $('ignoreCase').checked = false; $('reportView').value = 'issues';
    ['pastePanel','sourcePreviewPanel','keyPanel'].forEach(id => { $(id).open = false; }); reportHelp(); status('loadStatus','All data and checks cleared.'); status('dataStatus','Load data to choose checks.'); status('checkStatus','Load data before running checks.'); status('exportStatus','Run checks to create a report.'); emit('quality_cleared');
  });
  $('copy').addEventListener('click',async () => {
    if (!latest) return; const result = latest;
    try { await navigator.clipboard.writeText(result.text); if (latest === result) status('exportStatus','Output copied to clipboard.'); emit('quality_copied'); }
    catch { if (latest === result) status('exportStatus','Copy failed. Download the output instead.',true); }
  });
  $('download').addEventListener('click',() => {
    if (!latest) return; const a = node('a'), url = URL.createObjectURL(new Blob([latest.text],{type:latest.mime})); a.href = url; a.download = `data-quality-${latest.view}.${latest.extension}`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),1000); status('exportStatus','Download started.'); emit('quality_downloaded');
  });
  window.addEventListener('pagehide',stop); reportHelp(); emit('tool_opened');
})();
