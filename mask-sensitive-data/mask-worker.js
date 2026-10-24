'use strict';
importScripts('../data-file-converter/vendor/xlsx.full.min.js','../data-file-converter/model.js','model.js');
const engine=DataMasker.session(XLSX);
self.onmessage=event=>{const {id,action,options}=event.data;try{if(!['load','select','run','export'].includes(action))throw Error('Unknown masking action.');self.postMessage({id,action,result:engine[action](options)});}catch(e){self.postMessage({id,action,error:e.message||'Masking failed.'});}};
