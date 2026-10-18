(function () {
  'use strict';
  const M = TableComparison, $ = id => document.getElementById(id);
  let tables = null, mappings = [], result = null, view = 'changed', page = 0;
  const versions = {original: 0, updated: 0}, pending = new Set();
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function status(id, text, error = false) { $(id).textContent = text; $(id).classList.toggle('error', error); }
  function invalidateResult() {
    result = null; $('textPreview').textContent = ''; $('results').hidden = true; $('copy').disabled = $('download').disabled = true;
    $('preview').replaceChildren(); status('compareStatus', ''); status('downloadStatus', '');
  }
  function invalidateTables() {
    invalidateResult(); tables = null; mappings = [];
    $('mappingControls').hidden = true; $('mappingControls').disabled = true;
    $('mappingEmpty').hidden = false; $('mappings').replaceChildren(); $('compare').disabled = true;
  }
  function syncLoad() { $('load').disabled = pending.size > 0; }
  for (const side of ['original', 'updated']) {
    $(side + 'Text').addEventListener('input', () => {
      versions[side]++; pending.delete(side); syncLoad();
      $(side + 'File').value = ''; invalidateTables();
      status(side + 'Summary', 'Edited CSV. Load tables to review columns.');
      status('loadStatus', 'Inputs changed. Load both tables again before comparing.');
    });
    $(side + 'File').addEventListener('change', async () => {
      const file = $(side + 'File').files[0];
      if (!file) return;
      const version = ++versions[side];
      invalidateTables(); $(side + 'Text').value = '';
      pending.add(side); syncLoad(); status('loadStatus', 'Reading selected CSV…');
      try {
        if (file.size > M.LIMITS.bytes) throw new Error('CSV input exceeds 5 MiB. Split the file into smaller parts.');
        const text = await file.text();
        if (version !== versions[side]) return;
        $(side + 'Text').value = text;
        status(side + 'Summary', 'File read. Load tables to review columns.');
        status('loadStatus', 'File ready. Load tables to review columns.');
      } catch (error) {
        if (version === versions[side]) { status('loadStatus', error.message, true); status(side + 'Summary', 'File could not be loaded.', true); }
      } finally {
        if (version === versions[side]) { pending.delete(side); syncLoad(); }
      }
    });
  }
  function load() {
    if (pending.size) return;
    invalidateTables();
    const loaded = {};
    try {
      for (const side of ['original', 'updated']) {
        try { loaded[side] = M.parse($(side + 'Text').value); }
        catch (error) { status(side + 'Summary', error.message, true); throw new Error(`${side === 'original' ? 'Original' : 'Updated'}: ${error.message}`); }
        const t = loaded[side];
        status(side + 'Summary', `${t.rows.length.toLocaleString()} records · ${t.headers.length} columns. ${t.warnings.join(' ')}`);
      }
      tables = loaded; mappings = M.align(tables.original, tables.updated);
      renderMappings(); $('mappingControls').hidden = false; $('mappingControls').disabled = false;
      $('mappingEmpty').hidden = true; $('compare').disabled = false;
      status('loadStatus', 'Tables loaded. Review column matches and select the identifying columns.');
    } catch (error) { status('loadStatus', error.message, true); }
  }
  function ignored() {
    const pairs = mappings.filter(p => p.right >= 0);
    const left = tables.original.headers.filter((_, i) => !pairs.some(p => p.left === i));
    const right = tables.updated.headers.filter((_, i) => !pairs.some(p => p.right === i));
    $('ignored').textContent = `Ignored original columns: ${left.length ? left.join(', ') : 'none'}. Ignored updated columns: ${right.length ? right.join(', ') : 'none'}.`;
  }
  function renderMappings() {
    $('mappings').replaceChildren();
    for (const mapping of mappings) {
      const name = tables.original.headers[mapping.left], row = element('tr');
      const select = element('select', undefined, 'control'); select.setAttribute('aria-label', `Updated column matching ${name}`);
      const option = element('option', 'Do not compare'); option.value = '-1'; select.append(option);
      tables.updated.headers.forEach((header, i) => { const option = element('option', short(header)); option.value = String(i); select.append(option); });
      select.value = String(mapping.right);
      const checkbox = element('input'); checkbox.type = 'checkbox'; checkbox.checked = mapping.key;
      checkbox.disabled = mapping.right < 0;
      const label = element('label'); label.append(checkbox, document.createTextNode('Use as key'));
      checkbox.setAttribute('aria-label', `${name} identifies records`);
      select.addEventListener('change', () => {
        invalidateResult(); mapping.right = Number(select.value);
        if (mapping.right < 0) { mapping.key = false; checkbox.checked = false; }
        checkbox.disabled = mapping.right < 0; ignored();
      });
      checkbox.addEventListener('change', () => { mapping.key = checkbox.checked; invalidateResult(); });
      const right = element('td'), key = element('td'); right.append(select); key.append(label);
      row.append(element('td', short(name)), right, key); $('mappings').append(row);
    }
    ignored();
  }
  $('load').addEventListener('click', load);
  $('compare').addEventListener('click', () => {
    invalidateResult();
    if (!tables || pending.size) return;
    try {
      result = M.compare(tables.original, tables.updated, mappings);
      const s = result.summary;
      $('summary').textContent = `${s.added.toLocaleString()} added · ${s.removed.toLocaleString()} removed · ${s.changed.toLocaleString()} changed ${s.changed === 1 ? 'record' : 'records'} (${s.changedCells.toLocaleString()} ${s.changedCells === 1 ? 'cell' : 'cells'}) · ${s.unchanged.toLocaleString()} unchanged`;
      $('results').hidden = false; $('copy').disabled = $('download').disabled = false; page = 0;
      status('compareStatus', s.added + s.removed + s.changed === 0 ? 'No differences in the matched columns.' : 'Comparison complete. Review the changes below or download the report.');
      render(); updateTextPreview();
    } catch (error) { status('compareStatus', error.message, true); }
  });
  function short(value) { const text = String(value); return text.length > 300 ? text.slice(0, 300) + '… [shortened; full value in download]' : text === '' ? '(empty)' : text; }
  function render() {
    if (!result) return;
    for (const button of document.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed', String(button.dataset.view === view));
    const items = result[view], start = page * 50, end = Math.min(start + 50, items.length);
    $('pageCount').textContent = items.length ? `${start + 1}–${end} of ${items.length.toLocaleString()}` : '0 records';
    $('previous').disabled = page === 0; $('next').disabled = end >= items.length;
    $('viewHelp').textContent = view === 'changed' ? 'Each changed record shows its identifying values, source record numbers, and changed cells. Before and After labels show the direction of each change.' : `${view === 'added' ? 'Present only in Updated' : 'Present only in Original'}. All source columns are shown, including ignored columns.`;
    const preview = $('preview'); preview.replaceChildren();
    if (!items.length) { preview.append(element('p', `No ${view} records.`, 'empty-result')); return; }
    const table = element('table', undefined, view === 'changed' ? 'changed-table' : ''), head = element('thead'), hr = element('tr'), body = element('tbody');
    const side = view === 'added' ? 'updated' : 'original';
    const headers = view === 'changed' ? ['Identifying values', 'Original record', 'Updated record', 'Changed cells'] : ['Source record', ...result.headers[side]];
    for (const name of headers) { const th = element('th', short(name)); th.scope = 'col'; hr.append(th); }
    head.append(hr); table.append(head, body);
    for (const item of items.slice(start, end)) {
      const row = element('tr');
      if (view === 'changed') {
        row.append(element('td', short(JSON.stringify(item.key)), 'record-key'), element('td', String(item.original.record)), element('td', String(item.updated.record)));
        const changes = element('td');
        for (const cell of item.cells) {
          const change = element('div', undefined, 'cell-change');
          change.append(element('strong', short(cell.originalColumn === cell.updatedColumn ? cell.originalColumn : `${cell.originalColumn} → ${cell.updatedColumn}`)));
          change.append(element('span', 'Before', 'value-label'), element('div', short(cell.before), 'cell-value before-value'), element('span', 'After', 'value-label'), element('div', short(cell.after), 'cell-value after-value'));
          changes.append(change);
        }
        row.append(changes);
      } else row.append(...[String(item.record), ...item.data].map(value => element('td', short(value))));
      Array.from(row.children).forEach((cell, index) => cell.setAttribute('data-label', headers[index]));
      body.append(row);
    }
    preview.append(table);
  }
  for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => { view = button.dataset.view; page = 0; render(); });
  $('previous').addEventListener('click', () => { if (page > 0) { page--; render(); } });
  $('next').addEventListener('click', () => { if (result && (page + 1) * 50 < result[view].length) { page++; render(); } });
  function updateTextPreview() {
    $('textPreview').textContent = '';
    if (!result) return;
    try {
      const text = M.report(result, $('format').value);
      $('textPreview').textContent = text.slice(0, 30000) + (text.length > 30000 ? '\n… Preview truncated; download or copy for the complete output.' : '');
    } catch (error) { status('downloadStatus', error.message, true); }
  }
  $('format').addEventListener('change', () => { status('downloadStatus', ''); updateTextPreview(); });
  $('copy').addEventListener('click', async () => {
    if (!result) return;
    const snapshot = result;
    try { await navigator.clipboard.writeText(M.report(snapshot, $('format').value)); if (result === snapshot) status('downloadStatus', 'Report copied to clipboard.'); }
    catch { if (result === snapshot) status('downloadStatus', 'Copy failed. Download the report instead.', true); }
  });
  $('download').addEventListener('click', () => {
    if (!result) return;
    try {
      const format = $('format').value, text = M.report(result, format);
      const blob = new Blob([text], {type: ({csv:'text/csv',json:'application/json',txt:'text/plain',md:'text/markdown'}[format]) + ';charset=utf-8'});
      const url = URL.createObjectURL(blob), link = element('a');
      link.href = url; link.download = `table-comparison.${format}`; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status('downloadStatus', 'Report downloaded.');
    } catch (error) { status('downloadStatus', `Download failed: ${error.message}`, true); }
  });
  function clear() {
    for (const side of ['original', 'updated']) {
      versions[side]++; $(side + 'Text').value = ''; $(side + 'File').value = ''; status(side + 'Summary', 'No table loaded.');
    }
    pending.clear(); syncLoad(); invalidateTables(); status('loadStatus', 'Choose files or paste CSV data to begin.');
  }
  $('clear').addEventListener('click', () => { clear(); $('originalText').focus(); });
  $('example').addEventListener('click', () => {
    clear();
    $('originalText').value = 'id,name,status\n001,Ada,Active\n002,Sam,Pending\n003,Lee,Active';
    $('updatedText').value = 'status,customer_id,name\nApproved,002,Sam\nActive,004,Robin\nActive,001,Ada';
    load();
    mappings[0].right = 1; mappings[0].key = true; renderMappings();
    status('loadStatus', 'Example loaded: id matches customer_id and identifies each record. Compare to see one added, one removed and one changed record.');
  });
})();
