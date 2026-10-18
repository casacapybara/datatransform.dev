'use strict';
importScripts('../data-file-converter/vendor/xlsx.full.min.js','../data-file-converter/model.js','model.js');
const checker = DataQuality.session(XLSX);
self.onmessage = event => {
  const {id,action,options} = event.data;
  try {
    if (!['load','select','check','export'].includes(action)) throw new Error('Unknown checking action.');
    self.postMessage({id,action,result:checker[action](options)});
  } catch (err) { self.postMessage({id,action,error:err.message || 'Check failed. Try a smaller file.'}); }
};
