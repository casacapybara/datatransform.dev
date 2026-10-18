/* Table conversion. JSON number tokens retain their original digits. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DataConverter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const LIMITS = Object.freeze({bytes: 5 * 1024 * 1024, rows: 20000, columns: 100, cells: 500000, characters: 20000000, nodes: 500000, depth: 40, expandedBytes: 25 * 1024 * 1024});
  class JsonNumber { constructor(token) { this.token = token; } }
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof JsonNumber);
  function size(text) { if (new TextEncoder().encode(text).length > LIMITS.bytes) throw new Error('Input exceeds 5 MiB. Choose a smaller file.'); }
  function stringify(v) {
    if (v instanceof JsonNumber) return v.token;
    if (Array.isArray(v)) return '[' + v.map(x => stringify(x)).join(',') + ']';
    if (object(v)) return '{' + Object.keys(v).map(k => JSON.stringify(k) + ':' + stringify(v[k])).join(',') + '}';
    return JSON.stringify(v);
  }
  function cellText(v) { return v == null ? '' : typeof v === 'string' ? v : stringify(v); }
  function jsonParse(text) {
    let i = 0, nodes = 0;
    function ws() { while (/[\t\n\r ]/.test(text[i] || '\0')) i++; }
    function fail(message) { throw new Error(`Invalid JSON near character ${i + 1}: ${message}`); }
    function string() {
      const start = i++;
      while (i < text.length) {
        if (text[i] === '\\') { i += 2; continue; }
        if (text[i++] === '"') {
          try { return JSON.parse(text.slice(start, i)); } catch { fail('check the string escaping.'); }
        }
      }
      fail('unclosed string.');
    }
    function value(depth) {
      if (depth > LIMITS.depth || ++nodes > LIMITS.nodes) throw new Error('JSON exceeds 40 nesting levels or 500,000 values.');
      ws(); const c = text[i];
      if (c === '"') return string();
      if (c === '{') {
        i++; ws(); const result = Object.create(null);
        if (text[i] === '}') { i++; return result; }
        while (i < text.length) {
          if (text[i] !== '"') fail('expected a quoted field name.');
          const k = string();
          if (k.length > 200) throw new Error('JSON field names allow up to 200 characters.');
          if (own(result, k)) fail('duplicate field name. Give every field a unique name.');
          ws(); if (text[i++] !== ':') fail('expected a colon.');
          result[k] = value(depth + 1); ws();
          if (text[i] === '}') { i++; return result; }
          if (text[i++] !== ',') fail('expected a comma.'); ws();
        }
        fail('unclosed object.');
      }
      if (c === '[') {
        i++; ws(); const result = [];
        if (text[i] === ']') { i++; return result; }
        while (i < text.length) {
          result.push(value(depth + 1));
          if (result.length > LIMITS.rows) throw new Error('A JSON array exceeds 20,000 items.');
          ws(); if (text[i] === ']') { i++; return result; }
          if (text[i++] !== ',') fail('expected a comma.');
        }
        fail('unclosed array.');
      }
      for (const [token, result] of [['true', true], ['false', false], ['null', null]]) if (text.startsWith(token, i)) { i += token.length; return result; }
      const match = text.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (match) { i += match[0].length; return new JsonNumber(match[0]); }
      fail('expected a JSON value.');
    }
    const result = value(0); ws(); if (i !== text.length) fail('unexpected text after the value.');
    return {value: result, nodes};
  }
  function delimited(text, delimiter, options = {}) {
    const records = []; let row = [], field = '', quoted = false, closed = false, started = false, cells = 0;
    function pushCell() {
      row.push(field); field = ''; closed = started = false;
      if (row.length > LIMITS.columns || ++cells > LIMITS.cells) throw new Error('Input exceeds 100 columns or 500,000 cells.');
    }
    function pushRow() {
      if (row.length || started || closed || field.length) { pushCell(); records.push(row); }
      if (records.length > LIMITS.rows + 1) throw new Error('Input exceeds 20,001 records including the possible header.');
      row = []; field = ''; started = closed = false;
    }
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
        else field += c;
      } else if (c === delimiter) pushCell();
      else if (c === '\r' || c === '\n') { pushRow(); if (c === '\r' && text[i + 1] === '\n') i++; }
      else if (closed) throw new Error(`Unexpected text after a closing quote in record ${records.length + 1}.`);
      else if (c === '"') { if (started) throw new Error('Quote the whole cell and double any quotes inside it.'); quoted = started = true; }
      else { field += c; started = true; }
    }
    if (quoted) throw new Error('Input contains an unclosed quoted cell.'); pushRow();
    if (!records.length) throw new Error('Load a file with at least one record.');
    const width = records[0].length;
    if (!options.allowUneven) records.forEach((r, i) => { if (r.length !== width) throw new Error(`Record ${i + 1} has ${r.length} cells; expected ${width}.`); });
    return records;
  }
  function headers(raw) {
    const used = new Set(), reserved = new Set(raw.map(v => cellText(v).trim()).filter(Boolean)); let changed = false;
    const names = raw.map((v, i) => {
      const original = cellText(v), base = original.trim() || `Column ${i + 1}`; let name = base, n = 2;
      while (used.has(name) || (name !== original.trim() && reserved.has(name))) name = `${base} (${n++})`;
      used.add(name); if (name !== original) changed = true; return name;
    });
    return {names, warnings: changed ? ['Blank, duplicate or padded headers received unique, trimmed names. Review the field names.'] : []};
  }
  function validateTable(names, rows) {
    if (!names.length || names.length > LIMITS.columns) throw new Error('Choose data with between 1 and 100 fields.');
    if (names.some(name => name.length > 200)) throw new Error('Output field names allow up to 200 characters, including nested JSON paths. Shorten the source headers or field names.');
    if (rows.length > LIMITS.rows || (rows.length + 1) * names.length > LIMITS.cells) throw new Error('Selected data exceeds 20,000 rows or 500,000 cells including headers.');
    let chars = names.join('').length;
    for (const row of rows) for (const v of row) { chars += cellText(v).length; if (chars > LIMITS.characters) throw new Error('Selected data exceeds 20 million characters.'); }
    return {headers: names, rows};
  }
  function matrix(records, hasHeader) {
    if (!records.length || !records[0].length) throw new Error('This selection is empty. Choose another sheet or record collection.');
    const width = records[0].length;
    if (records.some(r => r.length !== width)) throw new Error('Selected rows have different numbers of cells.');
    const h = headers(hasHeader ? records[0] : records[0].map((_, i) => `Column ${i + 1}`));
    return {...validateTable(h.names, hasHeader ? records.slice(1) : records), warnings: h.warnings};
  }
  function pathLabel(path) {
    return path.reduce((s, k) => /^[A-Za-z_$][\w$]*$/.test(k) ? s + (s ? '.' : '') + k : s + '[' + JSON.stringify(k) + ']', '');
  }
  function collections(value) {
    const result = [];
    function visit(v, path) {
      if (result.length >= 100) throw new Error('JSON has more than 100 candidate collections. Use a smaller document.');
      if (Array.isArray(v)) { result.push({path, label: '$' + (path.length ? '.' + pathLabel(path) : '') + ` (${v.length} ${v.length === 1 ? 'record' : 'records'})`, count: v.length, matrix: v.length > 0 && v.every(Array.isArray)}); return; }
      if (object(v)) Object.keys(v).forEach(k => { if (object(v[k]) || Array.isArray(v[k])) visit(v[k], [...path, k]); });
    }
    visit(value, []);
    const arrays = result.length;
    if (!Array.isArray(value)) result.unshift({path: [], label: object(value) ? 'Whole object (1 record)' : 'Single value (1 record)', count: 1});
    return {items: result, defaultPath: arrays === 1 ? JSON.stringify(result[Array.isArray(value) ? 0 : 1].path) : arrays === 0 ? '[]' : ''};
  }
  function at(v, path) { for (const k of path) { if (!object(v) || !own(v, k)) return undefined; v = v[k]; } return v; }
  function jsonTable(value, hasHeader) {
    const records = Array.isArray(value) ? value : [value];
    if (!records.length) throw new Error('This JSON collection has no records. Choose another collection.');
    if (records.every(Array.isArray)) return matrix(records, hasHeader);
    if (records.every(object)) {
      const paths = [], seen = new Set();
      function fields(v, path) {
        if (object(v) && Object.keys(v).length) { Object.keys(v).forEach(k => fields(v[k], [...path, k])); return; }
        const id = JSON.stringify(path);
        if (!seen.has(id)) { seen.add(id); paths.push(path); if (paths.length > LIMITS.columns) throw new Error('JSON expands to more than 100 fields. Choose a smaller collection.'); }
      }
      records.forEach(r => Object.keys(r).forEach(k => fields(r[k], [k])));
      const names = paths.map(pathLabel);
      return {...validateTable(names, records.map(r => paths.map(p => at(r, p)))), warnings: paths.some(p => p.length > 1) ? ['Nested object fields became separate columns. JSON output uses these column names as flat field names.'] : []};
    }
    if (records.every(v => !object(v) && !Array.isArray(v))) return {...validateTable(['Value'], records.map(v => [v])), warnings: []};
    throw new Error('Choose records containing only objects, only arrays, or only scalar values. Mixed record shapes cannot form a table.');
  }
  function checkZip(bytes) {
    const u = new Uint8Array(bytes), view = new DataView(u.buffer, u.byteOffset, u.byteLength);
    if (u[0] !== 0x50 || u[1] !== 0x4b) return;
    let end = -1;
    for (let i = u.length - 22; i >= Math.max(0, u.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === u.length) { end = i; break; }
    if (end < 0) throw new Error('Invalid Excel ZIP archive.');
    const count = view.getUint16(end + 10, true); let pos = view.getUint32(end + 16, true), total = 0;
    if (count > 2048 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw new Error('Excel archive has too many entries or uses an unsupported multi-part archive.');
    for (let i = 0; i < count; i++) {
      if (pos + 46 > end || view.getUint32(pos, true) !== 0x02014b50) throw new Error('Invalid Excel archive directory.');
      const expanded = view.getUint32(pos + 24, true); total += expanded;
      if (expanded === 0xffffffff || total > LIMITS.expandedBytes) throw new Error('Excel archive exceeds the 25 MiB expanded-size limit.');
      if (view.getUint16(pos + 8, true) & 1) throw new Error('Encrypted Excel files are not supported.');
      pos += 46 + view.getUint16(pos + 28, true) + view.getUint16(pos + 30, true) + view.getUint16(pos + 32, true);
    }
  }
  function excelTable(X, workbook, sheetName, options) {
    if (!own(workbook.Sheets, sheetName)) throw new Error('Choose an available worksheet.');
    const sheet = workbook.Sheets[sheetName];
    if (!sheet['!ref']) throw new Error('This worksheet is empty. Choose another sheet.');
    const range = X.utils.decode_range(sheet['!fullref'] || sheet['!ref']);
    if (range.e.r - range.s.r + 1 > LIMITS.rows + (options.hasHeader ? 1 : 0) || range.e.c - range.s.c + 1 > LIMITS.columns || (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1) > LIMITS.cells) throw new Error('Worksheet range exceeds 20,000 data rows, 100 columns or 500,000 cells. Remove distant formatted cells or choose a smaller sheet.');
    const records = []; let formulas = 0, errors = 0;
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[X.utils.encode_cell({r,c})];
        if (!cell) { row.push(''); continue; }
        if (cell.f) { formulas++; if (cell.v == null) throw new Error('A formula has no stored result. Recalculate and save the workbook in Excel before converting it.'); }
        if (cell.t === 'e') errors++;
        const raw = options.excelValues === 'raw' && cell.t !== 'e';
        if (raw && typeof cell.v === 'number' && (!Number.isFinite(cell.v) || (Number.isInteger(cell.v) && !Number.isSafeInteger(cell.v)))) throw new Error('A worksheet number exceeds safe numeric precision. Choose displayed text to preserve the displayed value.');
        row.push(raw ? (cell.v ?? '') : X.utils.format_cell(cell));
      }
      records.push(row);
    }
    const result = matrix(records, options.hasHeader);
    result.warnings.push(options.excelValues === 'raw' ? 'Excel underlying values selected. Dates are numeric Excel serials; formats and leading-zero display masks are removed.' : 'Excel displayed text selected. Dates, currencies and formatted IDs use their saved display formats.');
    if (formulas) result.warnings.push(`${formulas} formula cells use stored results. Formulas are not recalculated or exported.`);
    if (errors) result.warnings.push(`${errors} Excel error cells are kept as text.`);
    if (sheet['!merges']?.length) result.warnings.push('Merged cells keep their top-left value; other cells remain blank.');
    return result;
  }
  function protect(v, enabled) { return enabled && /^(?:\s*[=+\-@]|[\t\r\n])/.test(v) ? "'" + v : v; }
  function markdown(v) {
    return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\\/g, '\\\\').replace(/([`*_[\]{}()!#|~])/g, '\\$1').replace(/\r\n|\r|\n/g, '<br>');
  }
  function output(table, options, X) {
    const indices = options.columns;
    if (!indices?.length || new Set(indices).size !== indices.length || indices.some(i => !Number.isInteger(i) || i < 0 || i >= table.headers.length)) throw new Error('Include at least one field and choose each field once.');
    const names = indices.map(i => table.headers[i]), rows = table.rows.map(row => indices.map(i => row[i]));
    const format = options.format, spreadsheet = format === 'csv' || format === 'tsv';
    const textNames = names.map(v => protect(v, spreadsheet && options.protect));
    const previews = rows.slice(0, 100).map(row => row.map(v => protect(cellText(v), spreadsheet && options.protect)));
    const result = {headers: textNames, preview: previews, count: rows.length, warnings: [], extension: format, mime: 'text/plain;charset=utf-8'};
    let chars = 0;
    function account(text) { chars += text.length + 2; if (chars > LIMITS.characters) throw new Error('Output exceeds 20 million characters. Include fewer fields or use a smaller input.'); return text; }
    if (spreadsheet || format === 'txt') {
      const d = format === 'csv' ? ',' : '\t';
      const escape = v => { const s = protect(cellText(v), spreadsheet && options.protect); return s === '' || /["\r\n]/.test(s) || s.includes(d) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      result.text = [names, ...rows].map(row => account(row.map(escape).join(d))).join('\r\n');
      result.mime = format === 'txt' ? 'text/plain;charset=utf-8' : format === 'csv' ? 'text/csv;charset=utf-8' : 'text/tab-separated-values;charset=utf-8';
    } else if (format === 'json' || format === 'jsonl') {
      const records = rows.map(row => account('{' + row.flatMap((v, i) => v === undefined ? [] : [JSON.stringify(names[i]) + ':' + stringify(v)]).join(',') + '}'));
      result.text = format === 'jsonl' ? records.join('\n') : (records.length ? '[\n' + records.join(',\n') + '\n]' : '[]');
      result.mime = format === 'json' ? 'application/json;charset=utf-8' : 'application/x-ndjson;charset=utf-8';
    } else if (format === 'md') {
      const line = row => account('| ' + row.map(v => markdown(cellText(v))).join(' | ') + ' |');
      result.text = [line(names), line(names.map(() => '---')), ...rows.map(line)].join('\n');
      result.mime = 'text/markdown;charset=utf-8';
    } else if (format === 'xlsx') {
      if (!X) throw new Error('Excel support could not load. Reload the page and try again.');
      const values = [names, ...rows].map(row => row.map(v => {
        // JSON number tokens use text cells to preserve digits Excel cannot represent exactly.
        if (v instanceof JsonNumber) return v.token;
        return v == null ? '' : object(v) || Array.isArray(v) ? stringify(v) : v;
      }));
      if (values.some(row => row.some(v => typeof v === 'string' && v.length > 32767))) throw new Error('Excel cells allow up to 32,767 characters. Choose another format or shorter cell values.');
      const book = X.utils.book_new(), sheet = X.utils.aoa_to_sheet(values);
      X.utils.book_append_sheet(book, sheet, 'Converted data');
      result.bytes = X.write(book, {type:'array',bookType:'xlsx',compression:true});
      if (result.bytes.byteLength > LIMITS.characters) throw new Error('Excel output exceeds 20 MB. Use a smaller input.');
      result.mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      result.warnings.push('One worksheet of values is exported. JSON numbers are text cells to preserve exact digits. Formatting, formulas and macros are not copied.');
    } else throw new Error('Choose a supported output format.');
    if (['csv','tsv','txt','md','xlsx'].includes(format)) {
      if (rows.some(row => row.some(v => v == null))) result.warnings.push('Null and missing values become empty cells.');
      if (rows.some(row => row.some(v => object(v) || Array.isArray(v)))) result.warnings.push('Nested arrays and objects become JSON text in one cell.');
    }
    return result;
  }
  function engine(X) {
    let source = null, table = null;
    return {
      load(input) {
        source = table = null;
        let format = input.format, text = input.text;
        if (input.bytes && input.bytes.byteLength > LIMITS.bytes) throw new Error('Input exceeds 5 MiB.');
        if (format === 'auto') {
          const ext = (input.name || '').split('.').pop().toLowerCase();
          format = ['xls','xlsx'].includes(ext) ? 'excel' : ['csv','tsv','json','jsonl','ndjson'].includes(ext) ? (ext === 'ndjson' ? 'jsonl' : ext) : 'auto';
        }
        if (format !== 'excel') {
          if (input.bytes) { try { text = new TextDecoder('utf-8', {fatal:true}).decode(input.bytes); } catch { throw new Error('Text files must use UTF-8. Resave this file with UTF-8 encoding.'); } }
          text = String(text ?? ''); size(text); text = text.replace(/^\uFEFF/, '');
          if (format === 'auto') format = /^[\s]*[\[{]/.test(text) ? 'json' : text.split(/\r\n|\r|\n/)[0].includes('\t') ? 'tsv' : 'csv';
        }
        let meta = {format, sheets: [], collections: [], defaultPath: '[]'};
        if (format === 'excel') {
          if (!X || !input.bytes) throw new Error('Choose an Excel file to load.');
          const signature = new Uint8Array(input.bytes);
          if (!(signature[0] === 0x50 && signature[1] === 0x4b && signature[2] === 3 && signature[3] === 4) && ![0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1].every((b,i) => signature[i] === b)) throw new Error('Choose a valid .xlsx or binary .xls workbook. Text files need CSV, TSV or JSON input mode.');
          checkZip(input.bytes);
          let book;
          try { book = X.read(input.bytes, {type:'array',cellNF:true,cellText:true,cellFormula:true,bookVBA:false,sheetRows:LIMITS.rows+2}); }
          catch { throw new Error('Could not read this Excel file. Check that it is a valid, unencrypted .xlsx or .xls workbook.'); }
          if (!book.SheetNames.length || book.SheetNames.length > 100) throw new Error('A workbook must contain between 1 and 100 worksheets.');
          source = {format, book}; meta.sheets = book.SheetNames.map(name => ({name,hidden:!!book.Workbook?.Sheets?.find(s => s.name === name)?.Hidden}));
        } else if (format === 'csv' || format === 'tsv') source = {format, records:delimited(text, format === 'csv' ? ',' : '\t')};
        else if (format === 'json' || format === 'jsonl') {
          let value;
          if (format === 'jsonl') {
            const lines = text.split(/\r\n|\r|\n/).filter(s => s.trim());
            if (!lines.length || lines.length > LIMITS.rows) throw new Error('JSON Lines requires between 1 and 20,000 nonblank lines.');
            let nodes = 0;
            value = lines.map((line, i) => { try { const result = jsonParse(line); nodes += result.nodes; if (nodes > LIMITS.nodes) throw new Error('JSON Lines exceeds 500,000 values.'); return result.value; } catch (e) { throw new Error(`JSON Lines record ${i + 1}: ${e.message}`); } });
          } else value = jsonParse(text).value;
          source = {format, value}; const c = collections(value); meta.collections = c.items; meta.defaultPath = c.defaultPath;
        } else throw new Error('Choose CSV, TSV, JSON, JSON Lines or Excel input.');
        return meta;
      },
      select(options) {
        table = null; if (!source) throw new Error('Load a file or pasted text first.');
        if (source.format === 'excel') table = excelTable(X, source.book, options.sheet, options);
        else if (source.records) table = matrix(source.records, options.hasHeader);
        else {
          const candidates = collections(source.value).items;
          const candidate = candidates.find(c => JSON.stringify(c.path) === options.path);
          if (!candidate) throw new Error('Choose the JSON collection containing the records you want.');
          table = jsonTable(at(source.value, candidate.path), options.hasHeader);
        }
        return {headers:table.headers, count:table.rows.length, warnings:table.warnings, preview:table.rows.slice(0,100).map(r => r.map(cellText))};
      },
      snapshot() { if (!table) throw new Error('Choose valid source data first.'); return {headers:[...table.headers], rows:table.rows.map(row => row.map(cellText)), warnings:[...table.warnings]}; },
      export(options) { if (!table) throw new Error('Choose valid source data before exporting.'); return output(table, options, X); },
    };
  }
  return {LIMITS, JsonNumber, jsonParse, stringify, cellText, delimited, matrix, jsonTable, collections, checkZip, output, engine};
});
