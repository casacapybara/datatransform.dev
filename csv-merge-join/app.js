(function () {
  'use strict';
  const M = window.CsvMerge, $ = id => document.getElementById(id);
  let mode = 'stack', tables = [], pair = [null, null], stackCols = [], matchCols = [], keys = [];
  let report = null, latest = null, tokens = {stack: 0, a: 0, b: 0}, reading = new Set();
  function emit(name) { try { window.DataTransformEvents?.emit(name, {}, 'csv-merge-join'); } catch {} }
  function el(tag, text, className) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (className) n.className = className;
    return n;
  }
  function status(id, text, error = false) { $(id).textContent = text; $(id).classList.toggle('error', error); }
  function button(text, label, fn) {
    const n = el('button', text, 'button small'); n.type = 'button';
    n.setAttribute('aria-label', label); n.addEventListener('click', fn); return n;
  }
  function select(id, labelText, choices, value, change) {
    const group = el('div'), label = el('label', labelText), input = el('select', undefined, 'control');
    label.htmlFor = id; input.id = id;
    choices.forEach(([v, name]) => { const option = el('option', name); option.value = String(v); input.append(option); });
    input.value = String(value); input.addEventListener('change', () => change(input.value));
    group.append(label, input); return group;
  }
  function clearOutput() {
    latest = null; $('download').disabled = true; $('copy').disabled = true;
    $('outputCount').textContent = 'No result yet'; $('textPreview').textContent = '';
    $('tablePreview').replaceChildren(el('p', 'No result available.', 'empty'));
  }
  function cancelReads() { for (const k of Object.keys(tokens)) tokens[k]++; reading.clear(); }
  function tablePreview(table, limit = 100) {
    const tableEl = el('table'), caption = el('caption', `First ${limit} rows`, 'sr-only'), head = el('thead'), tr = el('tr'), body = el('tbody');
    table.headers.forEach(h => { const th = el('th', h); th.scope = 'col'; tr.append(th); });
    head.append(tr);
    table.rows.slice(0, limit).forEach(row => { const tr = el('tr'); row.data.forEach(v => tr.append(el('td', v))); body.append(tr); });
    tableEl.append(caption, head, body); return tableEl;
  }
  function mini(table) {
    const details = el('details', undefined, 'mini-preview'), summary = el('summary', 'Preview source columns and first 5 rows');
    const view = el('div', undefined, 'table-preview'); view.tabIndex = 0; view.setAttribute('role', 'region'); view.setAttribute('aria-label', 'Source table preview');
    view.append(tablePreview(table, 5)); details.append(summary, view); return details;
  }
  function tableInfo(table) { return `${table.rows.length.toLocaleString()} rows · ${table.headers.length} columns`; }
  function renderLoaded() {
    $('stackList').replaceChildren(...tables.map((t, i) => {
      const card = el('div', undefined, 'loaded-table'), top = el('div', undefined, 'input-heading'), actions = el('div', undefined, 'actions');
      [-1, 1].forEach(delta => {
        const b = button(delta < 0 ? '↑' : '↓', `Move table ${i + 1} ${delta < 0 ? 'up' : 'down'}`, () => {
          [tables[i], tables[i + delta]] = [tables[i + delta], tables[i]]; stackChanged(); $('stackFiles').focus(); status('loadStatus', 'Table order changed. Column settings were reset.');
        }); b.disabled = i + delta < 0 || i + delta >= tables.length; actions.append(b);
      });
      actions.append(button('Remove', `Remove table ${i + 1}`, () => { tokens.stack++; reading.delete('stack'); tables.splice(i, 1); stackChanged(); $('stackFiles').focus(); status('loadStatus', 'Table removed. Column settings were reset.'); }));
      top.append(el('h3', `${i + 1}. ${t.name}`), actions); card.append(top, el('p', tableInfo(t), 'hint'));
      t.warnings.forEach(w => card.append(el('p', w, 'message'))); card.append(mini(t)); return card;
    }));
    ['a', 'b'].forEach((side, i) => {
      const t = pair[i]; $(side + 'Summary').textContent = t ? `${t.name}: ${tableInfo(t)}${t.warnings.length ? ' ' + t.warnings.join(' ') : ''}` : 'No table loaded.';
      $(side + 'Remove').disabled = !t; $(side + 'Preview').replaceChildren(...(t ? [mini(t)] : []));
    });
  }
  function renderColumns(kind) {
    const columns = kind === 'stack' ? stackCols : matchCols;
    $(kind + 'Columns').replaceChildren(...columns.map((c, i) => {
      const row = el('div', undefined, 'column-setting'), top = el('div', undefined, 'input-heading');
      row.setAttribute('role', 'group'); row.setAttribute('aria-label', `Output column ${i + 1}`);
      const checkLabel = el('label', undefined, 'check'), check = el('input'); check.type = 'checkbox'; check.checked = c.included;
      check.id = `${kind}-include-${i}`;
      check.addEventListener('change', () => { c.included = check.checked; refresh(); });
      checkLabel.append(check, el('span', kind === 'stack' ? `Output column ${i + 1}` : `${c.side === 0 ? 'First' : 'Second'} table · ${pair[c.side].headers[c.index]}`));
      const arrows = el('div', undefined, 'column-arrows');
      [-1, 1].forEach(delta => {
        const b = button(delta < 0 ? '↑' : '↓', `Move output column ${i + 1} ${delta < 0 ? 'up' : 'down'}`, () => {
          [columns[i], columns[i + delta]] = [columns[i + delta], columns[i]]; renderColumns(kind); refresh(); $(`${kind}-name-${i + delta}`).focus();
        }); b.disabled = i + delta < 0 || i + delta >= columns.length; arrows.append(b);
      });
      top.append(checkLabel, arrows); row.append(top);
      const label = el('label', 'Output name'), input = el('input', undefined, 'control');
      input.type = 'text'; input.id = `${kind}-name-${i}`; input.maxLength = 200; input.value = c.name; label.htmlFor = input.id;
      input.addEventListener('input', () => { c.name = input.value; refresh(); }); row.append(label, input);
      if (kind === 'stack') {
        const grid = el('div', undefined, 'form-grid');
        tables.forEach((t, j) => grid.append(select(`stack-source-${i}-${j}`, `${j + 1}. ${t.name}`, [[-1, 'No source (blank cells)'], ...t.headers.map((h, n) => [n, h])], c.sources[j], v => { c.sources[j] = Number(v); refresh(); })));
        row.append(grid);
      }
      return row;
    }));
  }
  function stackChanged() {
    stackCols = M.stackColumns(tables); renderLoaded(); renderColumns('stack'); refresh();
  }
  function pairChanged() {
    matchCols = pair.every(Boolean) ? M.matchColumns(...pair) : [];
    const shared = pair.every(Boolean) ? pair[0].headers.findIndex(h => pair[1].headers.includes(h)) : -1;
    keys = [{a: shared >= 0 ? shared : '', b: shared >= 0 ? pair[1].headers.indexOf(pair[0].headers[shared]) : ''}];
    $('matchControls').disabled = !pair.every(Boolean); $('resultView').value = 'merged';
    renderLoaded(); renderKeys(); renderColumns('match'); refresh();
  }
  function renderKeys() {
    $('keyPairs').replaceChildren(...keys.map((key, i) => {
      const row = el('div', undefined, 'key-pair');
      ['a', 'b'].forEach((side, j) => row.append(select(`key-${side}-${i}`, `${j === 0 ? 'First' : 'Second'} table · Matching column ${i + 1}`, [['', 'Choose a column'], ...(pair[j]?.headers || []).map((h, n) => [n, h])], key[side], v => { key[side] = v === '' ? '' : Number(v); refresh(); })));
      const remove = button('Remove', `Remove matching column pair ${i + 1}`, () => { keys.splice(i, 1); renderKeys(); refresh(); $('addKey').focus(); }); remove.disabled = keys.length === 1; row.append(remove); return row;
    }));
    $('addKey').disabled = keys.length >= 10;
  }
  function alignmentSummary() {
    if (!tables.length) return 'Load tables to see their column alignment.';
    const selected = stackCols.filter(c => c.included), missing = selected.filter(c => c.sources.some(s => s < 0)).length;
    const unused = tables.flatMap((t, j) => {
      const used = new Set(selected.map(c => c.sources[j]));
      return t.headers.filter((_, i) => !used.has(i)).map(h => `${t.name}: ${h}`);
    });
    return `${selected.length} output columns. ${missing} ${missing === 1 ? 'has' : 'have'} blank cells for one or more tables.` + (unused.length ? `\nColumns not included (${unused.length}): ${unused.join('; ')}` : '\nAll source columns are included.');
  }
  function refresh() {
    clearOutput(); report = null; $('matchSummary').hidden = true; $('reportChoice').hidden = true;
    $('alignmentSummary').textContent = alignmentSummary();
    if (reading.size) { status('exportStatus', 'Reading files. Wait for loading to finish.'); return; }
    try {
      if (mode === 'stack') {
        if (tables.length < 2) { status('operationStatus', 'Add at least two tables to stack.'); status('exportStatus', 'Your result will appear here.'); return; }
        report = {merged: M.stack(tables, stackCols, $('sourceColumn').checked)};
        status('operationStatus', `Stacked ${tables.length} tables in the order shown. Column changes affect the output only.`);
      } else {
        if (!pair.every(Boolean)) { status('operationStatus', 'Load both tables to choose matching columns.'); status('exportStatus', 'Your result will appear here.'); return; }
        report = M.join(...pair, {keys, columns: matchCols, keep: $('keepRows').value, duplicates: $('duplicates').value, trim: $('trimKeys').checked, ignoreCase: $('ignoreCase').checked, status: $('matchStatus').checked});
        const s = report.stats; $('matchSummary').hidden = false; $('reportChoice').hidden = false;
        $('matchSummary').replaceChildren(...[[s.matchedA, 'First-table rows with a match'], [s.unmatchedA, 'Unmatched in first table'], [s.unmatchedB, 'Unmatched in second table'], [s.duplicateB, 'Repeated keys in second table']].map(([n, text]) => {
          const card = el('div'); card.append(el('strong', n.toLocaleString()), el('span', text)); return card;
        }));
        status('operationStatus', report.blocked || `${s.matchedA} ${s.matchedA === 1 ? 'row in the first table has' : 'rows in the first table have'} a matching key. Repeated key groups: ${s.duplicateA} in first, ${s.duplicateB} in second. Blank key rows: ${s.blankA} in first, ${s.blankB} in second.`, !!report.blocked);
      }
      renderResult();
    } catch (err) { clearOutput(); status('operationStatus', err.message, true); status('exportStatus', 'Resolve the settings above to create an export.', true); emit('merge_failed'); }
  }
  function renderResult() {
    clearOutput();
    const view = mode === 'stack' ? 'merged' : $('resultView').value;
    const table = report?.[view];
    if (!table) { status('exportStatus', report?.blocked ? 'Choose how to handle repeated keys, or select an unmatched-record report above.' : 'No result available.', !!report?.blocked); return; }
    try {
      latest = {...M.serialize(table, $('protect').checked, $('outputFormat').value || 'csv'), view};
      $('tablePreview').replaceChildren(tablePreview({headers: latest.preview.headers, rows: latest.preview.rows.map(data => ({data}))}));
      if (!table.rows.length) $('tablePreview').append(el('p', 'No rows in this result. You can download the headers.', 'empty'));
      $('textPreview').textContent = latest.text.slice(0, 30000) + (latest.text.length > 30000 ? '\n… Preview truncated; download or copy for the complete output.' : '');
      $('outputCount').textContent = `${table.rows.length.toLocaleString()} rows · ${table.headers.length} columns`;
      $('download').disabled = false; $('copy').disabled = false;
      status('exportStatus', `Ready to download ${table.rows.length.toLocaleString()} rows${view === 'merged' ? '.' : ` from the ${view === 'unmatchedA' ? 'first' : 'second'} table with no matching key.`}`);
    } catch (err) { clearOutput(); status('exportStatus', err.message, true); }
  }
  function switchMode() {
    cancelReads(); mode = $('modeMatch').checked ? 'match' : 'stack';
    $('stackInputs').hidden = $('stackOptions').hidden = mode !== 'stack';
    $('matchInputs').hidden = $('matchOptions').hidden = mode !== 'match';
    $('optionsTitle').textContent = mode === 'stack' ? 'Align columns' : 'Choose how records match';
    status('loadStatus', 'Choose files or paste CSV data. Switching tasks keeps already loaded tables for each task.'); refresh();
  }
  async function loadFiles(side, files) {
    if (!files.length) return;
    const token = ++tokens[side]; reading.add(side); refresh();
    status('loadStatus', 'Reading selected files…');
    try {
      if (side === 'stack' && tables.length + files.length > M.LIMITS.files) throw new Error('Stack up to 10 tables. Remove a table before adding more.');
      const active = side === 'stack' ? tables : pair.filter((_, i) => i !== (side === 'a' ? 0 : 1)).filter(Boolean);
      if (active.reduce((n, t) => n + t.bytes, 0) + files.reduce((n, f) => n + f.size, 0) > M.LIMITS.bytes) throw new Error('Combined inputs exceed 20 MiB.');
      if (files.some(f => f.size > window.CsvSuite.LIMITS.bytes)) throw new Error('Each file must be at most 5 MiB.');
      const loaded = [];
      for (const file of files) {
        const text = await file.text(); if (token !== tokens[side]) return;
        loaded.push(M.parse(text, file.name));
      }
      if (token !== tokens[side]) return;
      applyLoaded(side, loaded); status('loadStatus', 'Tables loaded. Column settings were reset; review the preview below.'); emit('merge_loaded');
    } catch (err) { if (token === tokens[side]) { status('loadStatus', `${err.message} Previously loaded data is still active.`, true); emit('merge_failed'); } }
    finally { if (token === tokens[side]) { reading.delete(side); refresh(); } }
  }
  function applyLoaded(side, loaded) {
    if (side === 'stack') {
      const next = [...tables, ...loaded]; M.checkInputs(next); const columns = M.stackColumns(next);
      tables = next; stackCols = columns; renderLoaded(); renderColumns('stack');
    } else {
      const i = side === 'a' ? 0 : 1, next = [...pair]; next[i] = loaded[0]; M.checkInputs(next.filter(Boolean));
      pair = next; pairChanged();
    }
  }
  function loadPaste(side) {
    tokens[side]++; reading.delete(side);
    const id = side === 'stack' ? 'stackText' : side + 'Text';
    try {
      const name = side === 'stack' ? ($('stackName').value.trim() || 'Pasted table') : `${side === 'a' ? 'First' : 'Second'} pasted table`;
      applyLoaded(side, [M.parse($(id).value, name)]); $(id).value = '';
      status('loadStatus', 'Pasted table loaded. Column settings were reset; review the preview below.'); emit('merge_loaded');
    } catch (err) { status('loadStatus', `${err.message} Previously loaded data is still active.`, true); emit('merge_failed'); }
    refresh();
  }
  $('stackFiles').addEventListener('change', () => { const files = [...$('stackFiles').files]; $('stackFiles').value = ''; return loadFiles('stack', files); });
  $('addPaste').addEventListener('click', () => loadPaste('stack'));
  ['a', 'b'].forEach((side, i) => {
    $(side + 'File').addEventListener('change', () => { const files = [...$(side + 'File').files]; $(side + 'File').value = ''; return loadFiles(side, files); });
    $(side + 'Load').addEventListener('click', () => loadPaste(side));
    $(side + 'Remove').addEventListener('click', () => { tokens[side]++; reading.delete(side); pair[i] = null; $(side + 'Text').value = ''; pairChanged(); status('loadStatus', 'Table removed.'); $(side + 'File').focus(); });
  });
  $('addKey').addEventListener('click', () => { if (keys.length >= 10) return; keys.push({a: '', b: ''}); renderKeys(); refresh(); $(`key-a-${keys.length - 1}`).focus(); });
  ['modeStack', 'modeMatch'].forEach(id => $(id).addEventListener('change', switchMode));
  ['sourceColumn', 'keepRows', 'duplicates', 'trimKeys', 'ignoreCase', 'matchStatus'].forEach(id => $(id).addEventListener('change', refresh));
  $('outputFormat').addEventListener('change', renderResult); $('protect').addEventListener('change', renderResult); $('resultView').addEventListener('change', renderResult);
  $('example').addEventListener('click', () => {
    cancelReads();
    if (mode === 'stack') {
      tables = [M.parse('Product,Units\nNotebook,12\nPencil,30', 'January.csv'), M.parse('Units,Product,Region\n9,Notebook,North\n24,Pencil,South', 'February.csv')]; stackChanged();
      $('stackText').value = '';
    } else {
      pair = [M.parse('Order ID,Customer ID,Total\n001,C01,24.50\n002,C02,18.00\n003,C04,12.00', 'Orders.csv'), M.parse('Customer ID,Name,Email\nC01,Asha,asha@example.com\nC02,Ben,ben@example.com\nC03,Chris,chris@example.com', 'Customers.csv')];
      $('keepRows').value = 'left'; $('duplicates').value = 'stop'; $('trimKeys').checked = $('ignoreCase').checked = false; $('matchStatus').checked = true;
      $('aText').value = $('bText').value = ''; pairChanged();
    }
    status('loadStatus', 'Example loaded for the selected task. Replace it with your own CSV files when ready.'); emit('merge_loaded');
  });
  $('reset').addEventListener('click', () => {
    cancelReads(); tables = []; pair = [null, null]; stackCols = []; matchCols = []; keys = []; report = null;
    ['stackText', 'aText', 'bText', 'stackFiles', 'aFile', 'bFile'].forEach(id => { $(id).value = ''; });
    ['stackPastePanel', 'aPastePanel', 'bPastePanel', 'stackAlignment'].forEach(id => { $(id).open = false; });
    $('stackName').value = 'Pasted table'; $('sourceColumn').checked = $('trimKeys').checked = $('ignoreCase').checked = false;
    $('keepRows').value = 'left'; $('duplicates').value = 'stop'; $('resultView').value = 'merged'; $('matchStatus').checked = $('protect').checked = true;
    $('matchControls').disabled = true; renderLoaded(); renderKeys(); renderColumns('stack'); renderColumns('match'); refresh(); status('loadStatus', 'All data cleared from both tasks.'); emit('merge_cleared');
  });
  $('copy').addEventListener('click', async () => {
    if (!latest) return; const output = latest;
    try { await navigator.clipboard.writeText(output.text); if (latest === output) status('exportStatus', 'Output copied to clipboard.'); emit('merge_copied'); }
    catch { if (latest === output) status('exportStatus', 'Copy failed. Download the output instead.', true); }
  });
  $('download').addEventListener('click', () => {
    if (!latest) return;
    const url = URL.createObjectURL(new Blob([latest.text], {type: latest.mime})), a = el('a');
    a.href = url; a.download = mode === 'stack' ? `stacked-tables.${latest.extension}` : `${latest.view === 'merged' ? 'matched-tables' : latest.view === 'unmatchedA' ? 'unmatched-first-table' : 'unmatched-second-table'}.${latest.extension}`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    status('exportStatus', 'Download started.'); emit('merge_downloaded');
  });
  $('alignmentSummary').classList.add('alignment-warning'); renderLoaded(); refresh(); emit('tool_opened');
})();
