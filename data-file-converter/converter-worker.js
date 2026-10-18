'use strict';
importScripts('vendor/xlsx.full.min.js', 'model.js');
const converter = DataConverter.engine(XLSX);
self.onmessage = event => {
  const {id, action, options} = event.data;
  try {
    if (!['load','select','export'].includes(action)) throw new Error('Unknown conversion action.');
    const result = converter[action](options);
    self.postMessage({id, action, result}, result.bytes ? [result.bytes] : []);
  } catch (err) { self.postMessage({id, action, error:err.message || 'Conversion failed. Try a smaller file.'}); }
};
