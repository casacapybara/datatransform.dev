(() => {
  'use strict';
  const $ = id => document.getElementById(id), M = globalThis.BitwiseModel;
  const emit = name => { try { globalThis.DataTransformEvents?.emit(name, {}, 'bitwise-flag-decoder'); } catch { /* Optional hooks cannot stop the tool. */ } };
  if (!M || typeof BigInt !== 'function') {
    $('decodeStatus').hidden = false;
    $('decodeStatus').dataset.kind = 'error';
    $('decodeStatusIcon').setAttribute('d', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M8.5 8.5l7 7 M15.5 8.5l-7 7');
    $('decodeStatusText').textContent = 'This tool needs a browser with support for large integers. Update your browser to use it.'; return;
  }
  let width = 64, names = new Map(), value = 0n, pendingNames = null, revision = 0, loadSequence = 0;
  let copyText = '';
  const rows = new Map();
  const statusIcons = {
    success: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M7 12l3 3 7-7',
    error: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M8.5 8.5l7 7 M15.5 8.5l-7 7',
    info: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M12 11v6 M12 7v.2',
  };
  function status(id, text, kind = 'info') {
    $(id).hidden = !text;
    $(id).dataset.kind = kind;
    $(id).classList.toggle('error', kind === 'error');
    $(`${id}Icon`).setAttribute('d', statusIcons[kind]);
    $(`${id}Kind`).textContent = text ? `${kind === 'error' ? 'Error' : kind === 'success' ? 'Success' : 'Information'}: ` : '';
    $(`${id}Text`).textContent = text;
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
    $('downloadResult').disabled = $('copyResult').disabled = !valid;
    copyText = valid ? [`Decimal: ${value}`, `Hex: 0x${value.toString(16).toUpperCase()}`, `Binary: 0b${value.toString(2)}`, '', ...bits.map(bit => `Bit ${bit} (${1n << BigInt(bit)}): ${names.get(bit) || 'Unnamed'}`), ...(bits.length ? [] : ['No bits are enabled.'])].join('\n') : '';
    updateTextPreview();
  }
  function updateTextPreview() {
    $('textPreview').textContent = '';
    if (value !== null) {
      try {
        const text = resultExport().text;
        $('textPreview').textContent = text.slice(0, 30000) + (text.length > 30000 ? '\n… Preview truncated; download or copy for the complete output.' : '');
      } catch (error) { status('copyStatus', error.message, 'error'); }
    }
    try {
      const text = JSON.stringify(M.configuration($('configName').value, width, names), null, 2) + '\n';
      $('configPreview').textContent = text.slice(0, 30000) + (text.length > 30000 ? '\n… Preview truncated; download or copy for the complete output.' : '');
    } catch (error) { $('configPreview').textContent = error.message; }
  }
  function decode() {
    try {
      value = M.parseValue($('inputValue').value, width);
      $('inputValue').setAttribute('aria-invalid', 'false');
      status('decodeStatus', value === null ? 'Enter a value or select Clear to start at zero.' : `${M.enabledBits(value, width).length} bits enabled within bits 0–${width - 1}.`, value === null ? 'info' : 'success');
    } catch (error) {
      value = null; $('inputValue').setAttribute('aria-invalid', 'true'); status('decodeStatus', error.message, 'error'); emit('bitwise_failed');
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
    } catch (error) { status('bulkStatus', error.message, 'error'); }
  }
  function download(text, filename, mime = 'application/json') {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
    document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('inputValue').addEventListener('input', () => { changed(); status('copyStatus', ''); decode(); });
  $('example').addEventListener('click', () => {
    changed(); loadSequence++;
    width = 8; names = new Map([[0, 'Read'], [1, 'Write'], [2, 'Execute'], [3, 'Admin']]);
    $('inputValue').value = '11'; $('bitWidth').value = '8'; $('configName').value = 'Example permissions';
    $('bulkNames').value = ''; $('pasteFormat').value = 'names'; $('startBit').value = '0';
    $('startBitGroup').hidden = false; $('tableFilter').value = 'all';
    buildTable(); decode(); updateBulkPreview(); status('copyStatus', '');
    status('configStatus', 'Example loaded. Value 11 enables Read, Write and Admin. Toggle a bit or edit a name to try it.', 'success');
  });
  $('clearValue').addEventListener('click', () => { changed(); $('inputValue').value = '0'; status('copyStatus', ''); decode(); emit('bitwise_cleared'); });
  $('bitWidth').addEventListener('change', () => {
    const nextWidth = Number($('bitWidth').value);
    if (Array.from(names).some(([bit, name]) => bit >= nextWidth && name !== '')) {
      $('bitWidth').value = String(width);
      status('configStatus', 'Clear flag names above the new width before reducing it. Your names have been kept.', 'error'); return;
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
    refreshResult(); status('copyStatus', ''); $('bulkNames').value = ''; updateBulkPreview(); status('bulkStatus', `Applied ${count} flag names.`, 'success'); emit('bitwise_names_applied');
  });
  $('configName').addEventListener('input', () => { changed(); updateTextPreview(); });
  $('clearNames').addEventListener('click', () => {
    changed(); names.clear(); $('configName').value = ''; buildTable(); refreshResult(); status('copyStatus', ''); status('configStatus', 'Flag names cleared. The value and width have been kept.', 'success');
  });
  $('copyConfig').addEventListener('click', async () => {
    const request = revision;
    try {
      await navigator.clipboard.writeText(JSON.stringify(M.configuration($('configName').value, width, names), null, 2) + '\n');
      if (request === revision) status('configStatus', 'Configuration JSON copied.', 'success');
    } catch { if (request === revision) status('configStatus', 'Copy failed. Download the configuration instead.', 'error'); }
  });
  $('downloadConfig').addEventListener('click', () => {
    try {
      const data = M.configuration($('configName').value, width, names);
      const slug = data.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'flag-configuration';
      download(JSON.stringify(data, null, 2) + '\n', slug + '.json'); status('configStatus', 'Configuration downloaded. It contains names and width, without the decoded value.', 'success'); emit('bitwise_configuration_saved');
    } catch (error) { status('configStatus', error.message, 'error'); }
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
      status('configStatus', 'Configuration loaded. Your input value has been kept; check the result if the width changed.', 'success'); emit('bitwise_configuration_loaded');
    } catch (error) { if (request === revision && sequence === loadSequence) { status('configStatus', error.message + ' Your configuration has been kept.', 'error'); emit('bitwise_failed'); } }
  });
  function resultExport() {
    const format = $('resultFormat').value || 'txt';
    if (format === 'txt') return {text:copyText, extension:'txt', mime:'text/plain;charset=utf-8'};
    const bits = Array.from({length:width}, (_, bit) => [value.toString(), String(width), String(bit), (1n << BigInt(bit)).toString(), names.get(bit) || '', String((value & (1n << BigInt(bit))) !== 0n)]);
    return CsvSuite.serialize(['Value','Bit width','Bit','Mask','Name','Enabled'], bits.map(data => ({data})), {format,protect:true});
  }
  $('resultFormat').addEventListener('change', () => { changed(); status('copyStatus', ''); updateTextPreview(); });
  $('downloadResult').addEventListener('click', () => {
    if (value === null) return;
    try { const result = resultExport(); download(result.text, 'bitwise-result.' + result.extension, result.mime); status('copyStatus', 'Result downloaded.', 'success'); }
    catch (error) { status('copyStatus', error.message, 'error'); }
  });
  $('copyResult').addEventListener('click', async () => {
    if (value === null) return;
    const request = revision;
    try {
      await navigator.clipboard.writeText(resultExport().text); if (request === revision) status('copyStatus', 'Result copied.', 'success'); emit('bitwise_copied');
    } catch { if (request === revision) status('copyStatus', 'Clipboard access is unavailable. Select and copy the result text manually.', 'error'); }
  });
  buildTable(); decode(); updateBulkPreview(); emit('tool_opened');
})();
