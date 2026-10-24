(function () {
  'use strict';
  const M = window.CsvToJson, $ = id => document.getElementById(id);
  let generation = 0, worker = null, deadline = null, debounce = null, reading = false, latest = null;
  function emit(name) { try { window.DataTransformEvents?.emit(name, {}, 'csv-to-json'); } catch {} }
  function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
  function clearResult() {
    latest = null;
    $('copyBtn').disabled = $('downloadBtn').disabled = true;
    $('output').textContent = '';
    $('stats').textContent = 'No result yet';
    $('errors').replaceChildren();
  }
  function cancel() {
    generation++;
    clearTimeout(deadline); clearTimeout(debounce);
    worker?.terminate(); worker = null; reading = false;
    $('convertBtn').disabled = false;
    $('resultPanel').setAttribute('aria-busy', 'false');
    clearResult();
  }
  function syncOptions() {
    $('fieldsColumn').disabled = $('omitEmpty').disabled = !$('splitFields').checked;
    $('arrayNameGroup').hidden = $('outputMode').value !== 'js';
    $('downloadBtn').textContent = $('outputMode').value === 'js' ? 'Download JavaScript' : 'Download JSON';
  }
  function fail(message) { clearResult(); status(message, true); emit('conversion_failed'); }
  function receive(id, message) {
    if (id !== generation) return;
    clearTimeout(deadline); worker?.terminate(); worker = null;
    $('resultPanel').setAttribute('aria-busy', 'false');
    if (message.error) { fail(message.error); return; }
    latest = message.result;
    const {text, count, columns, warnings} = latest;
    $('output').textContent = text.slice(0, 30000) + (text.length > 30000 ? '\n… Preview truncated. Copy or download for the complete output.' : '');
    $('stats').textContent = `${count.toLocaleString()} ${count === 1 ? 'row' : 'rows'} · ${columns} ${columns === 1 ? 'column' : 'columns'}`;
    $('errors').replaceChildren(...warnings.map(message => { const li = document.createElement('li'); li.textContent = message; return li; }));
    $('copyBtn').disabled = $('downloadBtn').disabled = false;
    status(count ? (warnings.length ? 'Converted. Review the notes below.' : 'Converted successfully.') : 'No data rows. The output is an empty array.');
    emit('conversion_completed');
  }
  function convert() {
    cancel(); syncOptions();
    const text = $('csvInput').value;
    if (!text) { status('Choose a CSV file or paste text first.', true); return; }
    if (text.length > M.LIMITS.bytes) { fail('CSV input exceeds 5 MiB. Choose a smaller file.'); return; }
    const id = generation;
    const options = {text, format: $('outputMode').value, variable: $('arrayName').value,
      indent: $('indentSize').value, split: $('splitFields').checked, splitColumn: $('fieldsColumn').value,
      trimValues: $('trimValues').checked, omitEmpty: $('omitEmpty').checked};
    status('Converting on your device…'); $('resultPanel').setAttribute('aria-busy', 'true');
    if (location.protocol === 'file:') {
      debounce = setTimeout(() => {
        if (id !== generation) return;
        try { receive(id, {result: M.convert(options)}); } catch (error) { receive(id, {error: error.message}); }
      }, 0);
      return;
    }
    try {
      worker = new Worker('../csv-to-json/converter-worker.js');
      worker.onmessage = event => { if (event.data.id === id) receive(id, event.data); };
      worker.onerror = () => { if (id === generation) { cancel(); fail('Background processing stopped. Convert again or try a smaller file.'); } };
      deadline = setTimeout(() => { if (id === generation) { cancel(); fail('Conversion exceeded 20 seconds. Try a smaller file.'); } }, 20000);
      worker.postMessage({id, options});
    } catch { cancel(); fail('This browser could not start background processing. Try a current browser.'); }
  }
  $('csvFile').addEventListener('change', async () => {
    const file = $('csvFile').files[0]; $('csvFile').value = '';
    if (!file) return;
    cancel(); const id = generation; reading = true; $('convertBtn').disabled = true;
    // Remove the previous source as soon as replacement starts, including failed reads.
    $('csvInput').value = ''; status(`Reading ${file.name}…`);
    if (file.size > M.LIMITS.bytes) { reading = false; $('convertBtn').disabled = false; fail('CSV input exceeds 5 MiB. Choose a smaller file.'); return; }
    try {
      const bytes = await file.arrayBuffer(); if (id !== generation) return;
      const text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
      $('csvInput').value = text; reading = false; emit('conversion_loaded'); convert();
    } catch { if (id === generation) { reading = false; $('convertBtn').disabled = false; fail('Could not read the file as UTF-8. Choose a UTF-8 CSV file.'); } }
  });
  $('csvInput').addEventListener('input', () => { cancel(); status('Source changed. Select Convert to update the output.'); });
  $('convertBtn').addEventListener('click', convert);
  function settingsChanged() {
    syncOptions();
    // An outstanding file read uses the current settings when it completes.
    if (reading) return;
    cancel();
    if ($('csvInput').value) { status('Settings changed. Updating the output…'); debounce = setTimeout(convert, 150); }
    else status('Choose a CSV file or paste text to begin.');
  }
  for (const id of ['fieldsColumn', 'arrayName']) $(id).addEventListener('input', settingsChanged);
  for (const id of ['splitFields', 'trimValues', 'omitEmpty', 'outputMode', 'indentSize']) $(id).addEventListener('change', settingsChanged);
  $('clearBtn').addEventListener('click', () => {
    cancel(); $('csvFile').value = $('csvInput').value = '';
    $('splitFields').checked = false; $('trimValues').checked = $('omitEmpty').checked = true;
    $('fieldsColumn').value = 'fields'; $('arrayName').value = 'data'; $('outputMode').value = 'json'; $('indentSize').value = '2';
    syncOptions(); status('All data cleared.'); emit('conversion_cleared');
  });
  $('exampleBtn').addEventListener('click', () => {
    $('csvFile').value = '';
    $('csvInput').value = 'id,name,fields\r\n001,Asha,"name, date, status"\r\n002,"Ben ""B""","name, status"\r\n003,Chloé,"date, ,status,"';
    $('splitFields').checked = true; $('fieldsColumn').value = 'fields';
    $('trimValues').checked = $('omitEmpty').checked = true;
    emit('conversion_loaded'); convert();
  });
  $('copyBtn').addEventListener('click', async () => {
    const result = latest; if (!result) return;
    try { await navigator.clipboard.writeText(result.text); if (latest === result) status('Output copied to clipboard.'); emit('conversion_copied'); }
    catch { if (latest === result) status('Copy failed. Download the complete output instead.', true); }
  });
  $('downloadBtn').addEventListener('click', () => {
    const result = latest; if (!result) return;
    const url = URL.createObjectURL(new Blob([result.text], {type: result.mime}));
    const a = document.createElement('a'); a.href = url; a.download = `converted-data.${result.extension}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status(`Downloaded converted-data.${result.extension}.`); emit('conversion_downloaded');
  });
  syncOptions(); clearResult(); emit('tool_opened');
})();
