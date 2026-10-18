(() => {
  'use strict';
  const allowed = new Map([
    ...['import_loaded', 'import_completed', 'import_failed', 'import_cleared', 'import_copied', 'import_downloaded'].map(name => [name, []]),
    ...['reshape_loaded', 'reshape_completed', 'reshape_failed', 'reshape_cleared', 'reshape_copied', 'reshape_downloaded'].map(name => [name, []]),
    ...['cleanup_loaded', 'cleanup_completed', 'cleanup_failed', 'cleanup_cleared', 'cleanup_copied', 'cleanup_downloaded'].map(name => [name, []]),
    ...['quality_loaded', 'quality_checked', 'quality_failed', 'quality_cleared', 'quality_copied', 'quality_downloaded'].map(name => [name, []]),
    ...['conversion_loaded', 'conversion_completed', 'conversion_failed', 'conversion_cleared', 'conversion_copied', 'conversion_downloaded'].map(name => [name, []]),
    ...['merge_loaded', 'merge_failed', 'merge_cleared', 'merge_copied', 'merge_downloaded'].map(name => [name, []]),
    ...['list_compared', 'list_failed', 'list_cleared', 'list_copied', 'list_downloaded'].map(name => [name, []]),
    ['tool_opened', []], ['comparison_completed', ['result']],
    ['comparison_failed', ['reason']], ['input_cleared', ['side']],
    ['clipboard_pasted', ['side']], ['clipboard_failed', ['side']],
    ['difference_navigated', ['direction']],
    ['base64_encoded', ['source']], ['base64_decoded', ['result']],
    ['base64_failed', ['operation']], ['base64_copied', ['operation']],
    ['base64_downloaded', ['operation']],
    ...['bitwise_failed', 'bitwise_cleared', 'bitwise_names_applied', 'bitwise_configuration_saved', 'bitwise_configuration_loaded', 'bitwise_copied'].map(name => [name, []]),
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
      if (!allowed.has(name) || !['text-diff', 'base64-decoder-encoder', 'bitwise-flag-decoder', 'list-comparison', 'csv-merge-join', 'data-file-converter', 'data-quality-checker', 'data-cleaner', 'summarise-reshape', 'prepare-import'].includes(tool)) return;
      const detail = { name, tool };
      for (const key of allowed.get(name)) {
        if (values[key].includes(metadata[key])) detail[key] = metadata[key];
      }
      try { document.dispatchEvent(new CustomEvent('datatransform:event', { detail: Object.freeze(detail) })); }
      catch { /* Event hooks must not interrupt the tool. */ }
    },
  });
})();
