/* Record-aware table comparison. Values remain text. */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('../csv-search-filter-transform/model.js') : root.CsvSuite);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TableComparison = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (csv) {
  'use strict';
  function align(before, after) {
    return before.headers.map((name, left) => ({left, right: after.headers.indexOf(name), key: false}));
  }
  function compare(before, after, mappings) {
    const pairs = mappings.filter(p => p.right !== -1);
    if (!pairs.length) throw new Error('Match at least one column between the tables.');
    for (const p of pairs) {
      if (!Number.isInteger(p.left) || !Number.isInteger(p.right) || p.left < 0 || p.left >= before.headers.length || p.right < 0 || p.right >= after.headers.length) throw new Error('Choose valid columns in both tables.');
    }
    if (new Set(pairs.map(p => p.left)).size !== pairs.length || new Set(pairs.map(p => p.right)).size !== pairs.length) throw new Error('Match each column only once.');
    const keys = pairs.filter(p => p.key);
    if (!keys.length) throw new Error('Select at least one identifying column.');
    const keyFor = (row, side) => JSON.stringify(keys.map(p => row.data[p[side]]));
    function index(table, side, label) {
      const result = new Map();
      for (const row of table.rows) {
        if (keys.some(p => row.data[p[side]].trim() === '')) throw new Error(`${label} record ${row.record} has a blank identifying value. Fill it in or choose different identifying columns.`);
        const key = keyFor(row, side);
        if (result.has(key)) throw new Error(`${label} records ${result.get(key).record} and ${row.record} have the same identifying values. Add another identifying column or fix the duplicate.`);
        result.set(key, row);
      }
      return result;
    }
    const left = index(before, 'left', 'Original'), right = index(after, 'right', 'Updated');
    const added = [], removed = [], changed = [];
    let unchanged = 0, changedCells = 0;
    for (const [key, row] of left) {
      const match = right.get(key);
      if (!match) { removed.push(row); continue; }
      const cells = pairs.filter(p => row.data[p.left] !== match.data[p.right]).map(p => ({originalColumn: before.headers[p.left], updatedColumn: after.headers[p.right], before: row.data[p.left], after: match.data[p.right]}));
      if (cells.length) { changed.push({key: JSON.parse(key), original: row, updated: match, cells}); changedCells += cells.length; }
      else unchanged++;
    }
    for (const [key, row] of right) if (!left.has(key)) added.push(row);
    return {
      summary: {added: added.length, removed: removed.length, changed: changed.length, changedCells, unchanged},
      columns: pairs.map(p => ({original: before.headers[p.left], updated: after.headers[p.right], identifying: Boolean(p.key)})),
      ignoredColumns: {original: before.headers.filter((_, i) => !pairs.some(p => p.left === i)), updated: after.headers.filter((_, i) => !pairs.some(p => p.right === i))},
      headers: {original: before.headers, updated: after.headers}, added, removed, changed
    };
  }
  function report(result, format) {
    if (format === 'json') {
      // Bound repeated column names and full-record values before building a large report.
      let size = 0;
      const text = JSON.stringify(result, function (key, value) {
        size += JSON.stringify(key).length + 16;
        if (typeof value === 'string') size += JSON.stringify(value).length;
        if (size > csv.LIMITS.outputCharacters) throw new Error('Report exceeds 20 million characters. Compare fewer rows or columns.');
        return value;
      }, 2);
      if (text.length > csv.LIMITS.outputCharacters) throw new Error('Report exceeds 20 million characters. Compare fewer rows or columns.');
      return text;
    }
    const keys = result.columns.filter(p => p.identifying);
    const records = [];
    for (const [status, items, side] of [['added', result.added, 'updated'], ['removed', result.removed, 'original']]) {
      for (const row of items) {
        const identity = JSON.stringify(keys.map(p => row.data[result.headers[side].indexOf(p[side])]));
        result.headers[side].forEach((column, i) => records.push([status, identity, side === 'original' ? row.record : '', side === 'updated' ? row.record : '', side === 'original' ? column : '', side === 'updated' ? column : '', side === 'original' ? row.data[i] : '', side === 'updated' ? row.data[i] : '']));
      }
    }
    for (const row of result.changed) for (const cell of row.cells) records.push(['changed', JSON.stringify(row.key), row.original.record, row.updated.record, cell.originalColumn, cell.updatedColumn, cell.before, cell.after]);
    const headers = ['Status', 'Identifying values (JSON)', 'Original record', 'Updated record', 'Original column', 'Updated column', 'Original value', 'Updated value'];
    return csv.serialize(headers, records.map(data => ({data})), {format, protect: true}).text;
  }
  function parse(text) {
    const table = csv.parse(text);
    if (table.headers.some(name => name.length > 1000)) throw new Error('Column names allow at most 1,000 characters. Shorten the headers before loading.');
    return table;
  }
  return {parse, LIMITS: csv.LIMITS, align, compare, report};
});
