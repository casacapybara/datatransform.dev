/* Explicit text, calendar/time-zone and exact decimal transformations. */
(function (root,factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('../data-file-converter/model.js') : root.DataConverter);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.DataCleaner = api;
})(typeof globalThis !== 'undefined' ? globalThis : this,function (C) {
  'use strict';
  const LIMITS = Object.freeze({errors:100000,characters:20000000,digits:1000});
  const DATE_INPUTS = ['ymd','dmy','mdy','local','local-dmy','local-mdy','iso','seconds','milliseconds'];
  const DATE_OUTPUTS = ['ymd','dmy','mdy','iso','seconds','milliseconds'];
  const dateOnly = f => ['ymd','dmy','mdy'].includes(f);
  const pad = (n,w=2) => String(n).padStart(w,'0');
  function text(value,o) {
    let s = value;
    if (o.lineEndings) s = s.replace(/\r\n|\r/g,'\n');
    if (o.invisible) s = s.replace(/[\u200b\ufeff\u2060\u00ad]/g,'');
    if (o.nfc) s = s.normalize('NFC');
    if (o.trim) s = s.trim();
    const prefix = o.nfc ? o.prefix.normalize('NFC') : o.prefix, suffix = o.nfc ? o.suffix.normalize('NFC') : o.suffix;
    if (prefix && s.startsWith(prefix)) s = s.slice(prefix.length);
    if (suffix && s.endsWith(suffix)) s = s.slice(0,-suffix.length);
    if (o.spaces) s = s.replace(/[\t \u00a0\u202f]+/g,' ');
    if (o.trim) s = s.trim();
    const capitalise = word => word.toLowerCase().replace(/\p{L}/u, letter => letter.toUpperCase());
    if (o.case === 'title') return s.replace(/[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu,capitalise);
    if (o.case === 'camel' || o.case === 'slug' || o.case === 'snake') {
      const words = s.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu,'$1 $2')
        .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu,'$1 $2').replace(/['’]/g,'')
        .match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*/gu) || [];
      return o.case === 'slug' || o.case === 'snake' ? words.map(word => word.toLowerCase()).join(o.case === 'snake' ? '_' : '-')
        : words.map((word,i) => i ? capitalise(word) : word.toLowerCase()).join('');
    }
    return o.case === 'lower' ? s.toLowerCase() : o.case === 'upper' ? s.toUpperCase() : s;
  }
  function number(value,o) {
    let s = value.trim(), negative = false, signed = false;
    if (s.startsWith('(') && s.endsWith(')')) { if (!o.parentheses) throw new Error('Accounting parentheses are not enabled.'); negative = true; signed = true; s = s.slice(1,-1).trim(); }
    function sign() { if (/^[+-]/.test(s)) { if (signed) throw new Error('The value has more than one sign.'); signed = true; negative = s[0] === '-'; s = s.slice(1).trim(); } }
    sign();
    const token = o.removeCurrency.trim();
    if (token) { if (s.startsWith(token)) s = s.slice(token.length).trim(); else if (s.endsWith(token)) s = s.slice(0,-token.length).trim(); }
    sign();
    const exp = s.split(/[eE]/); if (exp.length > 2 || (exp.length === 2 && !/^[+-]?\d{1,4}$/.test(exp[1]))) throw new Error('Use a decimal value with an optional exponent of up to 1,000.');
    const exponent = exp.length === 2 ? Number(exp[1]) : 0; if (Math.abs(exponent) > 1000) throw new Error('Exponent exceeds 1,000.');
    const parts = exp[0].split(o.inputDecimal); if (parts.length > 2) throw new Error('More than one decimal separator was found.');
    let integer = parts[0], fraction = parts[1] || '';
    if (!/^\d*$/.test(fraction)) throw new Error('Unexpected characters after the chosen decimal separator.');
    if (o.inputGroup === 'space') integer = integer.replace(/[\u00a0\u202f]/g,' ');
    const grouping = o.inputGroup === 'space' ? ' ' : o.inputGroup;
    if (grouping !== 'none' && integer.includes(grouping)) {
      const groups = integer.split(grouping);
      if (!/^\d{1,3}$/.test(groups[0]) || groups.slice(1).some(g => !/^\d{3}$/.test(g))) throw new Error('Thousands groups must contain three digits after the first group.');
      integer = groups.join('');
    }
    if (!/^\d*$/.test(integer) || (!integer && !fraction)) throw new Error('The value does not match the selected separators or currency label.');
    if (integer.length + fraction.length > LIMITS.digits) throw new Error('Numbers allow up to 1,000 digits.');
    let digits = ((integer || '0')+fraction).replace(/^0+(?=\d)/,''), scale = fraction.length-exponent;
    if (scale < 0) { if (digits.length-scale > LIMITS.digits) throw new Error('Expanded number exceeds 1,000 digits.'); digits += '0'.repeat(-scale); scale = 0; }
    if (Math.max(digits.length,scale+1) > LIMITS.digits) throw new Error('Expanded number exceeds 1,000 digits.');
    digits = digits.padStart(scale+1,'0');
    if (o.places !== 'preserve') {
      const places = Number(o.places);
      if (scale > places) {
        const cut = digits.length-(scale-places), roundUp = digits[cut] >= '5';
        digits = (BigInt(digits.slice(0,cut) || '0')+(roundUp ? 1n : 0n)).toString();
      } else digits += '0'.repeat(places-scale);
      scale = places; digits = digits.padStart(scale+1,'0');
    }
    let whole = scale ? digits.slice(0,-scale) : digits;
    whole = whole.replace(/^0+(?=\d)/,'');
    if (o.outputGroup !== 'none') whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g,o.outputGroup === 'space' ? ' ' : o.outputGroup);
    return (negative ? '-' : '')+o.addCurrency+whole+(scale ? o.outputDecimal+digits.slice(-scale) : '');
  }
  function validParts(p) {
    const leap = p.y%4 === 0 && (p.y%100 !== 0 || p.y%400 === 0);
    if (!(p.y >= 1 && p.y <= 9999 && p.m >= 1 && p.m <= 12 && p.d >= 1 && p.d <= [31,leap?29:28,31,30,31,30,31,31,30,31,30,31][p.m-1] && p.h >= 0 && p.h <= 23 && p.min >= 0 && p.min <= 59 && p.sec >= 0 && p.sec <= 59)) throw new Error('Not a valid calendar date or clock time.');
    return p;
  }
  function utc(p) { const d = new Date(0); d.setUTCFullYear(p.y,p.m-1,p.d); d.setUTCHours(p.h,p.min,p.sec,p.ms); return d.getTime(); }
  function parseWall(value,format) {
    const timed = format.startsWith('local'), order = format === 'local' ? 'ymd' : format.replace('local-','');
    const date = order === 'ymd' ? '(\\d{4})-(\\d{2})-(\\d{2})' : '(\\d{1,2})/(\\d{1,2})/(\\d{4})';
    const match = value.match(new RegExp('^'+date+(timed ? '[ T](\\d{2}):(\\d{2})(?::(\\d{2})(?:\\.(\\d{1,3}))?)?' : '')+'$'));
    if (!match) throw new Error('The value does not match the chosen date/time format.');
    return validParts({y:Number(match[order==='ymd'?1:3]),m:Number(match[order==='mdy'?1:2]),d:Number(match[order==='ymd'?3:order==='dmy'?1:2]),h:Number(match[4]||0),min:Number(match[5]||0),sec:Number(match[6]||0),ms:Number((match[7]||'').padEnd(3,'0'))});
  }
  function zonedFormatter(zone) {
    if (typeof zone !== 'string' || !zone.trim() || zone.length > 100) throw new Error('Enter a time zone such as UTC or Europe/London.');
    try { return new Intl.DateTimeFormat('en-GB-u-ca-gregory-nu-latn',{timeZone:zone.trim(),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',fractionalSecondDigits:3,hourCycle:'h23',era:'short'}); }
    catch { throw new Error('This browser does not recognise the chosen time zone. Use UTC or a supported IANA name.'); }
  }
  function partsAt(ms,formatter) {
    const p = Object.fromEntries(formatter.formatToParts(new Date(ms)).filter(p => p.type !== 'literal').map(p => [p.type,p.value]));
    if (p.era !== 'AD') throw new Error('Dates must remain in years 0001–9999.');
    return validParts({y:Number(p.year),m:Number(p.month),d:Number(p.day),h:Number(p.hour),min:Number(p.minute),sec:Number(p.second),ms:Number(p.fractionalSecond||0)});
  }
  function dateConverter(o) {
    const direct = dateOnly(o.input) && dateOnly(o.output), needsSource = o.input.startsWith('local') || (dateOnly(o.input) && !direct);
    const source = needsSource ? zonedFormatter(o.sourceZone) : null;
    const target = !direct && !['seconds','milliseconds'].includes(o.output) ? zonedFormatter(o.targetZone) : null;
    const offsetCache = new Map();
    function wallToEpoch(p) {
      const base = utc(p), day = Math.floor(base/86400000);
      let offsets = offsetCache.get(day);
      if (!offsets) {
        offsets = new Set();
        for (let hours=-48; hours<=48; hours+=3) { const instant = day*86400000+hours*3600000; try { offsets.add(utc(partsAt(instant,source))-instant); } catch {} }
        offsetCache.set(day,offsets);
      }
      const candidates = [...offsets].map(offset => base-offset).filter(instant => { try { return utc(partsAt(instant,source)) === base; } catch { return false; } });
      if (!candidates.length) throw new Error('This local time does not exist in the source time zone, or is outside the supported year range.');
      if (candidates.length > 1) throw new Error('This local time occurs twice when clocks change. Supply an ISO date/time with an explicit offset.');
      return candidates[0];
    }
    function dateLabel(p,format) { return format === 'dmy' ? `${pad(p.d)}/${pad(p.m)}/${pad(p.y,4)}` : format === 'mdy' ? `${pad(p.m)}/${pad(p.d)}/${pad(p.y,4)}` : `${pad(p.y,4)}-${pad(p.m)}-${pad(p.d)}`; }
    return value => {
      const s = value.trim(); let epoch, wall;
      if (direct) return dateLabel(parseWall(s,o.input),o.output);
      if (o.input === 'seconds' || o.input === 'milliseconds') {
        const match = s.match(o.input === 'seconds' ? /^([+-]?)(\d{1,16})(?:\.(\d{1,3}))?$/ : /^([+-]?)(\d{1,16})$/);
        if (!match) throw new Error('Use an integer millisecond timestamp or seconds with at most three decimal places.');
        const magnitude = BigInt(match[2])*(o.input === 'seconds' ? 1000n : 1n)+BigInt((match[3]||'').padEnd(3,'0'));
        epoch = Number((match[1] === '-' ? -1n : 1n)*magnitude);
      } else if (o.input === 'iso') {
        const match = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)(Z|[+-]\d{2}:\d{2})$/);
        if (!match || match[3] === '-00:00') throw new Error('Use ISO date/time with seconds and a known offset, such as 2026-10-17T14:30:00Z or +01:00.');
        wall = parseWall(match[1]+' '+match[2],'local'); let offset = 0;
        if (match[3] !== 'Z') { const h=Number(match[3].slice(1,3)),m=Number(match[3].slice(4)); if (h>23 || m>59) throw new Error('Invalid UTC offset.'); offset=(h*60+m)*60000*(match[3][0]==='-'?-1:1); }
        epoch = utc(wall)-offset;
      } else { wall = parseWall(s,o.input); epoch = wallToEpoch(wall); }
      if (!Number.isSafeInteger(epoch) || !Number.isFinite(new Date(epoch).getTime()) || new Date(epoch).getUTCFullYear()<1 || new Date(epoch).getUTCFullYear()>9999) throw new Error('Date/time is outside years 0001–9999 or millisecond precision.');
      if (o.output === 'milliseconds') return String(epoch);
      if (o.output === 'seconds') { const n = BigInt(epoch), a=n<0n?-n:n; return (n<0n?'-':'')+String(a/1000n)+(a%1000n ? '.'+String(a%1000n).padStart(3,'0').replace(/0+$/,'') : ''); }
      const p = partsAt(epoch,target);
      if (dateOnly(o.output)) return dateLabel(p,o.output);
      const offset = utc(p)-epoch; if (offset%60000) throw new Error('This historical time-zone offset is finer than a minute. Choose UTC output.');
      const minutes = Math.abs(offset/60000), suffix=offset===0?'Z':(offset<0?'-':'+')+pad(Math.floor(minutes/60))+':'+pad(minutes%60);
      return dateLabel(p,'ymd')+'T'+pad(p.h)+':'+pad(p.min)+':'+pad(p.sec)+'.'+pad(p.ms,3)+suffix;
    };
  }
  function similarKey(value){return value.normalize('NFC').toLowerCase().replace(/[\p{P}\p{Z}\s]+/gu,'');}
  function oneEdit(a,b){
    const x=Array.from(a),y=Array.from(b);if(Math.abs(x.length-y.length)>1)return false;
    let i=0,j=0,edits=0;while(i<x.length&&j<y.length){if(x[i]===y[j]){i++;j++;continue;}if(++edits>1)return false;if(x.length>=y.length)i++;if(y.length>=x.length)j++;}return edits+(i<x.length||j<y.length?1:0)<=1;
  }
  function suggest(table,column){
    if(!Number.isInteger(column)||column<0||column>=table.headers.length)throw new Error('Select exactly one column to find similar values.');
    const counts=new Map();for(const row of table.rows){const value=row[column];if(!value.trim())continue;if(value.length>200)throw new Error('Similar-value suggestions allow values up to 200 characters.');counts.set(value,(counts.get(value)||0)+1);if(counts.size>500)throw new Error('Similar-value suggestions allow up to 500 distinct nonblank values. Filter the table first.');}
    const values=[...counts].map(([value,count])=>({value,count,key:similarKey(value)})).sort((a,b)=>b.count-a.count),used=new Set(),groups=[];
    for(let i=0;i<values.length;i++){
      if(used.has(i)||!values[i].key)continue;const anchor=values[i],matches=[i];
      for(let j=i+1;j<values.length;j++)if(!used.has(j)&&values[j].key&&(anchor.key===values[j].key||(Array.from(anchor.key).length>=5&&Array.from(values[j].key).length>=5&&oneEdit(anchor.key,values[j].key))))matches.push(j);
      if(matches.length>1){matches.forEach(n=>used.add(n));groups.push({column,preferred:anchor.value,values:matches.map(n=>({value:values[n].value,count:values[n].count}))});}
    }
    return groups;
  }
  function prepare(recipe) {
    if (!['text','date','number','similar'].includes(recipe.family)) throw new Error('Choose text, dates and times, or numbers.');
    if (!['replace','append'].includes(recipe.output) || !['block','keep'].includes(recipe.errors)) throw new Error('Choose valid output and error-handling settings.');
    if(recipe.family==='similar'){
      if(recipe.columns?.length!==1||!Array.isArray(recipe.replacements)||!recipe.replacements.length)throw new Error('Approve at least one suggested group for one selected column.');
      const map=new Map();for(const group of recipe.replacements){if(!Array.isArray(group.values)||group.values.length<2||typeof group.preferred!=='string'||!group.preferred.trim()||group.preferred.length>200)throw new Error('Choose a nonblank preferred spelling up to 200 characters.');for(const value of group.values){if(typeof value!=='string'||map.has(value))throw new Error('Replacement groups overlap or contain invalid values.');map.set(value,group.preferred);}}
      return value=>map.has(value)?map.get(value):value;
    }
    if (recipe.family === 'text') {
      const o=recipe.text; if (!['none','lower','upper','title','camel','slug','snake'].includes(o.case) || typeof o.prefix!=='string' || typeof o.suffix!=='string' || o.prefix.length>1000 || o.suffix.length>1000) throw new Error('Text prefixes and suffixes allow 1,000 characters; choose a supported case option.');
      return value=>text(value,o);
    }
    if (recipe.family === 'number') {
      const o=recipe.number;
      if (![o.inputDecimal,o.outputDecimal].every(v=>['.',','].includes(v)) || ![o.inputGroup,o.outputGroup].every(v=>['none','.',',','space'].includes(v)) || o.inputDecimal===o.inputGroup || o.outputDecimal===o.outputGroup) throw new Error('Decimal and thousands separators must be different.');
      if (!(o.places==='preserve'||/^\d{1,2}$/.test(o.places)&&Number(o.places)<=20)) throw new Error('Choose Preserve or between 0 and 20 decimal places.');
      if ([o.removeCurrency,o.addCurrency].some(v=>typeof v!=='string'||v.length>20||/[\r\n\t]/.test(v))) throw new Error('Currency labels allow 20 characters and no line breaks or tabs.');
      return value=>number(value,o);
    }
    if (!DATE_INPUTS.includes(recipe.date.input)||!DATE_OUTPUTS.includes(recipe.date.output)) throw new Error('Choose explicit input and output date/time formats.');
    return dateConverter(recipe.date);
  }
  function transform(table,recipe) {
    const convert=prepare(recipe), columns=recipe.columns;
    if (!columns?.length || new Set(columns).size!==columns.length || columns.some(c=>!Number.isInteger(c)||c<0||c>=table.headers.length)) throw new Error('Select at least one column to clean, without repeats.');
    const headers=[...table.headers], used=new Set(headers);
    if (recipe.output==='append') columns.forEach(c=>{const base=table.headers[c].slice(0,180)+' (cleaned)';let name=base,n=2;while(used.has(name))name=`${base} (${n++})`;used.add(name);headers.push(name);});
    if (headers.length>100 || (table.rows.length+1)*headers.length>500000) throw new Error('Output exceeds 100 columns or 500,000 cells. Replace selected columns or choose fewer columns.');
    const rows=[], errors=[], preview=[], cache=new Map();let changed=0,unchanged=0,blank=0,chars=headers.join('').length,errorChars=0;
    table.rows.forEach((source,i)=>{
      const result=[...source];
      columns.forEach((c,j)=>{
        const before=source[c];let after=before,problem='';
        if (!['text','similar'].includes(recipe.family)&&!before.trim()) blank++;
        else {
          let conversion=cache.get(before);
          if (!conversion) { try { conversion={value:convert(before)}; } catch(e) { conversion={error:e.message}; } cache.set(before,conversion); }
          if (conversion.error) {
            problem=conversion.error; errorChars+=before.length+table.headers[c].length+problem.length;
            if (errors.length>=LIMITS.errors||errorChars>LIMITS.characters) throw new Error('Exception report exceeds 100,000 values or 20 million characters. Clean fewer columns or use a smaller file.');
            errors.push([String(i+1),table.headers[c],before,problem]);
          } else after=conversion.value;
          if (!problem) { if (before!==after) changed++; else unchanged++; }
        }
        if ((before!==after||problem)&&preview.length<100) preview.push([String(i+1),table.headers[c],before.slice(0,500)+(before.length>500?'…':''),after.slice(0,500)+(after.length>500?'…':''),problem||'Changed']);
        result[recipe.output==='append'?table.headers.length+j:c]=after;
      });
      chars+=result.reduce((n,v)=>n+v.length,0);if(chars>LIMITS.characters)throw new Error('Cleaned data exceeds 20 million characters. Select fewer columns or use a smaller file.');rows.push(result);
    });
    return {table:{headers,rows},errors,summary:{rows:rows.length,columns:columns.length,changed,unchanged,blank,errors:errors.length},preview,policy:recipe.errors};
  }
  function exportResult(result,options) {
    const table=options.view==='issues'?{headers:['Data row','Field','Original value','Problem'],rows:result.errors}:result.table;
    if (!['data','issues'].includes(options.view)) throw new Error('Choose cleaned data or an exception report.');
    const protect=v=>options.protect&&/^(?:\s*[=+\-@]|[\t\r\n])/.test(v)?"'"+v:v;
    if(options.view==='data'&&result.errors.length&&result.policy==='block')return {headers:table.headers.map(protect),preview:table.rows.slice(0,100).map(r=>r.map(protect)),count:table.rows.length,blocked:`${result.errors.length} ${result.errors.length===1?'value':'values'} could not be converted. Correct the source or settings, or choose Keep original values and run again. The exception report remains available.`};
    return C.output(table,{columns:table.headers.map((_,i)=>i),format:options.format || 'csv',protect:options.protect});
  }
  function session(X) {
    const importer=C.engine(X);let table=null,result=null;
    return {
      load(input){table=result=null;return importer.load(input);},
      select(options){table=result=null;const meta=importer.select(options);table=importer.snapshot();return {...meta,preview:table.rows.slice(0,5)};},
      suggest(options){result=null;if(!table)throw new Error('Load data first.');return suggest(table,options.column);},
      run(recipe){result=null;if(!table)throw new Error('Choose valid source data first.');result=transform(table,recipe);return {summary:result.summary,preview:result.preview};},
      export(options){if(!result)throw new Error('Run the cleanup before exporting.');return exportResult(result,options);},
    };
  }
  return {LIMITS,DATE_INPUTS,DATE_OUTPUTS,dateOnly,text,number,parseWall,dateConverter,prepare,transform,exportResult,session,suggest,similarKey,oneEdit};
});
