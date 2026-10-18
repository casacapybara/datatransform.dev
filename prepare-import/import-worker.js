'use strict';
importScripts('../data-file-converter/vendor/xlsx.full.min.js','../data-file-converter/model.js','../data-cleaner/model.js','../data-quality-checker/model.js','model.js');
const preparer=ImportPreparer.session(XLSX);
self.onmessage=event=>{
  const {id,action,options}=event.data;
  try{if(!['load','select','run','export'].includes(action))throw new Error('Unknown import action.');self.postMessage({id,action,result:preparer[action](options)});}
  catch(e){self.postMessage({id,action,error:e.message||'Import preparation failed.'});}
};
