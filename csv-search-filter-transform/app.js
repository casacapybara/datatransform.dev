(function () {
  'use strict';
  const M = window.CsvSuite, $ = id => document.getElementById(id);
  let dataset = null, changes = [], columns = [], latest = null, splitFiles = [], loadVersion = 0, manualRows = [], sortRules = [], outputHeaders = [], combineColumns = [];
  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function status(id, text, error = false) { $(id).textContent = text; $(id).classList.toggle('error', error); }
  function button(text, label, action) {
    const el = node('button', text, 'button small'); el.type = 'button';
    if (label) el.setAttribute('aria-label', label);
    el.addEventListener('click', action); return el;
  }
  function options(select) {
    select.replaceChildren(...dataset.headers.map((h, i) => {
      const el = node('option', h); el.value = String(i); return el;
    }));
  }
  function clearResult() {
    splitFiles = []; $('downloadZip').disabled=true; $('fileList').replaceChildren(); latest = null; $('copy').disabled = true; $('download').disabled = true;
    $('textPreview').textContent = '';
    $('tablePreview').replaceChildren(node('p', 'No output available.', 'empty'));
    $('outputCount').textContent = '0 rows';
  }
  function reset() {
    loadVersion++; dataset = null; changes = []; columns = []; manualRows = []; sortRules = [];
    $('csvFile').value = ''; $('csvInput').value = ''; $('pastePanel').open = false;
    $('filterControls').disabled = true; $('exportControls').disabled = true;
    for (const id of ['addChange', 'clearChanges', 'restoreColumns']) $(id).disabled = true;
    $('changes').replaceChildren(); $('searchColumns').replaceChildren(); $('splitColumn').replaceChildren();
    $('outputColumns').replaceChildren(node('p', 'Load data to choose output columns.'));
    resetExtraControls(); resetOptions(); clearResult();
    status('loadStatus', 'Load a file or paste CSV data to begin.');
    status('filterStatus', 'Filters update the result automatically.');
    status('exportStatus', 'Your output will appear here.');
    $('filterCount').textContent = 'No data loaded';
  }
  function resetOptions() {
    status('changeStatus', 'Changes affect the output only. Your loaded data stays available.');
    $('cellPolicy').value = 'any'; $('removeDuplicates').checked = false; $('duplicateScope').value = 'whole';
    $('duplicateTrim').checked = false; $('duplicateIgnoreCase').checked = false;
    $('criteria').value = ''; $('matchMode').value = 'contains'; $('scope').value = 'all';
    $('repeats').value = 'once'; $('caseSensitive').checked = false; $('trimCells').checked = true;
    $('outputFormat').value = 'csv'; $('helpers').checked = false; $('protect').checked = true;
    $('indent').value = '2'; $('variable').value = 'data'; $('trimValues').checked = true;
    $('fileMode').value='none'; $('fileRows').value='1000'; $('fileColumn').replaceChildren(); if(dataset) options($('fileColumn')); $('fileColumn').value='0';
    $('splitFields').checked = false; $('omitEmpty').checked = true;
    resetColumnTools(); updateVisibility();
  }
  function resetColumnTools() {
    outputHeaders = dataset ? [...dataset.headers] : [];
    combineColumns = dataset ? dataset.headers.map((_,index)=>({index,included:false})) : [];
    $('columnTools').disabled = !dataset; $('reshapePanel').open = false;
    for (const [id,value] of Object.entries({columnMode:'none',columnSeparator:'comma',columnCustom:'',columnSplitCount:'2',columnSplitName:'Part',columnCombineName:'Combined'})) $(id).value=value;
    $('columnTrim').checked=false; $('columnSkipEmpty').checked=true;
    $('columnSplitSource').replaceChildren();
    if (dataset) {
      options($('columnSplitSource')); const placeholder=node('option','Choose a column'); placeholder.value=''; $('columnSplitSource').prepend(placeholder);
    }
    $('columnSplitSource').value=''; renderCombineColumns();
    status('columnStatus',dataset ? 'Original columns are unchanged.' : 'Load data to split or combine columns.');
  }
  function renderCombineColumns(focusId) {
    $('combineOrder').replaceChildren(...combineColumns.map((column,position)=>{
      const row=node('div',undefined,'combine-choice'), label=node('label',undefined,'check'), check=node('input');
      check.type='checkbox'; check.id=`combine-column-${column.index}`; check.checked=column.included;
      check.addEventListener('change',()=>{column.included=check.checked;refresh();}); label.append(check,node('span',dataset.headers[column.index]));
      const arrows=node('div',undefined,'column-arrows');
      for(const [delta,text,direction] of [[-1,'↑','up'],[1,'↓','down']]) {
        const move=button(text,`Move ${dataset.headers[column.index]} ${direction} in combined value`,()=>{
          [combineColumns[position],combineColumns[position+delta]]=[combineColumns[position+delta],combineColumns[position]];
          renderCombineColumns(`combine-column-${column.index}`);refresh();
        }); move.id=`combine-move-${column.index}-${direction}`;move.disabled=position+delta<0||position+delta>=combineColumns.length;arrows.append(move);
      }
      row.append(label,arrows);return row;
    }));
    if(focusId)$(focusId).focus();
  }
  function columnSettings() {
    const separators={comma:',',space:' ',tab:'\t',semicolon:';',pipe:'|'};
    return {mode:$('columnMode').value,separator:$('columnSeparator').value==='custom'?$('columnCustom').value:separators[$('columnSeparator').value],
      column:$('columnSplitSource').value===''?'':Number($('columnSplitSource').value),count:Number($('columnSplitCount').value),
      name:$('columnMode').value==='split'?$('columnSplitName').value:$('columnCombineName').value,
      columns:combineColumns.filter(c=>c.included).map(c=>c.index),trim:$('columnTrim').checked,skipEmpty:$('columnSkipEmpty').checked};
  }
  function syncOutputColumns(names) {
    if (JSON.stringify(names)===JSON.stringify(outputHeaders)) return;
    columns=columns.filter(c=>c.index<names.length&&outputHeaders[c.index]===names[c.index]);
    const present=new Set(columns.map(c=>c.index));names.forEach((name,index)=>{if(!present.has(index))columns.push({index,name,included:true});});
    outputHeaders=names;renderColumns();
  }
  function restoreColumns() {
    columns = outputHeaders.map((name, index) => ({index, name, included: true}));
    renderColumns(); refresh();
  }
  function load(text, name) {
    // Parse first. A bad replacement leaves the current dataset intact.
    try {
      const parsed = M.parse(text);
      dataset = parsed; changes = []; manualRows = []; sortRules = []; resetExtraControls(); resetOptions();
      $('changes').replaceChildren(); $('clearChanges').disabled = true;
      $('filterControls').disabled = false; $('exportControls').disabled = false;
      $('addChange').disabled = false; $('restoreColumns').disabled = false;
      $('searchColumns').replaceChildren(...dataset.headers.map((header, index) => {
        const label = node('label', undefined, 'check'), cb = node('input');
        cb.type = 'checkbox'; cb.value = index; cb.checked = true;
        cb.addEventListener('change', refresh); label.append(cb, node('span', header)); return label;
      }));
      $('splitColumn').replaceChildren(...dataset.headers.map(h => {
        const option = node('option', h); option.value = h; return option;
      }));
      const fields = dataset.headers.find(h => h.toLowerCase() === 'fields');
      if (fields) $('splitColumn').value = fields;
      renderExtraControls(); restoreColumns();
      status('loadStatus', `Loaded ${name}: ${dataset.rows.length.toLocaleString()} rows, ${dataset.headers.length} columns.${dataset.warnings.length ? ' ' + dataset.warnings.join(' ') : ''}`);
    } catch (err) { status('loadStatus', `${err.message}${dataset ? ' The previously loaded data is still active.' : ''}`, true); }
  }
  $('csvFile').addEventListener('change', async () => {
    const file = $('csvFile').files[0]; if (!file) return;
    const version = ++loadVersion;
    if (file.size > M.LIMITS.bytes) { status('loadStatus', 'File exceeds 5 MiB. Choose a smaller CSV. The current data has not changed.', true); return; }
    status('loadStatus', `Reading ${file.name}…`);
    try { const text = await file.text(); if (version === loadVersion) { load(text, file.name); $('csvInput').value = ''; } }
    catch { if (version === loadVersion) status('loadStatus', 'Could not read that file. The current data has not changed.', true); }
  });
  $('loadPaste').addEventListener('click', () => { loadVersion++; load($('csvInput').value, 'pasted data'); $('csvFile').value = ''; });
  $('example').addEventListener('click', () => {
    loadVersion++;
    const text = 'id,name,city,status,amount,fields\n001,Asha Patel,London,Active,24.50,"email,phone"\n002,Ben Reed,York,Pending,18.00,email\n003,Chris Jones,London,Active,12.00,"email,address"\n004,Dev Shah,,Pending,9.50,phone\n002,Ben Reed,York,Pending,18.00,email';
    $('csvInput').value = text; $('csvFile').value = '';
    load(text, 'example customers');
    status('loadStatus', 'Example loaded: 5 rows, including a duplicate and a blank city. Try filtering London, removing duplicates, sorting amounts or splitting fields.');
  });
  $('reset').addEventListener('click', reset);
  function updateVisibility() {
    $('fileRowsGroup').hidden=$('fileMode').value!=='rows'; $('fileColumnGroup').hidden=$('fileMode').value!=='value';
    const columnMode=$('columnMode').value;
    $('columnSeparatorGroup').hidden=$('columnWhitespace').hidden=columnMode==='none';
    $('columnCustomGroup').hidden=columnMode==='none'||$('columnSeparator').value!=='custom';
    $('columnSplitOptions').hidden=columnMode!=='split';$('columnCombineOptions').hidden=columnMode!=='combine';
    $('columnPicker').hidden = $('scope').value !== 'selected';
    const cellMode = ['empty', 'nonEmpty'].includes($('matchMode').value);
    $('cellPolicyGroup').hidden = !cellMode; $('criteria').disabled = cellMode; $('caseSensitive').disabled = cellMode;
    $('dedupeOptions').hidden = !$('removeDuplicates').checked; $('duplicateKeys').hidden = $('duplicateScope').value !== 'keys';
    const negative = $('matchMode').value === 'notContains';
    $('negativeHelp').hidden = !negative; $('repeats').disabled = negative || cellMode;
    const format = $('outputFormat').value;
    $('csvOptions').hidden = format !== 'csv'; $('jsonOptions').hidden = !['json','js'].includes(format);
    $('variableGroup').hidden = format !== 'js'; $('splitOptions').hidden = !$('splitFields').checked;
    $('download').textContent = `Download ${format === 'js' ? 'JavaScript' : format.toUpperCase()}`;
    $('variableHelp').textContent = `Exported as: const ${M.variableName($('variable').value)} = …`;
  }
  function renderChanges(focusIndex) {
    $('changes').replaceChildren(...changes.map((change, index) => {
      const row = node('div', undefined, 'change-row');
      const colGroup = node('div'), col = node('select', undefined, 'control');
      col.id = `change-column-${index}`; options(col);
      const placeholder = node('option', 'Choose a column'); placeholder.value = ''; col.prepend(placeholder); col.value = String(change.column);
      const colLabel = node('label', `Change ${index + 1} · Column`); colLabel.htmlFor = col.id;
      col.addEventListener('change', () => { change.column = col.value === '' ? '' : Number(col.value); refresh(); });
      colGroup.append(colLabel, col);
      const valueGroup = node('div'), value = node('input', undefined, 'control');
      value.type = 'text'; value.maxLength = 10000; value.id = `change-value-${index}`; value.value = change.value;
      const valueLabel = node('label', 'New value'); valueLabel.htmlFor = value.id;
      value.addEventListener('input', () => { change.value = value.value; refresh(); });
      const typeGroup = node('div'), type = node('select', undefined, 'control');
      type.id = `change-type-${index}`;
      for (const [v, text] of [['set', 'Set value'], ['replace', 'Find and replace'], ['trim','Trim whitespace'], ['lower','Lowercase'], ['upper','Uppercase'], ['removePrefix','Remove prefix'], ['removeSuffix','Remove suffix']]) { const option = node('option', text); option.value = v; type.append(option); }
      type.value = change.type || 'set';
      const typeLabel = node('label', 'Action'); typeLabel.htmlFor = type.id; typeGroup.append(typeLabel, type);
      const findGroup = node('div'), find = node('input', undefined, 'control');
      find.type = 'text'; find.maxLength = 10000; find.id = `change-find-${index}`; find.value = change.find || '';
      const findLabel = node('label', 'Find text'); findLabel.htmlFor = find.id; findGroup.append(findLabel, find);
      const caseLabel = node('label', undefined, 'check'), caseCheck = node('input'); caseCheck.type = 'checkbox'; caseCheck.checked = change.caseSensitive !== false;
      caseLabel.append(caseCheck, node('span', 'Case-sensitive replacement'));
      function showAction() {
        const simple = ['trim','lower','upper'].includes(type.value);
        valueGroup.hidden = simple; row.classList.toggle('compact-change',simple);
        findGroup.hidden = type.value !== 'replace'; caseLabel.hidden = type.value !== 'replace';
        valueLabel.textContent = type.value === 'replace' ? 'Replacement text' : type.value === 'removePrefix' ? 'Prefix to remove' : type.value === 'removeSuffix' ? 'Suffix to remove' : 'New value';
      }
      type.addEventListener('change', () => { change.type = type.value; showAction(); refresh(); });
      find.addEventListener('input', () => { change.find = find.value; refresh(); });
      caseCheck.addEventListener('change', () => { change.caseSensitive = caseCheck.checked; refresh(); });
      showAction(); valueGroup.append(findGroup, valueLabel, value, caseLabel);
      const remove = button('Remove', `Remove change ${index + 1}`, () => {
        changes.splice(index, 1); renderChanges(Math.min(index, changes.length - 1)); refresh();
        if (!changes.length) $('addChange').focus();
      });
      row.append(typeGroup, colGroup, valueGroup, remove); return row;
    }));
    $('clearChanges').disabled = !changes.length;
    if (focusIndex >= 0) $(`change-column-${focusIndex}`).focus();
  }
  $('addChange').addEventListener('click', () => { if (changes.length >= 100) { status('changeStatus', 'Use no more than 100 value changes.', true); return; } changes.push({column: '', value: '', type: 'set', find: '', caseSensitive: true}); renderChanges(changes.length - 1); refresh(); });
  $('clearChanges').addEventListener('click', () => { changes = []; status('changeStatus', 'Changes cleared. Loaded values restored.'); renderChanges(); refresh(); $('addChange').focus(); });
  function resetExtraControls() {
    $('manualControls').disabled = true; $('cleanupControls').disabled = true;
    for (const id of ['manualFields', 'manualRows', 'sortRules', 'duplicateKeys']) $(id).replaceChildren();
    $('manualCount').textContent = '0 added rows'; $('clearSort').disabled = true;
    status('manualStatus', 'Load data to add rows.'); status('cleanupStatus', 'Duplicate removal and sorting are off.');
  }
  function renderExtraControls() {
    $('manualControls').disabled = false; $('cleanupControls').disabled = false;
    $('manualFields').replaceChildren(...dataset.headers.map((name, i) => {
      const group = node('div'), input = node('textarea', undefined, 'control manual-value');
      input.id = `manual-value-${i}`; input.rows = 2; input.value = ''; input.maxLength = 10000;
      const label = node('label', name); label.htmlFor = input.id; group.append(label, input); return group;
    }));
    $('duplicateKeys').replaceChildren(...dataset.headers.map((name, i) => {
      const label = node('label', undefined, 'check'), cb = node('input'); cb.type = 'checkbox'; cb.value = i; cb.checked = false;
      cb.addEventListener('change', refresh); label.append(cb, node('span', name)); return label;
    }));
    status('manualStatus', 'Enter values above to add a row.');
  }
  function renderManualRows() {
    $('manualCount').textContent = `${manualRows.length.toLocaleString()} added row${manualRows.length === 1 ? '' : 's'}`;
    $('manualRows').replaceChildren(...manualRows.map((data, i) => {
      const row = node('div', undefined, 'manual-row'), summary = node('span', `Row ${i + 1}: ` + data.map((v, c) => `${dataset.headers[c]}: ${v || '(empty)'}`).join(' · '));
      row.append(summary, button('Remove', `Remove added row ${i + 1}`, () => { manualRows.splice(i, 1); renderManualRows(); refresh(); $('addManual').focus(); })); return row;
    }));
  }
  $('addManual').addEventListener('click', () => {
    if (!dataset) return;
    if (manualRows.length >= M.LIMITS.rows) { status('manualStatus', 'Manual rows are limited to 20,000.', true); return; }
    manualRows.push(dataset.headers.map((_, i) => $(`manual-value-${i}`).value));
    dataset.headers.forEach((_, i) => { $(`manual-value-${i}`).value = ''; });
    renderManualRows(); refresh(); status('manualStatus', 'Row added. Check the output preview; duplicate removal may remove this row.'); $('manual-value-0').focus();
  });
  function renderSortRules(focusIndex) {
    $('sortRules').replaceChildren(...sortRules.map((rule, i) => {
      const row = node('div', undefined, 'sort-row');
      function control(labelText, key, values) {
        const group = node('div'), select = node('select', undefined, 'control'); select.id = `sort-${key}-${i}`;
        const label = node('label', labelText); label.htmlFor = select.id;
        for (const [value, name] of values) { const option = node('option', name); option.value = String(value); select.append(option); }
        select.value = String(rule[key]); select.addEventListener('change', () => { rule[key] = key === 'column' && select.value !== '' ? Number(select.value) : select.value; refresh(); }); group.append(label, select); return group;
      }
      row.append(control(`Sort ${i + 1} · Column`, 'column', [['', 'Choose a column'], ...dataset.headers.map((h, n) => [n, h])]), control('Compare as', 'type', [['text', 'Text'], ['number', 'Number']]), control('Direction', 'direction', [['asc', 'Ascending'], ['desc', 'Descending']]), button('Remove', `Remove sort ${i + 1}`, () => { sortRules.splice(i, 1); renderSortRules(); refresh(); $('addSort').focus(); })); return row;
    }));
    $('clearSort').disabled = !sortRules.length;
    if (focusIndex !== undefined) $(`sort-column-${focusIndex}`).focus();
  }
  $('addSort').addEventListener('click', () => { if (!dataset) return; if (sortRules.length >= dataset.headers.length) { status('cleanupStatus', 'Use no more sort rules than loaded columns.', true); return; } sortRules.push({column: '', type: 'text', direction: 'asc'}); renderSortRules(sortRules.length - 1); refresh(); });
  $('clearSort').addEventListener('click', () => { sortRules = []; renderSortRules(); refresh(); $('addSort').focus(); });
  function renderColumns(focusIndex, direction) {
    $('outputColumns').replaceChildren(...columns.map((column, position) => {
      const row = node('div', undefined, 'output-column');
      const label = node('label', undefined, 'check'), check = node('input');
      check.type = 'checkbox'; check.checked = column.included;
      check.addEventListener('change', () => { column.included = check.checked; rename.disabled = !column.included; refresh(); });
      label.append(check, node('span', outputHeaders[column.index]));
      const group = node('div', undefined, 'rename'), rename = node('input', undefined, 'control');
      rename.type = 'text'; rename.value = column.name; rename.disabled = !column.included;
      rename.id = `rename-${column.index}`;
      const renameLabel = node('label', 'Output name'); renameLabel.htmlFor = rename.id;
      rename.addEventListener('input', () => { column.name = rename.value; refresh(); });
      group.append(renameLabel, rename);
      const arrows = node('div', undefined, 'column-arrows');
      for (const [delta, text, title] of [[-1, '↑', 'up'], [1, '↓', 'down']]) {
        const move = button(text, `Move ${outputHeaders[column.index]} ${title}`, () => {
          [columns[position], columns[position + delta]] = [columns[position + delta], columns[position]];
          renderColumns(column.index, delta); refresh();
        });
        move.id = `move-${column.index}-${title}`;
        move.disabled = position + delta < 0 || position + delta >= columns.length;
        arrows.append(move);
      }
      row.append(label, group, arrows); return row;
    }));
    if (focusIndex !== undefined) {
      const target = $(`move-${focusIndex}-${direction < 0 ? 'up' : 'down'}`);
      (target.disabled ? $(`move-${focusIndex}-${direction < 0 ? 'down' : 'up'}`) : target).focus();
    }
  }
  $('restoreColumns').addEventListener('click', restoreColumns);
  for (const [id, checked] of [['selectAll', true], ['selectNone', false]]) $(id).addEventListener('click', () => {
    $('searchColumns').querySelectorAll('input').forEach(cb => { cb.checked = checked; }); refresh();
  });
  function refresh() {
    updateVisibility();
    if (!dataset) return;
    clearResult();
    let items;
    try {
      const selected = $('scope').value === 'all' ? dataset.headers.map((_, i) => i) : [...$('searchColumns').querySelectorAll('input:checked')].map(cb => Number(cb.value));
      items = M.filter(dataset, {text: $('criteria').value, columns: selected, mode: $('matchMode').value, trim: $('trimCells').checked, caseSensitive: $('caseSensitive').checked, cellPolicy: $('cellPolicy').value, repeat: $('repeats').value === 'repeat'});
      $('filterCount').textContent = `${items.length.toLocaleString()} / ${dataset.rows.length.toLocaleString()} rows`;
      status('filterStatus', !['empty', 'nonEmpty'].includes($('matchMode').value) && !M.terms($('criteria').value, $('caseSensitive').checked).length ? 'No search terms — keeping all rows.' : `${items.length.toLocaleString()} output row${items.length === 1 ? '' : 's'} after filtering.`);
    } catch (err) {
      $('filterCount').textContent = 'Check filters'; status('filterStatus', err.message, true);
      status('exportStatus', 'Resolve the filter error to export the current data.', true); return;
    }
    try {
      const activeChanges = changes.filter(c => c.column !== '');
      items = M.transform(items, activeChanges);
      items = M.appendManual(items, manualRows, dataset.headers.length);
      const deduped = M.deduplicate(items, {enabled: $('removeDuplicates').checked, columns: $('duplicateScope').value === 'whole' ? dataset.headers.map((_, i) => i) : [...$('duplicateKeys').querySelectorAll('input:checked')].map(cb => Number(cb.value)), trim: $('duplicateTrim').checked, ignoreCase: $('duplicateIgnoreCase').checked});
      items = M.sortRows(deduped.items, sortRules);
      status('cleanupStatus', `${deduped.removed.toLocaleString()} duplicate row${deduped.removed === 1 ? '' : 's'} removed. ${sortRules.filter(r => r.column !== '').length} sort columns applied.`);
      let shaped;
      try { shaped=M.changeColumns(dataset.headers,items,columnSettings()); }
      catch(err) { status('columnStatus',err.message,true);throw err; }
      items=shaped.items;syncOutputColumns(shaped.headers);
      const prior=$('fileColumn').value; $('fileColumn').replaceChildren(...outputHeaders.map((h,i)=>{const o=node('option',h);o.value=String(i);return o;})); $('fileColumn').value=Number(prior)<outputHeaders.length?prior:'0';
      const added=shaped.headers.length-dataset.headers.length;
      status('columnStatus',added?`${added} new column${added===1?'':'s'} added. Original columns are retained; choose output columns below.`:'Original columns are unchanged.');
      const projection = columns.filter(c => c.included).map(c => ({index: c.index, name: c.name}));
      const exportOptions = {projection, format: $('outputFormat').value, helpers: $('helpers').checked, protect: $('protect').checked, trimValues: $('trimValues').checked, split: $('splitFields').checked, splitColumn: $('splitColumn').value, omitEmpty: $('omitEmpty').checked, indent: $('indent').value, variable: $('variable').value};
      const result=M.serialize(outputHeaders,items,exportOptions);
      if($('fileMode').value!=='none'){
        const groups=M.partition(items,{mode:$('fileMode').value,rows:Number($('fileRows').value),column:Number($('fileColumn').value)},outputHeaders);
        splitFiles=groups.map((g,i)=>({name:`part-${String(i+1).padStart(3,'0')}.${result.extension}`,text:M.serialize(outputHeaders,g.items,exportOptions).text,label:g.label,count:g.items.length}));
        $('fileList').replaceChildren(...splitFiles.map(f=>node('li',`${f.name} · ${f.count} ${f.count===1?'row':'rows'} · ${f.label.slice(0,300)}${f.label.length>300?'…':''}`)));
        $('downloadZip').disabled=!splitFiles.length;
      }
      latest = result;
      $('download').disabled = false; $('copy').disabled = false;
      $('outputCount').textContent = `${items.length.toLocaleString()} row${items.length === 1 ? '' : 's'} · ${projection.length + ($('helpers').checked ? 3 : 0)} columns`;
      $('textPreview').textContent = result.text.slice(0, 30000) + (result.text.length > 30000 ? '\n… Preview truncated; download or copy for the complete output.' : '');
      renderTable(items, projection);
      status('exportStatus', items.length ? `Ready to export ${items.length.toLocaleString()} row${items.length === 1 ? '' : 's'}. ${activeChanges.length} value change${activeChanges.length === 1 ? '' : 's'} applied. ${added} new column${added===1?'':'s'} added.` : 'No rows remain. You can download an empty result or adjust your filters.');
    } catch (err) { clearResult(); status('cleanupStatus', 'Check value changes, duplicate keys, sorting, split/combine settings and output options.', true); status('exportStatus', err.message, true); }
  }
  function renderTable(items, projection) {
    const names = latest.preview.headers, data = latest.preview.rows;
    const table = node('table'), caption = node('caption', 'First 100 output rows', 'sr-only'), head = node('thead'), tr = node('tr');
    names.forEach(name => { const th = node('th', name); th.scope = 'col'; tr.append(th); });
    head.append(tr); const body = node('tbody');
    data.slice(0, 100).forEach(row => { const tr = node('tr'); row.forEach(value => tr.append(node('td', value))); body.append(tr); });
    table.append(caption, head, body); $('tablePreview').replaceChildren(table);
    if (!items.length) $('tablePreview').append(node('p', 'No rows match your filters.', 'empty'));
  }
  for (const id of ['fileMode','fileRows','fileColumn','cellPolicy', 'removeDuplicates', 'duplicateScope', 'duplicateTrim', 'duplicateIgnoreCase', 'criteria', 'caseSensitive', 'trimCells', 'matchMode', 'scope', 'repeats', 'outputFormat', 'helpers', 'protect', 'indent', 'variable', 'trimValues', 'splitFields', 'splitColumn', 'omitEmpty']) $(id).addEventListener('input', refresh);
  for(const id of ['columnMode','columnSeparator','columnSplitSource','columnSkipEmpty','columnTrim']) $(id).addEventListener('change',refresh);
  for(const id of ['columnCustom','columnSplitCount','columnSplitName','columnCombineName']) $(id).addEventListener('input',refresh);
  $('copy').addEventListener('click', async () => {
    if (!latest) return;
    const output = latest;
    try { await navigator.clipboard.writeText(output.text); if (latest === output) status('exportStatus', 'Output copied to clipboard.'); }
    catch { status('exportStatus', 'Copy failed. Download the output or select and copy the formatted output manually.', true); }
  });
  $('download').addEventListener('click', () => {
    if (!latest) return;
    const url = URL.createObjectURL(new Blob([latest.text], {type: latest.mime}));
    const link = node('a'); link.href = url; link.download = `csv-suite-output.${latest.extension}`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status('exportStatus', 'Download started.');
  });
  $('downloadZip').addEventListener('click',()=>{if(!latest||!splitFiles.length)return;try{const url=URL.createObjectURL(new Blob([M.zip(splitFiles)],{type:'application/zip'})),a=node('a');a.href=url;a.download='csv-suite-parts.zip';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status('exportStatus','ZIP download started.');}catch(e){status('exportStatus',e.message,true);}});
  reset();
})();
