'use strict';
importScripts('../data-file-converter/vendor/xlsx.full.min.js','../data-file-converter/model.js','model.js');
const reshaper=TableReshaper.session(XLSX);
self.onmessage=event=>{
  const {id,action,options}=event.data;
  try {if(!['load','select','run','export'].includes(action))throw new Error('Unknown reshaping action.');self.postMessage({id,action,result:reshaper[action](options)});}
  catch(err){self.postMessage({id,action,error:err.message||'Reshaping failed. Try a smaller file.'});}
};
