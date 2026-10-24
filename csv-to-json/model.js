/* CSV to JSON uses the site's shared parser and serializer. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../csv-search-filter-transform/model.js'));
  else root.CsvToJson = factory(root.CsvSuite);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (CSV) {
  'use strict';
  function convert(options) {
    const format = options.format ?? 'json';
    const indent = Number(options.indent ?? 2);
    if (!['json', 'js'].includes(format)) throw new Error('Choose JSON or JavaScript output.');
    if (![0, 2, 4].includes(indent)) throw new Error('Choose 0, 2 or 4 spaces for indentation.');
    const variable = String(options.variable ?? 'data');
    if (variable.length > 200) throw new Error('Use a variable name of up to 200 characters.');
    const table = CSV.parse(options.text);
    const warnings = [...table.warnings];
    const column = String(options.splitColumn ?? 'fields').trim();
    const matches = table.headers.filter(name => name.toLowerCase() === column.toLowerCase());
    if (options.split && !column) throw new Error('Enter the name of the column to split.');
    if (options.split && matches.length !== 1) throw new Error(matches.length ? 'Several columns match that name. Use distinct column names before splitting.' : `No column named “${column}” was found. Choose an existing column or turn off splitting.`);
    const name = CSV.variableName(variable);
    if (format === 'js' && name !== variable) warnings.push(`The JavaScript variable name was changed to “${name}” to make a valid declaration.`);
    const output = CSV.serialize(table.headers, table.rows, {
      format, indent, variable, split: Boolean(options.split), splitColumn: column,
      trimValues: options.trimValues !== false, omitEmpty: options.omitEmpty !== false
    });
    if (output.text.length > CSV.LIMITS.outputCharacters) throw new Error('Output exceeds 20 million characters. Use fewer rows or columns.');
    return {...output, warnings, count: table.rows.length, columns: table.headers.length};
  }
  return {LIMITS: CSV.LIMITS, convert};
});
