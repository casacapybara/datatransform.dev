(() => {
  'use strict';
  const $ = id => document.getElementById(id), M = globalThis.BitwiseModel;
  const emit = name => { try { globalThis.DataTransformEvents?.emit(name, {}, 'bitwise-flag-decoder'); } catch { /* Optional hooks cannot stop the tool. */ } };
  if (!M || typeof BigInt !== 'function') { $('decodeStatus').textContent = 'This tool needs a browser with support for large integers. Update your browser to use it.'; return; }
  let width = 64, names = new Map(), value = 0n, pendingNames = null, revision = 0, loadSequence = 0;
  let copyText = '';
  const rows = new Map();
  function status(id, text, error = false) {
    $(id).textContent = text; $(id).classList.toggle('error', error);
  }
  function changed() { revision++; }
  function buildTable() {
    $('flagsTableBody').replaceChildren(); rows.clear();
    for (let bit = 0; bit < width; bit++) {
      const row = document.createElement('tr'), checkbox = document.createElement('input'), name = document.createElement('textarea');
      row.dataset.bit = String(bit);
      checkbox.type = 'checkbox'; checkbox.dataset.bit = String(bit); checkbox.setAttribute('aria-label', `Enable bit ${bit}`);
      name.rows = 1; name.value = names.get(bit) || ''; name.maxLength = M.NAME_LIMIT;
      name.placeholder = 'Optional flag name'; name.dataset.bit = String(bit); name.className = 'flag-name';
      name.autocomplete = 'off'; name.setAttribute('aria-label', `Flag name for bit ${bit}`);
      const mask = 1n << BigInt(bit);
      const cells = [checkbox, String(bit), mask.toString(), '0x' + mask.toString(16).toUpperCase(), name];
      for (const content of cells) {
        const cell = document.createElement('td');
        if (typeof content === 'string') cell.textContent = content; else cell.append(content);
        row.append(cell);
      }
      rows.set(bit, { row, checkbox, name }); $('flagsTableBody').append(row);
    }
    $('tableRange').textContent = `Bits 0–${width - 1}. Bit 0 has value 1. Names are optional.`;
    $('startBit').max = String(width - 1);
  }
  function refreshResult() {
    const valid = value !== null;
    const bits = valid ? M.enabledBits(value, width) : [];
    $('resultDecimal').textContent = valid ? value.toString() : '—';
    $('resultHex').textContent = valid ? '0x' + value.toString(16).toUpperCase() : '—';
    $('resultBinary').textContent = valid ? '0b' + value.toString(2) : '—';
    $('enabledCount').textContent = valid ? `${bits.length} enabled ${bits.length === 1 ? 'bit' : 'bits'}` : 'No result';
    $('enabledFlags').replaceChildren();
    for (const bit of bits) {
      const item = document.createElement('li');
      item.textContent = `Bit ${bit} · ${names.get(bit) || 'Unnamed'} · ${(1n << BigInt(bit)).toString()}`;
      $('enabledFlags').append(item);
    }
    $('emptyFlags').hidden = bits.length > 0;
    $('emptyFlags').textContent = valid ? 'No bits are enabled.' : 'Enter a valid value to see enabled bits.';
    let visible = 0;
    for (const [bit, controls] of rows) {
      const enabled = bits.includes(bit);
      controls.checkbox.checked = enabled;
      controls.checkbox.disabled = !valid;
      controls.row.classList.toggle('flag-enabled', enabled);
      controls.row.hidden = $('tableFilter').value === 'enabled' && !enabled;
      if (!controls.row.hidden) visible++;
    }
    $('emptyTable').hidden = visible > 0;
    $('copyResult').disabled = !valid;
    copyText = valid ? [`Decimal: ${value}`, `Hex: 0x${value.toString(16).toUpperCase()}`, `Binary: 0b${value.toString(2)}`, '', ...bits.map(bit => `Bit ${bit} (${1n << BigInt(bit)}): ${names.get(bit) || 'Unnamed'}`), ...(bits.length ? [] : ['No bits are enabled.'])].join('\n') : '';
  }
  function decode() {
    try {
      value = M.parseValue($('inputValue').value, width);
      $('inputValue').setAttribute('aria-invalid', 'false');
      status('decodeStatus', value === null ? 'Enter a value or select Clear to start at zero.' : `${M.enabledBits(value, width).length} bits enabled within bits 0–${width - 1}.`);
    } catch (error) {
      value = null; $('inputValue').setAttribute('aria-invalid', 'true'); status('decodeStatus', error.message, true); emit('bitwise_failed');
    }
    refreshResult();
  }
  function updateBulkPreview() {
    pendingNames = null; $('applyNames').disabled = true; $('bulkPreview').textContent = '';
    if (!$('bulkNames').value) { status('bulkStatus', 'Paste rows to preview the changes. Blank names clear the corresponding label.'); return; }
    try {
      const start = $('startBit').value;
      if (!/^\d+$/.test(start)) throw new Error('Enter a whole number for the starting bit.');
      pendingNames = M.bulkNames($('bulkNames').value, $('pasteFormat').value, Number(start), width);
      $('bulkPreview').textContent = pendingNames.map(flag => `Bit ${flag.bit}: ${flag.name || '(clear name)'}`).join('\n');
      status('bulkStatus', `${pendingNames.length} names ready to apply. Other names and the current value stay as they are.`);
      $('applyNames').disabled = false;
    } catch (error) { status('bulkStatus', error.message, true); }
  }
  function download(text, filename) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
    document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('inputValue').addEventListener('input', () => { changed(); status('copyStatus', ''); decode(); });
  $('clearValue').addEventListener('click', () => { changed(); $('inputValue').value = '0'; status('copyStatus', ''); decode(); emit('bitwise_cleared'); });
  $('bitWidth').addEventListener('change', () => {
    const nextWidth = Number($('bitWidth').value);
    if (Array.from(names).some(([bit, name]) => bit >= nextWidth && name !== '')) {
      $('bitWidth').value = String(width);
      status('configStatus', 'Clear flag names above the new width before reducing it. Your names have been kept.', true); return;
    }
    changed(); width = nextWidth; buildTable(); decode(); updateBulkPreview(); status('configStatus', `Using ${width} bits.`);
  });
  $('flagsTableBody').addEventListener('change', event => {
    if (event.target.type !== 'checkbox') return;
    changed(); const mask = 1n << BigInt(event.target.dataset.bit);
    value = event.target.checked ? value | mask : value & ~mask;
    $('inputValue').value = value.toString(); status('copyStatus', ''); decode();
  });
  $('flagsTableBody').addEventListener('input', event => {
    if (!event.target.classList.contains('flag-name')) return;
    changed(); names.set(Number(event.target.dataset.bit), event.target.value); refreshResult(); status('copyStatus', '');
  });
  $('flagsTableBody').addEventListener('paste', event => {
    if (!event.target.classList.contains('flag-name')) return;
    const text = event.clipboardData?.getData('text/plain');
    if (!text || !/[\t\r\n]/.test(text)) return;
    event.preventDefault(); $('bulkEditor').open = true;
    $('pasteFormat').value = 'names'; $('startBit').value = event.target.dataset.bit;
    $('bulkNames').value = text; updateBulkPreview(); $('bulkNames').focus();
  });
  $('tableFilter').addEventListener('change', refreshResult);
  for (const id of ['bulkNames', 'pasteFormat', 'startBit']) $(id).addEventListener('input', updateBulkPreview);
  $('pasteFormat').addEventListener('change', () => { $('startBitGroup').hidden = $('pasteFormat').value === 'bits'; if ($('pasteFormat').value === 'bits') $('startBit').value = '0'; updateBulkPreview(); });
  $('applyNames').addEventListener('click', () => {
    updateBulkPreview(); if (!pendingNames) return;
    changed(); const count = pendingNames.length;
    for (const { bit, name } of pendingNames) { names.set(bit, name); rows.get(bit).name.value = name; }
    refreshResult(); status('copyStatus', ''); $('bulkNames').value = ''; updateBulkPreview(); status('bulkStatus', `Applied ${count} flag names.`); emit('bitwise_names_applied');
  });
  $('configName').addEventListener('input', changed);
  $('clearNames').addEventListener('click', () => {
    changed(); names.clear(); $('configName').value = ''; buildTable(); refreshResult(); status('copyStatus', ''); status('configStatus', 'Flag names cleared. The value and width have been kept.');
  });
  $('downloadConfig').addEventListener('click', () => {
    try {
      const data = M.configuration($('configName').value, width, names);
      const slug = data.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'flag-configuration';
      download(JSON.stringify(data, null, 2) + '\n', slug + '.json'); status('configStatus', 'Configuration downloaded. It contains names and width, without the decoded value.'); emit('bitwise_configuration_saved');
    } catch (error) { status('configStatus', error.message, true); }
  });
  $('configFile').addEventListener('change', async () => {
    const file = $('configFile').files[0]; $('configFile').value = ''; if (!file) return;
    const request = ++revision, sequence = ++loadSequence;
    status('configStatus', 'Reading configuration…');
    try {
      if (file.size > M.FILE_LIMIT) throw new Error('Configuration files must be at most 256 KiB.');
      const text = await file.text();
      if (sequence !== loadSequence) return;
      if (request !== revision) { status('configStatus', 'Loading cancelled because you edited the tool. Choose the file again to load it.'); return; }
      const data = M.readConfiguration(text);
      names = new Map(data.flags.map(flag => [flag.bit, flag.name])); width = data.bitWidth;
      $('configName').value = data.name; $('bitWidth').value = String(width);
      buildTable(); decode(); updateBulkPreview(); status('copyStatus', '');
      status('configStatus', 'Configuration loaded. Your input value has been kept; check the result if the width changed.'); emit('bitwise_configuration_loaded');
    } catch (error) { if (request === revision && sequence === loadSequence) { status('configStatus', error.message + ' Your configuration has been kept.', true); emit('bitwise_failed'); } }
  });
  $('copyResult').addEventListener('click', async () => {
    if (value === null) return;
    const request = revision;
    try {
      await navigator.clipboard.writeText(copyText); if (request === revision) status('copyStatus', 'Result copied.'); emit('bitwise_copied');
    } catch { if (request === revision) status('copyStatus', 'Clipboard access is unavailable. Select and copy the result text manually.', true); }
  });
  buildTable(); decode(); updateBulkPreview(); emit('tool_opened');
})();
