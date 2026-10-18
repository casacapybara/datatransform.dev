/* Data quality checks do not change source values. */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('../data-file-converter/model.js') : root.DataConverter);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DataQuality = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';
  const LIMITS = Object.freeze({issues:100000, characters:20000000, allowed:100, rules:100});
  const TYPES = {width:'Uneven row width', required:'Missing required value', keyMissing:'Missing key', keyDuplicate:'Duplicate key', rowDuplicate:'Duplicate row', number:'Invalid number', date:'Invalid date', category:'Unexpected category'};
  function normalize(value, options) { let s = options.trim ? value.trim() : value; return options.ignoreCase ? s.toLowerCase() : s; }
  function validDate(value, format) {
    const match = value.match(format === 'ymd' ? /^(\d{4})-(\d{2})-(\d{2})$/ : /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return false;
    const y = Number(match[format === 'ymd' ? 1 : 3]), m = Number(match[format === 'ymd' ? 2 : format === 'dmy' ? 2 : 1]), d = Number(match[format === 'ymd' ? 3 : format === 'dmy' ? 1 : 2]);
    const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
    return y >= 1 && m >= 1 && m <= 12 && d >= 1 && d <= [31,leap ? 29 : 28,31,30,31,30,31,31,30,31,30,31][m-1];
  }
  function validNumber(value, style, decimal) {
    if (style === 'integer') return /^[+-]?\d+$/.test(value) && Number.isFinite(Number(value));
    const pattern = decimal === 'comma' ? /^[+-]?(?:\d+(?:,\d*)?|,\d+)(?:[eE][+-]?\d+)?$/ : /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
    return pattern.test(value) && Number.isFinite(Number(value.replace(',', '.')));
  }
  function preparedRules(table, options) {
    if (!Array.isArray(options.rules) || options.rules.length > LIMITS.rules) throw new Error('Use up to 100 column checks.');
    const seen = new Set();
    return options.rules.map(rule => {
      const c = rule.column;
      if (!Number.isInteger(c) || c < 0 || c >= table.headers.length) throw new Error('Choose a column for every column check.');
      if (seen.has(c)) throw new Error('Use one column check per field. Combine required-value and format settings in that check.'); seen.add(c);
      if (!['none','number','date','category'].includes(rule.type)) throw new Error('Choose a supported value format.');
      if (!rule.required && rule.type === 'none') throw new Error('For each column check, enable required values or choose a value format.');
      if (rule.type === 'number' && (!['decimal','integer'].includes(rule.numberStyle) || !['dot','comma'].includes(rule.decimal))) throw new Error('Choose valid number settings.');
      if (rule.type === 'date' && !['ymd','dmy','mdy'].includes(rule.dateFormat)) throw new Error('Choose an explicit date format.');
      let allowed;
      if (rule.type === 'category') {
        if (typeof rule.allowed !== 'string' || rule.allowed.length > 20000) throw new Error('Allowed values must contain at most 20,000 characters.');
        const lines = rule.allowed.split(/\r\n|\r|\n/).filter(v => v.trim());
        if (lines.some(v => v.length > 200)) throw new Error('Each allowed category allows up to 200 characters.');
        allowed = new Set(lines.map(v => normalize(v, options)));
        if (!allowed.size || allowed.size > LIMITS.allowed) throw new Error('Enter between 1 and 100 distinct allowed categories, one per line.');
      }
      return {...rule, allowed};
    });
  }
  function check(table, options) {
    const rules = preparedRules(table, options), keys = options.keys;
    if (!Array.isArray(keys) || keys.some(k => !Number.isInteger(k) || k < 0 || k >= table.headers.length) || new Set(keys).size !== keys.length) throw new Error('Choose valid, distinct key columns.');
    const issues = [], affected = new Map(), counts = {}; let size = 0;
    function add(row, column, type, value, message) {
      size += column.length + value.length + message.length;
      if (issues.length >= LIMITS.issues || size > LIMITS.characters) throw new Error('The report exceeds 100,000 issues or 20 million characters. Run fewer checks or use a smaller file.');
      const issue = {row:row+1, column, type, value, message}; issues.push(issue); counts[type] = (counts[type] || 0) + 1;
      if (!affected.has(row)) affected.set(row, new Set()); affected.get(row).add(TYPES[type]);
    }
    for (const issue of table.structure || []) add(issue.index, '(whole row)', 'width', `${issue.actual} cells`, `Expected ${issue.expected} cells, found ${issue.actual}. Missing cells are blank in the row export; extra cells are retained in extra columns.`);
    for (const rule of rules) table.rows.forEach((row, i) => {
      const original = row[rule.column], value = options.trim ? original.trim() : original;
      if (!original.trim()) { if (rule.required) add(i, table.headers[rule.column], 'required', original, 'This column requires a nonblank value.'); return; }
      if (rule.type === 'number' && !validNumber(value, rule.numberStyle, rule.decimal)) add(i, table.headers[rule.column], 'number', original, rule.numberStyle === 'integer' ? 'Expected a whole number without separators, decimals or exponent notation.' : `Expected a decimal ${rule.decimal === 'comma' ? 'comma' : 'point'} number, optionally with exponent notation. Thousands separators and currency symbols are not accepted.`);
      if (rule.type === 'date' && !validDate(value, rule.dateFormat)) add(i, table.headers[rule.column], 'date', original, `Expected a real calendar date in ${ {ymd:'YYYY-MM-DD',dmy:'day/month/year',mdy:'month/day/year'}[rule.dateFormat]} order.`);
      if (rule.type === 'category' && !rule.allowed.has(normalize(original, options))) add(i, table.headers[rule.column], 'category', original, 'This value is not in the allowed category list.');
    });
    let duplicateRowGroups = 0, duplicateKeyGroups = 0;
    function duplicates(columns, type) {
      const map = new Map(), field = type === 'rowDuplicate' ? '(whole row)' : columns.map(c => table.headers[c]).join(' + ');
      let keySize = 0;
      table.rows.forEach((row, i) => {
        const values = columns.map(c => row[c]);
        if (type === 'keyDuplicate' && values.some(v => !v.trim())) { add(i, field, 'keyMissing', values.length === 1 ? values[0] : JSON.stringify(values), 'Every part of the selected key requires a nonblank value. Blank keys are excluded from duplicate-key matching.'); return; }
        const key = JSON.stringify(values.map(v => normalize(v, options))); keySize += key.length;
        if (keySize > 2 * LIMITS.characters) throw new Error('Duplicate matching keys exceed 40 million characters. Choose fewer key columns or a smaller file.');
        if (!map.has(key)) map.set(key, []); map.get(key).push(i);
      });
      let groups = 0;
      for (const indices of map.values()) if (indices.length > 1) {
        groups++;
        indices.forEach(i => add(i, field, type, type === 'rowDuplicate' ? '' : columns.length === 1 ? table.rows[i][columns[0]] : JSON.stringify(columns.map(c => table.rows[i][c])), `This ${type === 'rowDuplicate' ? 'row' : 'key'} occurs ${indices.length} times. First occurrence is data row ${indices[0]+1}. Every occurrence is flagged.`));
      }
      return groups;
    }
    if (options.duplicateRows) duplicateRowGroups = duplicates(table.headers.map((_,i) => i), 'rowDuplicate');
    if (keys.length) duplicateKeyGroups = duplicates(keys, 'keyDuplicate');
    const profile = table.headers.map((name, c) => {
      let blanks = 0; const values = new Set(), examples = [];
      table.rows.forEach(row => { const raw = row[c]; if (!raw.trim()) { blanks++; return; } const v = normalize(raw, options); if (!values.has(v) && examples.length < 3) examples.push(raw.length > 100 ? raw.slice(0,100)+'…' : raw); values.add(v); });
      return [name, String(blanks), String(values.size), examples.join(' | ')];
    });
    issues.sort((a,b) => a.row-b.row);
    return {issues, affected, profile, summary:{rows:table.rows.length, columns:table.headers.length, affected:affected.size, issues:issues.length, unflagged:table.rows.length-affected.size, counts, duplicateRowGroups, duplicateKeyGroups, columnChecks:rules.length, keyColumns:keys.length, duplicateRows:!!options.duplicateRows}};
  }
  function unique(base, names) { let s = base, i = 2; while (names.has(s)) s = `${base} (${i++})`; names.add(s); return s; }
  function serialize(table, report, view, protect = true, format = 'csv') {
    let headers, rows;
    if (view === 'issues') { headers = ['Data row','Field','Check','Value','Explanation']; rows = report.issues.map(i => [String(i.row), i.column, TYPES[i.type], i.value, i.message]); }
    else if (view === 'rows') {
      const used = new Set(table.headers), helper = [unique('Data row',used), unique('Issues',used)]; headers = [...helper, ...table.headers];
      rows = [...report.affected.keys()].sort((a,b) => a-b).map(i => [String(i+1), [...report.affected.get(i)].join('; '), ...table.rows[i]]);
    } else if (view === 'profile') { headers = ['Field','Blank cells','Distinct nonblank values','Example values (up to 3)']; rows = report.profile; }
    else throw new Error('Choose an available report view.');
    return C.output({headers,rows},{columns:headers.map((_,i) => i),format,protect});
  }
  function session(X) {
    let source = null, table = null, report = null; const importer = C.engine(X);
    return {
      load(input) {
        source = table = report = null;
        let format = input.format;
        if (input.bytes?.byteLength > C.LIMITS.bytes || (input.text !== undefined && new TextEncoder().encode(input.text).length > C.LIMITS.bytes)) throw new Error('Input exceeds 5 MiB. Choose a smaller file.');
        if (format === 'auto') {
          const ext = (input.name || '').split('.').pop().toLowerCase();
          format = ['xls','xlsx'].includes(ext) ? 'excel' : ['csv','tsv','json','jsonl','ndjson'].includes(ext) ? (ext === 'ndjson' ? 'jsonl' : ext) : 'auto';
        }
        let text = input.text;
        if (format !== 'excel' && input.bytes) { try { text = new TextDecoder('utf-8',{fatal:true}).decode(input.bytes); } catch { throw new Error('Text files must use UTF-8.'); } }
        text = String(text ?? '').replace(/^\uFEFF/,'');
        if (format === 'auto') format = /^\s*[\[{]/.test(text) ? 'json' : text.split(/\r\n|\r|\n/)[0].includes('\t') ? 'tsv' : 'csv';
        if (format === 'csv' || format === 'tsv') { source = {format,records:C.delimited(text,format === 'csv' ? ',' : '\t',{allowUneven:true})}; return {format,sheets:[],collections:[],defaultPath:'[]'}; }
        const meta = importer.load({...input,format}); source = {format}; return meta;
      },
      select(options) {
        table = report = null; if (!source) throw new Error('Load data first.');
        if (source.records) {
          const records = source.records, expected = records[0].length, width = Math.max(...records.map(r => r.length));
          const structure = records.slice(options.hasHeader ? 1 : 0).flatMap((row,index) => row.length === expected ? [] : [{index,expected,actual:row.length}]);
          const matrix = records.map((row,i) => Array.from({length:width},(_,c) => c < row.length ? row[c] : i === 0 && options.hasHeader ? `Extra cell ${c-expected+1}` : ''));
          table = {...C.matrix(matrix,options.hasHeader),structure};
          if (structure.length) table.warnings.push(`${structure.length} uneven data ${structure.length === 1 ? 'row will' : 'rows will'} be reported. Extra cells are retained in extra columns; absent cells are displayed as blanks.`);
        } else { importer.select(options); table = {...importer.snapshot(),structure:[]}; }
        return {headers:table.headers,count:table.rows.length,warnings:table.warnings,preview:table.rows.slice(0,5)};
      },
      check(options) { report = null; if (!table) throw new Error('Choose valid source data first.'); report = check(table,options); return report.summary; },
      export(options) { if (!table || !report) throw new Error('Run the checks before exporting a report.'); return serialize(table,report,options.view,options.protect,options.format || 'csv'); },
    };
  }
  return {LIMITS,TYPES,normalize,validDate,validNumber,check,serialize,session};
});
