/* Exact unsigned bitmask arithmetic and portable flag definitions. */
(function (root) {
  'use strict';
  const WIDTHS = Object.freeze([8, 16, 32, 64, 128]);
  const FILE_LIMIT = 262144, NAME_LIMIT = 200;
  function widthCheck(width) {
    if (!WIDTHS.includes(width)) throw new Error('Choose a width of 8, 16, 32, 64 or 128 bits.');
  }
  function parseValue(raw, width) {
    widthCheck(width);
    const text = raw.trim();
    if (!text) return null;
    if (text.length > 512) throw new Error('The value is too long. Use at most 512 characters.');
    if (text.startsWith('-')) throw new Error('Use a non-negative value. Signed masks are not supported.');
    if (!/^(?:[0-9]+|0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+)$/.test(text)) {
      throw new Error('Enter a whole number in decimal, or use 0x for hex, 0b for binary or 0o for octal.');
    }
    const value = BigInt(text);
    if (value >= (1n << BigInt(width))) throw new Error(`This value exceeds ${width} bits. Choose a wider width; the value has not been truncated.`);
    return value;
  }
  function enabledBits(value, width) {
    const bits = [];
    for (let bit = 0; bit < width; bit++) if ((value & (1n << BigInt(bit))) !== 0n) bits.push(bit);
    return bits;
  }
  function flagName(name) {
    if (typeof name !== 'string' || name.length > NAME_LIMIT) throw new Error('Each flag name must be text of at most 200 characters.');
    return name;
  }
  function validateConfiguration(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The configuration must be a JSON object.');
    if (data.version !== 1) throw new Error('Unsupported configuration version. Expected version 1.');
    widthCheck(data.bitWidth);
    if (typeof data.name !== 'string' || data.name.length > 100) throw new Error('The configuration name must be text of at most 100 characters.');
    if (!Array.isArray(data.flags) || data.flags.length > data.bitWidth) throw new Error('The flags must be an array with at most one entry per bit.');
    const seen = new Set();
    const flags = data.flags.map(flag => {
      if (!flag || !Number.isInteger(flag.bit) || flag.bit < 0 || flag.bit >= data.bitWidth) throw new Error(`Each bit must be a whole number from 0 to ${data.bitWidth - 1}.`);
      if (seen.has(flag.bit)) throw new Error(`Bit ${flag.bit} is defined twice.`);
      seen.add(flag.bit);
      return { bit: flag.bit, name: flagName(flag.name) };
    }).sort((a, b) => a.bit - b.bit);
    return { version: 1, name: data.name, bitWidth: data.bitWidth, flags };
  }
  function readConfiguration(text) {
    if (new TextEncoder().encode(text).length > FILE_LIMIT) throw new Error('Configuration files must be at most 256 KiB.');
    let data;
    try { data = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new Error('This file is not valid JSON.'); }
    return validateConfiguration(data);
  }
  function configuration(name, width, names) {
    return validateConfiguration({ version: 1, name, bitWidth: width, flags: Array.from(names, ([bit, name]) => ({ bit, name })).filter(flag => flag.name !== '') });
  }
  // Spreadsheet TSV supports quoted fields, doubled quotes and embedded line breaks.
  function spreadsheetRows(text) {
    if (text.length > 65536) throw new Error('Paste at most 65,536 characters of names.');
    text = text.replace(/\r\n?/g, '\n');
    const rows = [], row = [];
    let field = '', quoted = false, closed = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (char === '"') { quoted = false; closed = true; }
        else field += char;
      } else if (char === '\t' || char === '\n') {
        row.push(field); field = ''; closed = false;
        if (char === '\n') { rows.push(row.splice(0)); }
      } else if (char === '"' && field === '' && !closed) quoted = true;
      else {
        if (closed) throw new Error('Unexpected text after a quoted spreadsheet cell.');
        field += char;
      }
    }
    if (quoted) throw new Error('A quoted spreadsheet cell is missing its closing quote.');
    if (!text.endsWith('\n') || row.length || field || closed) { row.push(field); rows.push(row); }
    return rows;
  }
  function bulkNames(text, format, startBit, width) {
    widthCheck(width);
    if (!text) throw new Error('Paste flag names first.');
    if (!['names', 'bits'].includes(format)) throw new Error('Choose a supported paste format.');
    if (!Number.isInteger(startBit) || startBit < 0 || startBit >= width) throw new Error(`Starting bit must be from 0 to ${width - 1}.`);
    const rows = spreadsheetRows(text);
    if (rows.length > width) throw new Error(`Paste at most ${width} rows for this width.`);
    const seen = new Set();
    return rows.map((cells, index) => {
      if (cells.length !== (format === 'bits' ? 2 : 1)) throw new Error(`Row ${index + 1}: use ${format === 'bits' ? 'two columns: bit number and name' : 'one column of names'}.`);
      let bit = startBit + index;
      if (format === 'bits') {
        if (!/^\d+$/.test(cells[0].trim())) throw new Error(`Row ${index + 1}: the bit number must be a non-negative whole number.`);
        bit = Number(cells[0].trim());
      }
      if (bit >= width) throw new Error(`Row ${index + 1}: bit ${bit} is outside bits 0–${width - 1}. Choose a wider width or an earlier starting bit.`);
      if (seen.has(bit)) throw new Error(`Bit ${bit} is defined twice.`);
      seen.add(bit);
      return { bit, name: flagName(cells[format === 'bits' ? 1 : 0]) };
    });
  }
  const api = Object.freeze({ WIDTHS, FILE_LIMIT, NAME_LIMIT, parseValue, enabledBits, validateConfiguration, readConfiguration, configuration, bulkNames });
  root.BitwiseModel = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
