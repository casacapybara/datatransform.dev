/* CSV suite: dependency-free browser and Node data operations. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CsvSuite = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const LIMITS = Object.freeze({bytes: 5 * 1024 * 1024, rows: 20000, columns: 100, cells: 500000, criteria: 100, comparisons: 5000000, outputCharacters: 20000000});
  function parse(text) {
    if (new TextEncoder().encode(text).length > LIMITS.bytes) throw new Error('CSV input exceeds 5 MiB. Split the file into smaller parts.');
    text = text.replace(/^\uFEFF/, '');
    const records = [];
    let row = [], field = '', quoted = false, closed = false, started = false, cells = 0;
    function cell() {
      row.push(field); field = ''; closed = false; started = false;
      if (row.length > LIMITS.columns) throw new Error('CSV input exceeds 100 columns.');
      if (++cells > LIMITS.cells) throw new Error('CSV input exceeds 500,000 cells.');
    }
    function record() {
      // Ignore empty physical lines, while preserving quoted empty cells and comma-only rows.
      if (row.length || started || field.length || closed) {
        cell(); records.push(row);
        if (records.length > LIMITS.rows + 1) throw new Error('CSV input exceeds 20,000 data rows.');
      }
      row = []; field = ''; started = false; closed = false;
    }
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else { quoted = false; closed = true; }
        } else field += c;
      } else if (c === ',') cell();
      else if (c === '\r' || c === '\n') { record(); if (c === '\r' && text[i + 1] === '\n') i++; }
      else if (closed) throw new Error(`Unexpected text after a closing quote in record ${records.length + 1}.`);
      else if (c === '"') {
        if (started) throw new Error(`Unexpected quote in record ${records.length + 1}. Quote the whole cell and double any quotes inside it.`);
        quoted = true; started = true;
      } else { field += c; started = true; }
    }
    if (quoted) throw new Error('CSV contains an unclosed quoted cell.');
    record();
    if (!records.length) throw new Error('Load CSV data with a header row first.');
    const rawHeaders = records.shift();
    const used = new Set(), reserved = new Set(rawHeaders.map(h => h.trim()).filter(Boolean));
    let renamed = false;
    const headers = rawHeaders.map((h, index) => {
      let name = h.trim() || `Column ${index + 1}`;
      const base = name;
      let suffix = 2;
      while (used.has(name) || (!h.trim() && reserved.has(name))) name = `${base} (${suffix++})`;
      if (name !== h) renamed = true;
      used.add(name); return name;
    });
    const rows = records.map((data, index) => {
      if (data.length !== headers.length) throw new Error(`Record ${index + 2} has ${data.length} cells; expected ${headers.length}. Fix the row before loading to avoid losing data.`);
      return {data, record: index + 2};
    });
    return {headers, rows, warnings: renamed ? ['Blank, duplicate or padded headers were given unique, trimmed names. Check the output headers.'] : []};
  }
  function terms(text, caseSensitive) {
    const seen = new Set();
    const result = text.split(/\r\n|\r|\n/).map(v => v.trim()).filter(Boolean).filter(v => {
      const key = caseSensitive ? v : v.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    if (result.length > LIMITS.criteria) throw new Error('Use no more than 100 distinct search terms.');
    return result;
  }
  function filter(dataset, options) {
    const columns = options.columns;
    if (options.mode === 'empty' || options.mode === 'nonEmpty') {
      if (!columns.length) throw new Error('Select at least one column to search.');
      return dataset.rows.flatMap(row => {
        const found = columns.filter(i => {
          const value = options.trim ? row.data[i].trim() : row.data[i];
          return options.mode === 'empty' ? value === '' : value !== '';
        });
        const keep = options.cellPolicy === 'all' ? found.length === columns.length : found.length > 0;
        return keep ? [{...row, data: [...row.data], criteria: [options.mode === 'empty' ? 'Empty cell' : 'Non-empty cell'], columns: found}] : [];
      });
    }
    const criteria = terms(options.text || '', options.caseSensitive);
    if (!criteria.length) return dataset.rows.map(row => ({...row, data: [...row.data], criteria: [], columns: []}));
    if (!columns.length) throw new Error('Select at least one column to search.');
    if (dataset.rows.length * columns.length * criteria.length > LIMITS.comparisons) throw new Error('This search is too large. Choose fewer columns or search terms (limit: 5 million comparisons).');
    const normalize = v => {
      let s = options.trim ? v.trim() : v;
      return options.caseSensitive ? s : s.toLowerCase();
    };
    const matches = (v, term) => options.mode === 'exact' ? v === term : options.mode === 'startsWith' ? v.startsWith(term) : options.mode === 'endsWith' ? v.endsWith(term) : v.includes(term);
    const result = [];
    for (const row of dataset.rows) {
      const found = criteria.map(term => ({term, columns: columns.filter(i => matches(normalize(row.data[i]), normalize(term)))})).filter(m => m.columns.length);
      if (options.mode === 'notContains') {
        if (!found.length) result.push({...row, data: [...row.data], criteria: [], columns: []});
      } else if (found.length) {
        const groups = options.repeat ? found.map(m => [m]) : [found];
        for (const group of groups) {
          result.push({...row, data: [...row.data], criteria: group.map(m => m.term), columns: [...new Set(group.flatMap(m => m.columns))]});
          if (result.length > LIMITS.rows) throw new Error('Repeated matches exceed 20,000 output rows. Choose “One row once”.');
        }
      }
    }
    return result;
  }
  function transform(items, changes) {
    if (changes.length > 100 || changes.some(c => typeof c.value !== 'string' || c.value.length > 10000 || (c.type === 'replace' && (typeof c.find !== 'string' || c.find.length > 10000)))) throw new Error('Use at most 100 changes and 10,000 characters per find or replacement value.');
    if (changes.some(change => change.type === 'replace' && !change.find)) throw new Error('Enter text to find for each active find-and-replace change.');
    if (changes.some(change => ['removePrefix','removeSuffix'].includes(change.type) && !change.value)) throw new Error('Enter the literal prefix or suffix to remove.');
    const prepared = changes.map(change => {
      if (change.type !== 'replace') return change;
      const pattern = change.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return {...change, regex: new RegExp(pattern, change.caseSensitive === false ? 'giu' : 'gu')};
    });
    return items.map(item => {
      const data = [...item.data];
      for (const change of prepared) {
        if (change.type === 'replace') {
          const source = data[change.column];
          let length = source.length;
          for (const match of source.matchAll(change.regex)) {
            length += change.value.length - match[0].length;
            if (length > LIMITS.outputCharacters) throw new Error('A replacement would exceed 20 million characters in one cell. Use a shorter replacement or fewer matches.');
          }
          data[change.column] = source.replace(change.regex, () => change.value);
        } else if (change.type === 'trim') data[change.column] = data[change.column].trim();
        else if (change.type === 'lower') data[change.column] = data[change.column].toLowerCase();
        else if (change.type === 'upper') data[change.column] = data[change.column].toUpperCase();
        else if (change.type === 'removePrefix') { if (data[change.column].startsWith(change.value)) data[change.column] = data[change.column].slice(change.value.length); }
        else if (change.type === 'removeSuffix') { if (data[change.column].endsWith(change.value)) data[change.column] = data[change.column].slice(0,-change.value.length); }
        else data[change.column] = change.value;
      }
      return {...item, data};
    });
  }
  function changeColumns(headers, items, options) {
    if (options.mode === 'none') return {headers: [...headers], items};
    if (!['split','combine'].includes(options.mode)) throw new Error('Choose split or combine columns.');
    if (typeof options.separator !== 'string' || options.separator.length > 1000) throw new Error('Separators allow up to 1,000 characters.');
    const validColumn = c => Number.isInteger(c) && c >= 0 && c < headers.length;
    let names, convert;
    if (options.mode === 'split') {
      if (!validColumn(options.column)) throw new Error('Choose a column to split.');
      if (!options.separator) throw new Error('Enter a separator to split on.');
      if (!Number.isInteger(options.count) || options.count < 2 || options.count > 100) throw new Error('Split into between 2 and 100 new columns.');
      if (typeof options.name !== 'string' || !options.name.trim() || options.name.trim().length > 200) throw new Error('Enter a split column name prefix of up to 200 characters.');
      names = Array.from({length:options.count}, (_,i) => `${options.name.trim()} ${i+1}`);
      convert = item => {
        const source = item.data[options.column], parts = []; let start = 0;
        for (let i = 0; i < options.count-1; i++) {
          const end = source.indexOf(options.separator,start);
          if (end < 0) break;
          parts.push(source.slice(start,end)); start = end+options.separator.length;
        }
        parts.push(source.slice(start));
        while (parts.length < options.count) parts.push('');
        return options.trim ? parts.map(v=>v.trim()) : parts;
      };
    } else {
      if (!Array.isArray(options.columns) || options.columns.length < 2 || options.columns.some(c=>!validColumn(c)) || new Set(options.columns).size !== options.columns.length) throw new Error('Choose at least two different columns to combine.');
      if (typeof options.name !== 'string' || !options.name.trim() || options.name.trim().length > 200) throw new Error('Enter a combined column name of up to 200 characters.');
      names = [options.name.trim()];
      convert = item => {
        let parts = options.columns.map(c=>options.trim ? item.data[c].trim() : item.data[c]);
        if (options.skipEmpty) parts = parts.filter(v=>v!=='');
        const size = parts.reduce((n,v)=>n+v.length,0)+Math.max(0,parts.length-1)*options.separator.length;
        if (size > LIMITS.outputCharacters) throw new Error('A combined value exceeds 20 million characters. Use a shorter separator or fewer columns.');
        return [parts.join(options.separator)];
      };
    }
    const used = new Set(headers);
    names = names.map(base => { let name = base, n = 2; while(used.has(name)) name = `${base} (${n++})`; used.add(name); return name; });
    const outputHeaders = [...headers,...names];
    if (outputHeaders.length > LIMITS.columns || (items.length+1)*outputHeaders.length > LIMITS.cells) throw new Error('Column changes exceed 100 columns or 500,000 cells including headers. Split into fewer columns or filter to fewer rows.');
    let characters = outputHeaders.reduce((n,v)=>n+v.length,0);
    const output = items.map(item => {
      const data = [...item.data,...convert(item)];
      characters += data.reduce((n,v)=>n+v.length,0);
      if (characters > LIMITS.outputCharacters) throw new Error('Changed columns exceed 20 million characters. Filter to fewer rows or use a shorter separator.');
      return {...item,data};
    });
    return {headers:outputHeaders,items:output};
  }
  function appendManual(items, manualRows, width) {
    if (items.length + manualRows.length > LIMITS.rows) throw new Error('Combined output exceeds 20,000 rows. Reduce matching or manual rows.');
    return [...items, ...manualRows.map(data => {
      if (data.length !== width || data.some(v => typeof v !== 'string' || v.length > 10000)) throw new Error('Manual rows must contain one text value per loaded column, with at most 10,000 characters per cell.');
      return {data: [...data], record: 'Manual', criteria: [], columns: []};
    })];
  }
  function deduplicate(items, options) {
    if (!options.enabled) return {items, removed: 0};
    if (!options.columns.length) throw new Error('Select at least one key column for duplicate removal.');
    const seen = new Set();
    const result = items.filter(item => {
      const key = JSON.stringify(options.columns.map(i => {
        let value = item.data[i];
        if (options.trim) value = value.trim();
        if (options.ignoreCase) value = value.toLowerCase();
        return value;
      }));
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    return {items: result, removed: items.length - result.length};
  }
  function sortRows(items, rules) {
    const active = rules.filter(rule => rule.column !== '');
    const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
    function numeric(value) {
      const text = value.trim();
      if (!numberPattern.test(text) || !Number.isFinite(Number(text))) throw new Error('Number sorting requires finite numbers in every non-empty cell of the chosen column. Use text sorting for IDs, dates or mixed values.');
      const number = Number(text);
      if (Math.abs(number) > Number.MAX_SAFE_INTEGER) throw new Error('A sort value exceeds the safe number range. Use text sorting to preserve exact ordering.');
      return number;
    }
    const prepared = items.map((item, index) => ({item, index, keys: active.map(rule => {
      const value = item.data[rule.column];
      return value.trim() === '' ? null : rule.type === 'number' ? numeric(value) : value;
    })}));
    prepared.sort((a, b) => {
      for (let i = 0; i < active.length; i++) {
        const x = a.keys[i], y = b.keys[i];
        if (x === null && y === null) continue;
        if (x === null) return 1;
        if (y === null) return -1;
        const comparison = x < y ? -1 : x > y ? 1 : 0;
        if (comparison) return active[i].direction === 'desc' ? -comparison : comparison;
      }
      return a.index - b.index;
    });
    return prepared.map(row => row.item);
  }
  function protectCell(value, protect) {
    const text = String(value ?? '');
    return protect && /^(?:\s*[=+\-@]|[\t\r\n])/.test(text) ? "'" + text : text;
  }
  function escapeCell(value, protect) {
    const text = protectCell(value, protect);
    return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  }
  const reservedWords = new Set(('await break case catch class const continue debugger default delete do else enum export extends false finally for function if implements import in instanceof interface let new null package private protected public return static super switch this throw true try typeof var void while with yield eval arguments').split(' '));
  function variableName(value) {
    let name = String(value).trim().replace(/[^a-zA-Z0-9_$]/g, '_') || 'data';
    if (/^\d/.test(name) || reservedWords.has(name)) name = '_' + name;
    return name;
  }
  function serialize(headers, items, options) {
    const projection = options.projection || headers.map((name, index) => ({index, name}));
    if (!projection.length) throw new Error('Choose at least one output column.');
    const namesOnly = projection.map(p => p.name.trim());
    if (namesOnly.some(n => !n)) throw new Error('Output column names cannot be empty.');
    if (new Set(namesOnly).size !== namesOnly.length) throw new Error('Output column names must be unique.');
    let names = [...namesOnly];
    if (options.helpers) {
      const used = new Set(names);
      const helpers = ['Source record', 'Matched criteria', 'Matched columns'].map(base => {
        let name = base, n = 2;
        while (used.has(name)) name = `${base} (${n++})`;
        used.add(name); return name;
      });
      names = [...helpers, ...names];
    }
    const matrix = items.map(item => options.helpers ? [String(item.record), item.criteria.join(' | '), item.columns.map(i => headers[i]).join(' | '), ...projection.map(p => item.data[p.index])] : projection.map(p => item.data[p.index]));
    let outputSize = 0;
    function account(text) {
      outputSize += text.length + 2;
      if (outputSize > LIMITS.outputCharacters) throw new Error('Output exceeds 20 million characters. Reduce rows, columns or repeated matches.');
      return text;
    }
    if (['txt', 'md'].includes(options.format)) {
      const markdown = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/([\\`*_{}\[\]()#+.!|~\-])/g, '\\$1').replace(/\r\n|\r|\n/g, '<br>');
      const plain = value => { const s = String(value); return /["\t\r\n]/.test(s) || s === '' ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const line = row => account(options.format === 'md' ? '| ' + row.map(markdown).join(' | ') + ' |' : row.map(plain).join('\t'));
      const lines = [line(names)];
      if (options.format === 'md') lines.push('| ' + names.map(() => '---').join(' | ') + ' |');
      for (const row of matrix) lines.push(line(row));
      return {text: lines.join('\n'), extension: options.format, mime: options.format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8', preview: {headers: names, rows: matrix.slice(0, 100)}};
    }
    if (!['csv', 'json', 'js'].includes(options.format)) throw new Error('Choose a supported output format.');
    if (options.format === 'csv') return {text: [names, ...matrix].map(row => account(row.length === 1 && row[0] === '' ? '""' : row.map(v => escapeCell(v, options.protect)).join(','))).join('\r\n'), extension: 'csv', mime: 'text/csv;charset=utf-8', preview: {headers: names.map(n => protectCell(n, options.protect)), rows: matrix.slice(0, 100).map(row => row.map(v => protectCell(v, options.protect)))}};
    const splitIndex = options.split ? projection.findIndex(p => headers[p.index].toLowerCase() === options.splitColumn.trim().toLowerCase()) : -1;
    if (options.split && splitIndex < 0) throw new Error('Choose an included output column to split into an array.');
    const data = matrix.map(row => {
      const obj = Object.create(null);
      row.forEach((raw, i) => {
        let value = options.trimValues ? raw.trim() : raw;
        if (i === splitIndex + (options.helpers ? 3 : 0) && splitIndex >= 0) {
          value = value.split(',').map(v => options.trimValues ? v.trim() : v);
          if (options.omitEmpty) value = value.filter(v => v !== '');
        }
        obj[names[i]] = value;
      });
      return obj;
    });
    // Serialize properties in the chosen order, including numeric-looking column names.
    const indent = Number(options.indent ?? 2), gap = ' '.repeat(indent);
    const objects = data.map(obj => {
      const props = names.map(name => {
        const value = JSON.stringify(obj[name], null, indent);
        const key = options.format === 'js' && name === '__proto__' ? '["__proto__"]' : JSON.stringify(name);
        return key + (indent ? ': ' : ':') + value.replace(/\n/g, '\n' + gap.repeat(2));
      });
      return account(indent ? gap + '{\n' + props.map(p => gap.repeat(2) + p).join(',\n') + '\n' + gap + '}' : '{' + props.join(',') + '}');
    });
    let text = objects.length ? (indent ? '[\n' + objects.join(',\n') + '\n]' : '[' + objects.join(',') + ']') : '[]';
    if (options.format === 'js') text = `const ${variableName(options.variable)} = ${text};`;
    return {text, extension: options.format === 'js' ? 'js' : 'json', mime: options.format === 'js' ? 'text/javascript;charset=utf-8' : 'application/json;charset=utf-8', preview: {headers: names, rows: data.slice(0, 100).map(obj => names.map(name => Array.isArray(obj[name]) ? JSON.stringify(obj[name]) : obj[name]))}};
  }
  function partition(items, options, headers) {
    if (options.mode === 'rows') {
      if (!Number.isInteger(options.rows) || options.rows < 1 || options.rows > LIMITS.rows) throw new Error('Rows per file must be a whole number from 1 to 20,000.');
      if (Math.ceil(items.length / options.rows) > 200) throw new Error('Splitting allows up to 200 files. Increase rows per file.');
      return Array.from({length:Math.ceil(items.length/options.rows)},(_,i)=>({label:`Part ${i+1}`,items:items.slice(i*options.rows,(i+1)*options.rows)}));
    }
    if (options.mode !== 'value' || !Number.isInteger(options.column) || options.column < 0 || options.column >= headers.length) throw new Error('Choose a column to split files by.');
    const groups=new Map();
    for(const item of items){const key=item.data[options.column];if(!groups.has(key)){if(groups.size>=200)throw new Error('Splitting allows up to 200 distinct values.');groups.set(key,[]);}groups.get(key).push(item);}
    return [...groups].map(([label,items])=>({label:label===''?'(empty value)':JSON.stringify(label),items}));
  }
  // ZIP storage method: no compression or external runtime dependency.
  function zip(files) {
    const encoder=new TextEncoder(),parts=[],directory=[];let offset=0,total=0;
    function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
    for(const file of files){
      const name=encoder.encode(file.name),data=encoder.encode(file.text);total+=data.length;
      if(total>40*1024*1024)throw new Error('ZIP output exceeds 40 MiB. Reduce the output.');
      const checksum=crc(data),local=new Uint8Array(30+name.length),v=new DataView(local.buffer);
      v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,checksum,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);local.set(name,30);
      const central=new Uint8Array(46+name.length),d=new DataView(central.buffer);
      d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint16(14,33,true);d.setUint32(16,checksum,true);d.setUint32(20,data.length,true);d.setUint32(24,data.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);central.set(name,46);
      parts.push(local,data);directory.push(central);offset+=local.length+data.length;
    }
    const size=directory.reduce((n,p)=>n+p.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);
    v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);
    const all=[...parts,...directory,end],bytes=new Uint8Array(offset+size+22);let at=0;for(const part of all){bytes.set(part,at);at+=part.length;}return bytes;
  }
  return {LIMITS, parse, terms, filter, transform, changeColumns, appendManual, deduplicate, sortRows, serialize, variableName, partition, zip};
});
