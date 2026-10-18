const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../data-cleaner/model.js'),X=require('../data-file-converter/vendor/xlsx.full.min.js');
const text={trim:true,spaces:true,invisible:true,nfc:true,lineEndings:true,case:'lower',prefix:'REF-',suffix:'!'};
const number={inputDecimal:'.',inputGroup:',',outputDecimal:'.',outputGroup:'none',places:'preserve',removeCurrency:'£',addCurrency:'',parentheses:true};
const recipe=(family,options={})=>({family,columns:[1],output:'replace',errors:'block',text,number,date:{input:'dmy',output:'ymd'},...options});
const date=(input,output,sourceZone='UTC',targetZone='UTC')=>M.dateConverter({input,output,sourceZone,targetZone});
test('text cleanup preserves meaningful joiners and line breaks and applies literal edges once',()=>{
 assert.equal(M.text(' REF-  CAFE\u0301\u200b\t NAME! ',text),'café name');
 assert.equal(M.text('REF-REF-X!',text),'ref-x');
 assert.equal(M.text('REF-👩\u200d💻\r\n A!',text),'👩\u200d💻\n a');
 assert.equal(M.text('.*ABC$',{...text,prefix:'.*',suffix:'$',case:'upper'}),'ABC');
});
test('exact decimals preserve huge integers and round ties away from zero',()=>{
 assert.equal(M.number('£9,007,199,254,740,993.005',{...number,places:'2'}),'9007199254740993.01');
 assert.equal(M.number('(£1,234.505)',{...number,places:'2'}),'-1234.51');
 assert.equal(M.number('-£0.005',{...number,places:'2'}),'-0.01');
 assert.equal(M.number('1.2300e2',number),'123.00');
 assert.equal(M.number('1e-3',number),'0.001');
 assert.equal(M.number('999.999',{...number,places:'2'}),'1000.00');
});
test('explicit locale separators and currency labels are validated',()=>{
 assert.equal(M.number('1\u202f234,50 EUR',{...number,inputDecimal:',',inputGroup:'space',removeCurrency:'EUR',outputGroup:',',addCurrency:'$'}),'$1,234.50');
 for(const value of ['£12,34','NaN','Infinity','££12','--1','(-1)','1e1001'])assert.throws(()=>M.number(value,number));
 assert.throws(()=>M.number('1'.repeat(1001),number),/1,000/);
 assert.throws(()=>M.prepare(recipe('number',{number:{...number,inputDecimal:','}})),/different/);
});
test('dates use explicit order and real calendar validation without rollover',()=>{
 assert.equal(date('dmy','ymd')('01/02/2026'),'2026-02-01');
 assert.equal(date('mdy','ymd')('01/02/2026'),'2026-01-02');
 assert.equal(date('ymd','dmy')('0001-01-01'),'01/01/0001');
 assert.equal(date('dmy','ymd')('29/02/2000'),'2000-02-29');
 for(const v of ['29/02/1900','31/04/2026','01/01/26','00/01/2026'])assert.throws(()=>date('dmy','ymd')(v));
});
test('time-zone conversion rejects skipped and repeated clock times',()=>{
 const london=date('local','iso','Europe/London');
 assert.equal(london('2026-07-17 12:00'),'2026-07-17T11:00:00.000Z');
 assert.throws(()=>london('2026-03-29 01:30'),/does not exist/);
 assert.throws(()=>london('2026-10-25 01:30'),/occurs twice/);
 assert.equal(date('local','iso','Asia/Kathmandu')('2026-10-17 12:00'),'2026-10-17T06:15:00.000Z');
 assert.equal(date('iso','iso','UTC','Asia/Kathmandu')('2026-10-17T00:00:00Z'),'2026-10-17T05:45:00.000+05:45');
 assert.throws(()=>date('local','iso','bad/zone'),/recognise/);
});
test('ISO and Unix timestamps preserve milliseconds and reject unknown offsets',()=>{
 assert.equal(date('seconds','iso')('-0.001'),'1969-12-31T23:59:59.999Z');
 assert.equal(date('iso','seconds')('1969-12-31T23:59:59.999Z'),'-0.001');
 assert.equal(date('iso','milliseconds')('2026-10-17T01:00:00+01:00'),String(Date.UTC(2026,9,17)));
 assert.equal(date('ymd','iso','Europe/London')('2026-07-17'),'2026-07-16T23:00:00.000Z');
 for(const v of ['2026-10-17T00:00:00-00:00','2026-02-30T00:00:00Z','2026-10-17T00:00:60Z','2026-10-17T00:00:00.1234Z'])assert.throws(()=>date('iso','seconds')(v));
 assert.throws(()=>date('seconds','iso')('1.0001'));
});
test('append keeps source values, resolves name collisions and retains failed values',()=>{
 const table={headers:['id','amount','amount (cleaned)'],rows:[['001','£1,234.50','x'],['002','£12,34','y'],['003','  ','z']]};
 const r=M.transform(table,recipe('number',{output:'append'}));
 assert.deepEqual(r.table.headers,['id','amount','amount (cleaned)','amount (cleaned) (2)']);
 assert.deepEqual(r.table.rows[0],['001','£1,234.50','x','1234.50']);
 assert.equal(r.table.rows[1][3],'£12,34');assert.equal(r.summary.errors,1);assert.equal(r.summary.blank,1);
 assert.equal(table.rows[0][1],'£1,234.50');assert.equal(r.errors[0][0],'2');
 assert.ok(M.exportResult(r,{view:'data',protect:false}).blocked);
 assert.equal(M.exportResult(r,{view:'issues',protect:false}).count,1);
 r.policy='keep';assert.match(M.exportResult(r,{view:'data',protect:false}).text,/£12,34/);
});
test('CSV protection is explicit and output limits prevent expansion',()=>{
 const r=M.transform({headers:['id','name'],rows:[['001',' =SUM(A1) ']]},recipe('text'));
 assert.match(M.exportResult(r,{view:'data',protect:true}).text,/'=sum/);
 assert.doesNotMatch(M.exportResult(r,{view:'data',protect:false}).text,/'=sum/);
 assert.throws(()=>M.transform({headers:Array.from({length:100},(_,i)=>'h'+i),rows:[]},recipe('text',{output:'append'})),/100 columns/);
 assert.throws(()=>M.transform(r.table,recipe('text',{columns:[]})),/Select/);
});
test('session imports exact IDs and loses old exports after a failed new run or selection',()=>{
 const s=M.session(X);s.load({text:'id,name\n001, ALICE ',format:'csv'});s.select({hasHeader:true});s.run(recipe('text'));assert.match(s.export({view:'data',protect:false}).text,/001,alice/);
 assert.throws(()=>s.run(recipe('text',{columns:[]})));assert.throws(()=>s.export({view:'data',protect:false}),/Run/);
 s.run(recipe('text'));s.select({hasHeader:false});assert.throws(()=>s.export({view:'data',protect:false}),/Run/);
});
test('title case preserves spacing and punctuation while capitalising Unicode words',()=>{
 const convert=value=>M.text(value,{...text,trim:false,spaces:false,prefix:'',suffix:'',case:'title'});
 assert.equal(convert("  hELLO\tWORLD — don't STOP!  "),"  Hello\tWorld — Don't Stop!  ");
 assert.equal(convert('éCOLE cafe\u0301 東京 2026report'),'École Café 東京 2026Report');
});
test('camel, slug and snake case handle acronym boundaries, punctuation, apostrophes and Unicode',()=>{
 const convert=(value,mode)=>M.prepare(recipe('text',{text:{...text,prefix:'',suffix:'',case:mode}}))(value);
 for(const [input,camel,slug]of [['Hello world','helloWorld','hello-world'],['XMLHttpRequest_v2 / API response','xmlHttpRequestV2ApiResponse','xml-http-request-v2-api-response'],["Don't stop",'dontStop','dont-stop'],['École café 東京','écoleCafé東京','école-café-東京'],['  -- !!!  ','',''],['','', '']]){
  assert.equal(convert(input,'camel'),camel);assert.equal(convert(input,'slug'),slug);assert.equal(convert(input,'snake'),slug.replaceAll('-','_'));
 }
});
