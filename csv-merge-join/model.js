/* CSV merge and join: local, bounded operations over the shared CSV parser. */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('../csv-search-filter-transform/model.js') : root.CsvSuite);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CsvMerge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (CSV) {
  'use strict';
  const LIMITS = Object.freeze({files: 10, bytes: 20 * 1024 * 1024, rows: 20000, columns: 100, cells: 500000, characters: 20000000});
  function checkInputs(tables) {
    if (!tables.length || tables.length > LIMITS.files) throw new Error('Load between 1 and 10 tables.');
    if (tables.reduce((n, t) => n + t.bytes, 0) > LIMITS.bytes) throw new Error('Combined inputs exceed 20 MiB. Remove a table or use smaller files.');
    if (tables.reduce((n, t) => n + t.rows.length, 0) > LIMITS.rows) throw new Error('Combined inputs exceed 20,000 data rows. Use smaller files.');
    if (tables.reduce((n, t) => n + (t.rows.length + 1) * t.headers.length, 0) > LIMITS.cells) throw new Error('Combined inputs exceed 500,000 cells. Use smaller files.');
  }
  function parse(text, name) {
    return {...CSV.parse(text), name: String(name).slice(0, 200), bytes: new TextEncoder().encode(text).length};
  }
  function unique(name, used) {
    let result = name, n = 2;
    while (used.has(result)) result = `${name} (${n++})`;
    used.add(result); return result;
  }
  function stackColumns(tables) {
    const names = [...new Set(tables.flatMap(t => t.headers))];
    if (names.length > LIMITS.columns) throw new Error('Stacking would create more than 100 columns. Align file headers before loading.');
    return names.map(name => ({name, included: true, sources: tables.map(t => t.headers.indexOf(name))}));
  }
  function matchColumns(a, b) {
    const used = new Set();
    return [a, b].flatMap((t, side) => t.headers.map((name, index) => ({side, index, included: true, name: unique(side === 1 && a.headers.includes(name) ? `${name} (second)` : name, used)})));
  }
  function validateNames(columns) {
    if (!columns.length) throw new Error('Include at least one output column.');
    const names = columns.map(c => c.name.trim());
    if (names.some(n => !n || n.length > 200) || new Set(names).size !== names.length) throw new Error('Output column names must be unique, non-empty and at most 200 characters.');
    return names;
  }
  function builder(headers) {
    if (headers.length > LIMITS.columns) throw new Error('Output exceeds 100 columns. Include fewer columns or turn off the helper column.');
    const rows = []; let characters = headers.reduce((n, h) => n + h.length, 0);
    return {headers, rows, add(row) {
      if (rows.length >= LIMITS.rows || (rows.length + 2) * headers.length > LIMITS.cells) throw new Error('Output exceeds 20,000 rows or 500,000 cells. Choose fewer matches or columns.');
      characters += row.reduce((n, v) => n + v.length, 0);
      if (characters > LIMITS.characters) throw new Error('Output exceeds 20 million characters. Choose fewer matches or columns.');
      rows.push({data: row});
    }};
  }
  function tableResult(b) { return {headers: b.headers, rows: b.rows}; }
  function stack(tables, columns, source) {
    checkInputs(tables);
    if (tables.length < 2) throw new Error('Add at least two tables to stack.');
    const selected = columns.filter(c => c.included), headers = validateNames(selected);
    for (const c of selected) if (c.sources.length !== tables.length || c.sources.some((v, i) => !Number.isInteger(v) || v < -1 || v >= tables[i].headers.length)) throw new Error('Check the column alignment.');
    if (source) headers.push(unique('Source table', new Set(headers)));
    const b = builder(headers);
    tables.forEach((table, i) => table.rows.forEach(row => {
      const data = selected.map(c => c.sources[i] < 0 ? '' : row.data[c.sources[i]]);
      if (source) data.push(table.name);
      b.add(data);
    }));
    return tableResult(b);
  }
  function join(a, b, options) {
    checkInputs([a, b]);
    const keys = options.keys;
    if (!keys.length || keys.length > 10 || keys.some(k => !Number.isInteger(k.a) || !Number.isInteger(k.b) || k.a < 0 || k.b < 0 || k.a >= a.headers.length || k.b >= b.headers.length)) throw new Error('Choose matching columns in both tables for every key pair (up to 10).');
    if (new Set(keys.map(k => k.a)).size !== keys.length || new Set(keys.map(k => k.b)).size !== keys.length) throw new Error('Use each matching column once.');
    if (!['stop', 'first', 'last', 'all'].includes(options.duplicates) || !['left', 'inner', 'full'].includes(options.keep)) throw new Error('Choose valid matching options.');
    const key = (row, side) => {
      const values = keys.map(k => {
        let v = row.data[k[side]];
        if (options.trim) v = v.trim();
        if (options.ignoreCase) v = v.toLowerCase();
        return v;
      });
      // Whitespace-only IDs are missing even when exact matching is selected.
      return values.some(v => !v.trim()) ? null : JSON.stringify(values);
    };
    function index(table, side) {
      const map = new Map(); let blanks = 0;
      table.rows.forEach((row, i) => {
        const k = key(row, side);
        if (k === null) { blanks++; return; }
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(i);
      });
      return {map, blanks, duplicateKeys: [...map.values()].filter(v => v.length > 1).length};
    }
    const ai = index(a, 'a'), bi = index(b, 'b');
    const stats = {duplicateA: ai.duplicateKeys, duplicateB: bi.duplicateKeys, blankA: ai.blanks, blankB: bi.blanks, matchedA: 0, matchedB: 0, unmatchedA: 0, unmatchedB: 0};
    const unmatchedA = a.rows.filter(row => { const k = key(row, 'a'); return k === null || !bi.map.has(k); });
    const unmatchedB = b.rows.filter(row => { const k = key(row, 'b'); return k === null || !ai.map.has(k); });
    stats.unmatchedA = unmatchedA.length; stats.unmatchedB = unmatchedB.length;
    stats.matchedA = a.rows.length - unmatchedA.length; stats.matchedB = b.rows.length - unmatchedB.length;
    const reports = {unmatchedA: {headers: [...a.headers], rows: unmatchedA}, unmatchedB: {headers: [...b.headers], rows: unmatchedB}};
    if (bi.duplicateKeys && options.duplicates === 'stop') return {...reports, stats, blocked: 'The second table has repeated matching keys. Choose how to handle them before creating the merged result.'};
    const selected = options.columns.filter(c => c.included), headers = validateNames(selected);
    if (selected.some(c => ![0, 1].includes(c.side) || !Number.isInteger(c.index) || c.index < 0 || c.index >= [a, b][c.side].headers.length)) throw new Error('Check the output column selection.');
    if (options.status) headers.push(unique('Match status', new Set(headers)));
    const out = builder(headers);
    function emit(left, right, status) {
      const row = selected.map(c => { const r = c.side === 0 ? left : right; return r ? r.data[c.index] : ''; });
      if (options.status) row.push(status);
      out.add(row);
    }
    a.rows.forEach(row => {
      const k = key(row, 'a'), matches = k === null ? [] : (bi.map.get(k) || []);
      if (!matches.length) { if (options.keep !== 'inner') emit(row, null, 'Only in first'); return; }
      const chosen = options.duplicates === 'all' ? matches : [options.duplicates === 'last' ? matches[matches.length - 1] : matches[0]];
      chosen.forEach(i => emit(row, b.rows[i], 'Matched'));
    });
    if (options.keep === 'full') unmatchedB.forEach(row => emit(null, row, 'Only in second'));
    return {...reports, stats, merged: tableResult(out)};
  }
  function serialize(table, protect = true, format = 'csv') {
    return CSV.serialize(table.headers, table.rows, {projection: table.headers.map((name, index) => ({name, index})), format, helpers: false, protect});
  }
  return {LIMITS, parse, checkInputs, stackColumns, matchColumns, stack, join, serialize};
});
