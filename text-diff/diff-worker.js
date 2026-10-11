// A browser-side worker keeps comparison off the page's main thread.
// All three scripts are static files; no server processing is involved.
importScripts('./vendor/diff-match-patch.js', './diff-model.js');
self.addEventListener('message', ({ data }) => {
  try { self.postMessage({ result: TextDiffModel.compare(data.original, data.updated) }); }
  catch (error) { self.postMessage({ error: error.message === 'input_limit' ? 'input_limit' : 'processing' }); }
});
