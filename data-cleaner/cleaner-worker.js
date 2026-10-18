'use strict';
importScripts('../data-file-converter/vendor/xlsx.full.min.js','../data-file-converter/model.js','model.js');
const cleaner=DataCleaner.session(XLSX);
self.onmessage=event=>{
  const {id,action,options}=event.data;
  try {if(!['load','select','run','export'].includes(action))throw new Error('Unknown cleanup action.');self.postMessage({id,action,result:cleaner[action](options)});}
  catch(err){self.postMessage({id,action,error:err.message||'Cleanup failed. Try a smaller file.'});}
};
