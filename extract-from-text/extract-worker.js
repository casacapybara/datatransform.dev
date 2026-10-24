'use strict';
importScripts('../data-file-converter/model.js','model.js');
let result=null;
self.onmessage=event=>{const {id,action,options}=event.data;try{let response;if(action==='extract'){result=null;result=TextExtractor.extract(options.text,options);response={summary:result.summary,headers:result.table.headers,preview:result.preview};}else if(action==='export')response=TextExtractor.output(result,options);else throw Error('Unknown extraction action.');self.postMessage({id,action,result:response});}catch(e){if(action==='extract')result=null;self.postMessage({id,action,error:e.message||'Extraction failed.'});}};
