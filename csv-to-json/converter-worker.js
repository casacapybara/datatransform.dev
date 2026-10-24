'use strict';
importScripts('../csv-search-filter-transform/model.js', 'model.js');
self.onmessage = event => {
  const {id, options} = event.data;
  try { self.postMessage({id, result: CsvToJson.convert(options)}); }
  catch (error) { self.postMessage({id, error: error.message || 'Conversion failed. Try a smaller file.'}); }
};
