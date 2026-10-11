(() => {
  'use strict';
  const allowed = new Map([
    ['tool_opened', []], ['comparison_completed', ['result']],
    ['comparison_failed', ['reason']], ['input_cleared', ['side']],
    ['clipboard_pasted', ['side']], ['clipboard_failed', ['side']],
    ['difference_navigated', ['direction']],
  ]);
  const values = {
    result: ['identical', 'different'], reason: ['input_limit', 'unavailable', 'processing'],
    side: ['original', 'updated'], direction: ['previous', 'next'],
  };
  // Inactive by default. A future reviewed provider can listen for this event.
  // There is no network transport, queue, log, identifier, or input capture here.
  globalThis.DataTransformEvents = Object.freeze({
    emit(name, metadata = {}) {
      if (!allowed.has(name)) return;
      const detail = { name, tool: 'text-diff' };
      for (const key of allowed.get(name)) {
        if (values[key].includes(metadata[key])) detail[key] = metadata[key];
      }
      try { document.dispatchEvent(new CustomEvent('datatransform:event', { detail: Object.freeze(detail) })); }
      catch { /* Event hooks must not interrupt the tool. */ }
    },
  });
})();
