(() => {
  'use strict';
  const ids = ['leftName', 'rightName', 'leftText', 'rightText', 'leftCount', 'rightCount', 'bothCount', 'leftOnlyCount', 'rightOnlyCount', 'resultTitle', 'output', 'copyBtn', 'downloadBtn', 'clearBtn', 'status', 'outputFormat', 'formatHelp', 'cleanupPreview', 'cleanupState', 'frequencyPreview', ...Object.keys(ListComparison.cleanupDefaults), ...Object.keys(ListComparison.defaults)];
  const els = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  const modes = [...document.querySelectorAll('[data-mode]')];
  let mode = 'both', output = '', timer, exportReady = false, revision = 0;
  function emit(name) { try { globalThis.DataTransformEvents?.emit(name, {}, 'list-comparison'); } catch {} }
  function status(message, error = false) { els.status.textContent = message; els.status.classList.toggle('error', error); }
  function invalidate(message) {
    revision++; exportReady = false; output = ''; els.output.textContent = ''; els.cleanupPreview.textContent = ''; els.frequencyPreview.replaceChildren(); els.frequencyPreview.hidden = true; els.output.hidden = false; els.copyBtn.disabled = els.downloadBtn.disabled = true;
    for (const id of ['leftCount', 'rightCount', 'bothCount', 'leftOnlyCount', 'rightOnlyCount']) els[id].textContent = '—';
    status(message);
  }
  function compare() {
    clearTimeout(timer);
    try {
      const settings = Object.fromEntries(Object.keys(ListComparison.defaults).map(id => [id, els[id].checked]));
      const cleanup = Object.fromEntries(Object.entries(ListComparison.cleanupDefaults).map(([id, value]) => [id, typeof value === 'boolean' ? els[id].checked : els[id].value]));
      const activeSteps = ['prefix', 'suffix', 'replaceEnabled', 'collapseWhitespace', 'unicodeNormalize'].filter(id => cleanup[id]).length;
      els.cleanupState.textContent = activeSteps ? `${activeSteps} active ${activeSteps === 1 ? 'step' : 'steps'}` : 'off';
      const result = ListComparison.compare(els.leftText.value, els.rightText.value, settings, cleanup);
      const listView = !['all', 'frequency'].includes(mode);
      els.outputFormat.disabled = !listView;
      if (!listView) els.outputFormat.value = 'report';
      els.formatHelp.textContent = listView ? 'Items only removes headings and counts; each item ends with a line break.' : 'Items-only export is not available in this view.';
      els.cleanupPreview.textContent = ['left', 'right'].map(side => `${side === 'left' ? 'Left' : 'Right'} list (first 3 lines):\n` + result.preview[side].map(row => `${JSON.stringify(row.before).slice(0, 300)} → ${JSON.stringify(row.after).slice(0, 300)}`).join('\n')).join('\n\n');
      const text = ListComparison.report(result, mode, els.leftName.value, els.rightName.value, undefined, els.outputFormat.value);
      for (const id of ['leftCount', 'rightCount']) els[id].textContent = `${result[id]} items`;
      for (const key of ['both', 'leftOnly', 'rightOnly']) els[key + 'Count'].textContent = String(result[key].length);
      const titles = { both: 'Items in both lists', leftOnly: `Items only in ${els.leftName.value.trim() || 'Left List'}`, rightOnly: `Items only in ${els.rightName.value.trim() || 'Right List'}`, all: 'Full comparison report', union: 'Merged distinct list', differences: 'Items exclusive to either list', frequency: 'Frequency comparison' };
      els.resultTitle.textContent = titles[mode];
      const hasInput = els.leftText.value !== '' || els.rightText.value !== '';
      revision++; output = hasInput ? text : ''; exportReady = hasInput;
      els.output.textContent = output.slice(0, 30000);
      els.frequencyPreview.replaceChildren();
      els.frequencyPreview.hidden = mode !== 'frequency' || !hasInput;
      els.output.hidden = !els.frequencyPreview.hidden;
      if (!els.frequencyPreview.hidden) {
        const table = document.createElement('table'), head = document.createElement('thead'), body = document.createElement('tbody');
        const heading = document.createElement('tr');
        for (const text of ['Item (JSON string)', 'Left count', 'Right count', 'Difference (left minus right)']) {
          const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = text; heading.append(cell);
        }
        head.append(heading);
        for (const row of result.frequency.slice(0, 100)) {
          const line = document.createElement('tr');
          for (const value of [JSON.stringify(row.item).slice(0, 300), row.left, row.right, row.difference]) {
            const cell = document.createElement('td'); cell.textContent = String(value); line.append(cell);
          }
          body.append(line);
        }
        table.append(head, body); els.frequencyPreview.append(table);
      }
      els.copyBtn.disabled = els.downloadBtn.disabled = !hasInput;
      status(hasInput ? (output.length > 30000 ? 'Comparison complete. Preview limited to 30,000 characters; copy and export include the full report.' : 'Comparison complete.') : 'Paste two lists to begin.');
      if (hasInput && mode === 'frequency') status('Comparison complete. Table shows up to 100 items and 300 characters per item; copy and export include all items and complete values.');
      if (hasInput) emit('list_compared');
    } catch (error) {
      invalidate(''); status(error.message, true); emit('list_failed');
    }
  }
  function schedule() {
    clearTimeout(timer); invalidate('Updating comparison…'); timer = setTimeout(compare, 180);
  }
  for (const id of ['leftName', 'rightName', 'leftText', 'rightText', 'outputFormat', ...Object.keys(ListComparison.cleanupDefaults), ...Object.keys(ListComparison.defaults)]) els[id].addEventListener('input', schedule);
  for (const button of modes) button.addEventListener('click', () => {
    mode = button.dataset.mode;
    for (const item of modes) item.setAttribute('aria-pressed', String(item === button));
    compare();
  });
  els.copyBtn.addEventListener('click', async () => {
    if (!exportReady) return;
    const copiedRevision = revision;
    try {
      await navigator.clipboard.writeText(output);
      if (copiedRevision === revision) { status('Copied output.'); emit('list_copied'); }
    } catch { if (copiedRevision === revision) { status('Copy failed. Use Export .txt to save the report.', true); emit('list_failed'); } }
  });
  els.downloadBtn.addEventListener('click', () => {
    if (!exportReady) return;
    try {
      const url = URL.createObjectURL(new Blob([output], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = `list-comparison-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status('Exported text file.'); emit('list_downloaded');
    } catch { status('Export failed. Try copying the report.', true); emit('list_failed'); }
  });
  els.clearBtn.addEventListener('click', () => {
    if ((els.leftText.value || els.rightText.value) && !confirm('Clear both pasted lists?')) return;
    clearTimeout(timer); els.leftText.value = els.rightText.value = ''; compare(); els.leftText.focus(); emit('list_cleared');
  });
  compare(); emit('tool_opened');
})();
