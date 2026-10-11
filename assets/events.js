(() => {
  'use strict';
  const allowed = new Map([
    ['tool_opened', []], ['comparison_completed', ['result']],
    ['comparison_failed', ['reason']], ['input_cleared', ['side']],
    ['clipboard_pasted', ['side']], ['clipboard_failed', ['side']],
    ['difference_navigated', ['direction']],
    ['base64_encoded', ['source']], ['base64_decoded', ['result']],
    ['base64_failed', ['operation']], ['base64_copied', ['operation']],
    ['base64_downloaded', ['operation']],
  ]);
  const values = {
    result: ['identical', 'different', 'text', 'image', 'pdf', 'binary'], reason: ['input_limit', 'unavailable', 'processing'],
    side: ['original', 'updated', 'decode', 'encode'], direction: ['previous', 'next'],
    source: ['file', 'text'], operation: ['decode', 'encode'],
  };
  // Inactive by default. A future reviewed provider can listen for this event.
  // There is no network transport, queue, log, identifier, or input capture here.
  globalThis.DataTransformEvents = Object.freeze({
    emit(name, metadata = {}, tool = 'text-diff') {
      if (!allowed.has(name) || !['text-diff', 'base64-decoder-encoder'].includes(tool)) return;
      const detail = { name, tool };
      for (const key of allowed.get(name)) {
        if (values[key].includes(metadata[key])) detail[key] = metadata[key];
      }
      try { document.dispatchEvent(new CustomEvent('datatransform:event', { detail: Object.freeze(detail) })); }
      catch { /* Event hooks must not interrupt the tool. */ }
    },
  });
})();
