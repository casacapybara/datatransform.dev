/* Destination-led import preparation, using the shared cleaner and checker. */
(function(root,factory){
  const api=typeof module==='object'&&module.exports ? factory(require('../data-file-converter/model.js'),require('../data-cleaner/model.js'),require('../data-quality-checker/model.js')) : factory(root.DataConverter,root.DataCleaner,root.DataQuality);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ImportPreparer=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C,Clean,Q){
  'use strict';
  const CONVERSIONS=Object.freeze({keep:'Keep original text',trim:'Trim whitespace',lower:'Trim + lowercase',upper:'Trim + uppercase','date-ymd':'YYYY-MM-DD → YYYY-MM-DD','date-dmy':'DD/MM/YYYY → YYYY-MM-DD','date-mdy':'MM/DD/YYYY → YYYY-MM-DD','number-dot':'1,234.56 → 1234.56','number-comma':'1.234,56 → 1234.56'});
  function validateHeaders(headers){
    if(!Array.isArray(headers)||!headers.length||headers.length>100)throw new Error('The template needs between 1 and 100 columns.');
    if(headers.some(h=>typeof h!=='string'||!h.trim()||h.length>200))throw new Error('Template column names must be nonblank and at most 200 characters.');
    if(new Set(headers).size!==headers.length)throw new Error('Template column names must be unique. Correct duplicate names in the template.');
    return headers;
  }
  function template(text,format='csv'){
    if(typeof text!=='string'||new TextEncoder().encode(text).length>C.LIMITS.bytes)throw new Error('The template allows up to 5 MiB of UTF-8 text.');
    if(!['csv','tsv'].includes(format))throw new Error('Choose a CSV or TSV destination template.');
    const records=C.delimited(text.replace(/^\uFEFF/,''),format==='tsv'?'\t':',',{allowUneven:true});
    return {headers:validateHeaders(records[0]),ignored:records.length-1};
  }
  function autoMap(source,headers){
    const key=s=>s.trim().toLowerCase();
    return headers.map(name=>{const matches=source.flatMap((h,i)=>key(h)===key(name)?[i]:[]);return {name,source:matches.length===1?matches[0]:null,default:'',required:false,conversion:'keep'};});
  }
  function converter(mode){
    if(!Object.hasOwn(CONVERSIONS,mode))throw new Error('Choose a supported value conversion.');
    if(mode==='keep')return v=>v;
    const recipe={output:'replace',errors:'block'};
    if(['trim','lower','upper'].includes(mode))return Clean.prepare({...recipe,family:'text',text:{trim:true,case:mode==='trim'?'none':mode,prefix:'',suffix:''}});
    if(mode.startsWith('date-'))return Clean.prepare({...recipe,family:'date',date:{input:mode.slice(5),output:'ymd',sourceZone:'UTC',targetZone:'UTC'}});
    const comma=mode==='number-comma';
    return Clean.prepare({...recipe,family:'number',number:{inputDecimal:comma?',':'.',inputGroup:comma?'.':',',outputDecimal:'.',outputGroup:'none',places:'preserve',removeCurrency:'',addCurrency:'',parentheses:true}});
  }
  function prepare(table,options){
    const fields=options.fields;
    if(!Array.isArray(fields))throw new Error('Load a destination template first.');
    const headers=validateHeaders(fields.map(f=>f.name));
    if(!table.rows.length)throw new Error('The source has no data rows to prepare.');
    if((table.rows.length+1)*fields.length>C.LIMITS.cells)throw new Error('Output exceeds 500,000 cells. Choose a smaller source or template.');
    const conversions=fields.map(f=>{
      if(f.source!==null&&(!Number.isInteger(f.source)||f.source<0||f.source>=table.headers.length))throw new Error('Choose an available source column for every mapped field.');
      if(typeof f.default!=='string'||f.default.length>1000||typeof f.required!=='boolean')throw new Error('Defaults allow up to 1,000 characters; choose valid required-field settings.');
      return converter(f.conversion);
    });
    const errors=[];let chars=headers.join('').length,errorChars=0,defaults=0,changed=0;
    const rows=table.rows.map((row,i)=>fields.map((f,c)=>{
      let value=f.source===null?'':row[f.source];
      if(!value.trim()&&f.default!==''){value=f.default;defaults++;}
      if(value.trim()){
        try{const next=conversions[c](value);if(next!==value)changed++;value=next;}
        catch(e){errorChars+=value.length+f.name.length+e.message.length;if(errors.length>=100000||errorChars>20000000)throw new Error('Conversion report exceeds 100,000 issues or 20 million characters.');errors.push([String(i+1),f.name,value,e.message]);}
      }
      chars+=value.length;if(chars>C.LIMITS.characters)throw new Error('Prepared data exceeds 20 million characters.');return value;
    }));
    const output={headers,rows};
    const report=Q.check(output,{rules:fields.flatMap((f,c)=>f.required?[{column:c,type:'none',required:true}]:[]),keys:[],trim:true,ignoreCase:false,duplicateRows:false});
    report.issues.forEach(i=>errors.push([String(i.row),i.column,i.value,i.message]));
    if(errors.length>100000||errorChars+report.issues.reduce((n,i)=>n+i.column.length+i.value.length+i.message.length,0)>20000000)throw new Error('Combined report exceeds 100,000 issues or 20 million characters.');
    errors.sort((a,b)=>Number(a[0])-Number(b[0]));
    return {table:output,errors,summary:{rows:rows.length,columns:headers.length,defaults,changed,issues:errors.length,affected:new Set(errors.map(e=>e[0])).size,unmapped:fields.filter(f=>f.source===null&&f.default==='').length}};
  }
  function exportResult(result,options){
    if(!['data','issues'].includes(options.view)||!['csv','tsv'].includes(options.format))throw new Error('Choose an import file or issue report, in CSV or TSV format.');
    const table=options.view==='issues'?{headers:['Data row','Destination field','Value','Problem'],rows:result.errors}:result.table;
    if(options.view==='data'&&result.errors.length)return {headers:table.headers,preview:table.rows.slice(0,100),count:table.rows.length,blocked:`${result.errors.length} issues need attention. Correct the source, defaults or mappings and preview again. The issue report is available to download.`};
    // Import destinations require exact headers and values; protection is an explicit choice.
    return C.output(table,{columns:table.headers.map((_,i)=>i),format:options.format,protect:options.protect});
  }
  function session(X){
    const importer=C.engine(X);let table=null,result=null;
    return {
      load(input){table=result=null;return importer.load(input);},
      select(options){table=result=null;const meta=importer.select(options);table=importer.snapshot();return {...meta,preview:table.rows.slice(0,5)};},
      run(options){result=null;if(!table)throw new Error('Load valid source data first.');result=prepare(table,options);return {summary:result.summary};},
      export(options){if(!result)throw new Error('Preview the import file before exporting.');return exportResult(result,options);}
    };
  }
  return {CONVERSIONS,template,autoMap,prepare,exportResult,session};
});
