(function () {
  'use strict';
  const M = window.DataConverter, $ = id => document.getElementById(id);
  let worker = null, local = null, timer = null, debounce = null, generation = 0, request = 0, active = 0, meta = null, fields = [], selected = new Set(), latest = null, sourceName = 'converted-data';
  function emit(name) { try { window.DataTransformEvents?.emit(name, {}, 'data-file-converter'); } catch {} }
  function node(tag, text, className) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; }
  function status(id, text, error = false) { $(id).textContent = text; $(id).classList.toggle('error', error); }
  function notes(id, messages = []) { $(id).replaceChildren(...messages.map(s => node('li', s))); }
  function clearOutput() {
    latest = null; $('download').disabled = $('copy').disabled = true; $('textPreview').textContent = '';
    $('outputCount').textContent = 'No result yet'; $('tablePreview').replaceChildren(node('p', 'No result available.', 'empty')); notes('outputWarnings');
  }
  function stop() { generation++; active = ++request; clearTimeout(timer); clearTimeout(debounce); worker?.terminate(); worker = local = null; }
  function clearSource() {
    meta = null; fields = []; selected.clear(); $('selectionControls').disabled = true;
    $('fields').replaceChildren(); $('worksheet').replaceChildren(); $('jsonCollection').replaceChildren(); $('fieldCount').textContent = '';
    $('sheetGroup').hidden = $('jsonGroup').hidden = true; $('headerGroup').hidden = false; notes('sourceWarnings'); clearOutput();
  }
  function fail(action, message) {
    clearOutput();
    if (action === 'load') { clearSource(); status('loadStatus', message + ' No data is loaded.', true); status('dataStatus', 'Load another file or correct the pasted text.'); }
    else if (action === 'select') { fields = []; selected.clear(); $('fields').replaceChildren(); $('fieldCount').textContent = ''; notes('sourceWarnings'); status('dataStatus', message, true); }
    status('exportStatus', action === 'export' ? message : 'Resolve the source data above before exporting.', true); emit('conversion_failed');
  }
  function backend() {
    const currentGeneration = generation;
    if (location.protocol !== 'file:') {
      if (!window.Worker) throw new Error('This browser cannot start background processing. Try a current browser.');
      worker = new Worker('converter-worker.js');
      worker.onmessage = event => { if (generation !== currentGeneration || event.data.id !== active) return; clearTimeout(timer); receive(event.data); };
      worker.onerror = () => { if (generation !== currentGeneration) return; stop(); clearSource(); status('loadStatus', 'Background processing stopped. Reload the data or try a smaller file.', true); status('exportStatus', 'No result available.', true); emit('conversion_failed'); };
      $('processingNote').textContent = 'Conversions run on your device. Clear all data cancels processing.';
    } else {
      local = M.engine(window.XLSX); $('processingNote').textContent = 'Local-file mode: larger conversions may briefly pause this page.';
    }
  }
  function send(action, options) {
    clearTimeout(timer); active = ++request; const id = active, g = generation;
    status('exportStatus', action === 'load' ? 'Reading data…' : 'Preparing the conversion…');
    if (worker) {
      timer = setTimeout(() => { if (id !== active) return; stop(); clearSource(); status('loadStatus', 'Processing exceeded 20 seconds. Choose a smaller file and load it again.', true); status('exportStatus', 'No result available.', true); emit('conversion_failed'); }, 20000);
      worker.postMessage({id,action,options}, options.bytes ? [options.bytes] : []);
    } else if (local) {
      setTimeout(() => { if (id !== active || g !== generation) return; try { receive({id,action,result:local[action](options)}); } catch (err) { receive({id,action,error:err.message}); } }, 0);
    }
  }
  function selectionOptions() { return {sheet:$('worksheet').value, path:$('jsonCollection').value, hasHeader:$('hasHeader').checked, excelValues:$('excelValues').value}; }
  function chooseData() {
    clearTimeout(debounce); clearTimeout(timer); active = ++request; clearOutput();
    fields = []; selected.clear(); $('fields').replaceChildren(); $('fieldCount').textContent = ''; notes('sourceWarnings');
    if (!meta) return;
    const json = ['json','jsonl'].includes(meta.format);
    const candidate = meta.collections.find(c => JSON.stringify(c.path) === $('jsonCollection').value);
    $('headerGroup').hidden = json && !candidate?.matrix;
    status('dataStatus', 'Reading the selected records…'); send('select', selectionOptions());
  }
  function formatHelp() {
    const format = $('outputFormat').value;
    $('formatHelp').textContent = {
      txt:'A plain text table with tab-separated columns. Cells containing tabs or line breaks are quoted. Downloads use .txt.',
      csv:'A comma-separated table for imports and spreadsheets. Values remain text.',
      tsv:'A tab-separated table. Tabs and line breaks inside cells are quoted.',
      xlsx:'One worksheet of values. Text IDs stay text; JSON numbers use text cells to preserve their digits.',
      json:'An array of objects using the selected field names. Text stays text; JSON number digits are preserved.',
      jsonl:'One JSON object per line, using the selected field names.',
      md:'A Markdown table for a README, wiki or document. Pipes and Markdown syntax in cells are escaped.',
    }[format];
    $('protectGroup').hidden = !['csv','tsv'].includes(format);
    $('sourcePanel').hidden = format === 'xlsx'; $('sourceTitle').textContent = 'View formatted output';
    $('download').textContent = 'Download ' + (format === 'md' ? 'Markdown' : format === 'xlsx' ? 'Excel' : format.toUpperCase());
    $('copy').hidden = format === 'xlsx';
  }
  function convert() {
    clearOutput(); formatHelp();
    if (!meta || !fields.length) return;
    send('export', {columns:fields.map((_, i) => i).filter(i => selected.has(i)), format:$('outputFormat').value, protect:$('protect').checked});
  }
  function scheduleConvert() {
    if (!meta || !fields.length) { clearOutput(); formatHelp(); return; }
    clearTimeout(timer); active = ++request; clearOutput(); formatHelp(); clearTimeout(debounce);
    if (meta && fields.length) debounce = setTimeout(convert, 120);
  }
  function receive(message) {
    if (message.id !== active) return;
    if (message.error) { fail(message.action, message.error); return; }
    const r = message.result;
    if (message.action === 'load') {
      meta = r; $('selectionControls').disabled = false;
      $('sheetGroup').hidden = r.format !== 'excel'; $('jsonGroup').hidden = !['json','jsonl'].includes(r.format);
      $('headerGroup').hidden = ['json','jsonl'].includes(r.format);
      $('worksheet').replaceChildren(...r.sheets.map(s => { const o = node('option', s.name + (s.hidden ? ' (hidden worksheet)' : '')); o.value = s.name; return o; }));
      if (r.sheets.length) $('worksheet').value = r.sheets[0].name;
      const candidates = r.collections.map(c => { const o = node('option', c.label); o.value = JSON.stringify(c.path); return o; });
      const placeholder = node('option', 'Choose a record collection'); placeholder.value = ''; $('jsonCollection').replaceChildren(placeholder, ...candidates); $('jsonCollection').value = r.defaultPath;
      $('fieldsPanel').open = ['json','jsonl'].includes(r.format);
      status('loadStatus', `Loaded ${sourceName}. Input format: ${r.format === 'excel' ? 'Excel' : r.format.toUpperCase()}.`); emit('conversion_loaded'); chooseData();
    } else if (message.action === 'select') {
      fields = r.headers; selected = new Set(fields.map((_, i) => i));
      $('fields').replaceChildren(...fields.map((name, i) => {
        const label = node('label', undefined, 'check'), cb = node('input'); cb.type = 'checkbox'; cb.checked = true; cb.id = `field-${i}`;
        cb.addEventListener('change', () => { if (cb.checked) selected.add(i); else selected.delete(i); updateCount(); scheduleConvert(); }); label.append(cb, node('span', name)); return label;
      }));
      updateCount(); notes('sourceWarnings', r.warnings); status('dataStatus', `${r.count.toLocaleString()} ${r.count === 1 ? 'row' : 'rows'} · ${fields.length} ${fields.length === 1 ? 'field' : 'fields'} available.`); convert();
    } else if (message.action === 'export') {
      latest = {...r,format:$('outputFormat').value}; notes('outputWarnings', r.warnings);
      const table = node('table'), head = node('thead'), tr = node('tr'), body = node('tbody');
      r.headers.forEach(h => { const th = node('th', h); th.scope = 'col'; tr.append(th); }); head.append(tr);
      r.preview.forEach(row => { const tr = node('tr'); row.forEach(v => tr.append(node('td', v))); body.append(tr); });
      table.append(node('caption', 'First 100 converted rows', 'sr-only'), head, body); $('tablePreview').replaceChildren(table);
      if (!r.count) $('tablePreview').append(node('p', 'No data rows. The output contains headers or an empty JSON array.', 'empty'));
      $('outputCount').textContent = `${r.count.toLocaleString()} ${r.count === 1 ? 'row' : 'rows'} · ${r.headers.length} ${r.headers.length === 1 ? 'field' : 'fields'}`;
      $('textPreview').textContent = r.text === undefined ? '' : r.text.slice(0,30000) + (r.text.length > 30000 ? '\n… Preview truncated. Download or copy for the complete result.' : '');
      $('download').disabled = false; $('copy').disabled = r.text === undefined;
      status('exportStatus', `Ready to download ${r.count.toLocaleString()} ${r.count === 1 ? 'row' : 'rows'}.`); emit('conversion_completed');
    }
  }
  function updateCount() { $('fieldCount').textContent = `(${selected.size} of ${fields.length})`; }
  function startLoad(input, name) {
    stop(); clearSource(); sourceName = name; status('dataStatus', 'Waiting for the source data.'); status('loadStatus', 'Loading replaces the previous data…');
    try { backend(); send('load', input); } catch (err) { fail('load', err.message); }
  }
  $('inputFile').addEventListener('change', async () => {
    const file = $('inputFile').files[0]; $('inputFile').value = ''; if (!file) return;
    stop(); clearSource(); const g = generation; status('loadStatus', `Reading ${file.name}…`);
    status('dataStatus', 'Waiting for the source data.'); status('exportStatus', 'Reading the selected file…');
    if (file.size > M.LIMITS.bytes) { fail('load', 'Input exceeds 5 MiB. Choose a smaller file.'); return; }
    try {
      const bytes = await file.arrayBuffer(); if (g !== generation) return;
      startLoad({bytes,format:$('inputFormat').value,name:file.name}, file.name);
    } catch { if (g === generation) fail('load', 'Could not read that file. Choose it again.'); }
  });
  $('loadText').addEventListener('click', () => {
    const text = $('inputText').value; startLoad({text,format:$('inputFormat').value,name:''}, 'pasted text');
  });
  // A changed source invalidates previous results immediately; loading remains explicit.
  function editedSource() {
    stop(); clearSource(); status('loadStatus', 'Source changed. Choose the file again or load the pasted text.'); status('dataStatus', 'Load the updated source to choose data.'); status('exportStatus', 'Load the updated source before exporting.');
  }
  $('inputText').addEventListener('input', editedSource); $('inputFormat').addEventListener('change', editedSource);
  ['worksheet','jsonCollection','hasHeader','excelValues'].forEach(id => $(id).addEventListener('change', chooseData));
  ['outputFormat','protect'].forEach(id => $(id).addEventListener('change', scheduleConvert));
  for (const [id, include] of [['allFields',true],['noFields',false]]) $(id).addEventListener('click', () => {
    selected = new Set(include ? fields.map((_,i) => i) : []); fields.forEach((_,i) => { $(`field-${i}`).checked = include; }); updateCount(); scheduleConvert();
  });
  $('example').addEventListener('click', () => {
    $('inputFormat').value = 'json'; $('hasHeader').checked = true;
    const text = '{"customers":[{"id":"001","name":"Asha","contact":{"city":"London"},"note":"Tea | coffee"},{"id":"002","name":"Ben","contact":{"city":"York"},"note":"Two\\nlines"}]}';
    $('inputText').value = text; startLoad({text,format:'json'}, 'example customers');
  });
  $('reset').addEventListener('click', () => {
    stop(); clearSource(); $('inputText').value = $('inputFile').value = ''; $('inputFormat').value = 'auto'; $('hasHeader').checked = $('protect').checked = true; $('excelValues').value = 'display'; $('pastePanel').open = $('fieldsPanel').open = $('sourcePanel').open = false;
    $('outputFormat').value = 'csv'; formatHelp(); status('loadStatus', 'All data cleared.'); status('dataStatus', 'Load data to choose a worksheet or fields.'); status('exportStatus', 'Your converted data will appear here.'); emit('conversion_cleared');
  });
  $('copy').addEventListener('click', async () => {
    if (!latest || latest.text === undefined) return; const result = latest;
    try { await navigator.clipboard.writeText(result.text); if (result === latest) status('exportStatus', 'Output copied to clipboard.'); emit('conversion_copied'); }
    catch { if (result === latest) status('exportStatus', 'Copy failed. Download the file instead.', true); }
  });
  $('download').addEventListener('click', () => {
    if (!latest) return; const a = node('a'), url = URL.createObjectURL(new Blob([latest.bytes || latest.text], {type:latest.mime}));
    a.href = url; a.download = `converted-data.${latest.extension}`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),1000); status('exportStatus','Download started.'); emit('conversion_downloaded');
  });
  window.addEventListener('pagehide', stop); formatHelp(); clearOutput(); emit('tool_opened');
})();
