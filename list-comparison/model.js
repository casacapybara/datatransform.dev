/* First-party browser-only list comparison, covered by the repository MIT licence. */
(function (root) {
  'use strict';
  const LIMITS = Object.freeze({ inputChars: 1000000, lines: 20000, nameChars: 100, outputChars: 10000000, transformChars: 1000 });
  const defaults = Object.freeze({ caseInsensitive: true, trimWhitespace: true, ignoreBlankLines: true, dedupeWithinLists: true, sortOutput: true });
  const cleanupDefaults = Object.freeze({ prefix: '', suffix: '', replaceEnabled: false, find: '', replacement: '', collapseWhitespace: false, unicodeNormalize: false });
  function cleanupOptions(settings) {
    const options = { ...cleanupDefaults, ...settings };
    for (const key of ['prefix', 'suffix', 'find', 'replacement']) {
      if (typeof options[key] !== 'string' || options[key].length > LIMITS.transformChars) throw new Error('Cleanup text is limited to 1,000 characters per field.');
      if (/[\r\n]/.test(options[key])) throw new Error('Cleanup text cannot contain line breaks.');
    }
    if (options.replaceEnabled && !options.find) throw new Error('Enter text to find, or turn off find and replace.');
    return options;
  }
  function transform(value, options) {
    let item = value;
    if (options.prefix && item.startsWith(options.prefix)) item = item.slice(options.prefix.length);
    if (options.suffix && item.endsWith(options.suffix)) item = item.slice(0, -options.suffix.length);
    if (options.replaceEnabled) {
      // Count non-overlapping literal matches before allocating an expanded string.
      let count = 0, start = 0, at;
      while ((at = item.indexOf(options.find, start)) !== -1) { count++; start = at + options.find.length; }
      const length = item.length + count * (options.replacement.length - options.find.length);
      if (length > LIMITS.inputChars) throw new Error('Cleanup output exceeds 1,000,000 characters per list.');
      item = item.split(options.find).join(options.replacement);
    }
    if (options.collapseWhitespace) item = item.replace(/[^\S\r\n]+/gu, ' ');
    if (options.unicodeNormalize) item = item.normalize('NFC');
    return item;
  }
  function parseList(text, options, cleanup) {
    if (typeof text !== 'string') throw new Error('Lists must contain text.');
    if (text.length > LIMITS.inputChars) throw new Error('Each list is limited to 1,000,000 characters.');
    const lines = text === '' ? [] : text.split(/\r\n|\n|\r/);
    if (lines.length > LIMITS.lines) throw new Error('Each list is limited to 20,000 lines, including blanks.');
    const items = [], preview = []; let size = 0;
    for (const raw of lines) {
      const cleaned = transform(raw, cleanup);
      size += cleaned.length + 1;
      if (size > LIMITS.inputChars + 1) throw new Error('Cleanup output exceeds 1,000,000 characters per list.');
      const display = options.trimWhitespace ? cleaned.trim() : cleaned;
      const key = options.caseInsensitive ? display.toLowerCase() : display;
      if (preview.length < 3) preview.push({ before: raw, after: display });
      if (options.ignoreBlankLines && key === '') continue;
      items.push({ key, display });
    }
    return { items, preview };
  }
  function unique(items) {
    const seen = new Set();
    return items.filter(item => { if (seen.has(item.key)) return false; seen.add(item.key); return true; });
  }
  const naturalOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare;
  function sortItems(items) {
    return [...items].sort((a, b) => naturalOrder(a, b));
  }
  function compare(left, right, settings = {}, cleanupSettings = {}) {
    const options = { ...defaults, ...settings }, cleanup = cleanupOptions(cleanupSettings);
    const leftParsed = parseList(left, options, cleanup), rightParsed = parseList(right, options, cleanup);
    const rawLeft = leftParsed.items, rawRight = rightParsed.items;
    const leftItems = options.dedupeWithinLists ? unique(rawLeft) : rawLeft;
    const rightItems = options.dedupeWithinLists ? unique(rawRight) : rawRight;
    const leftKeys = new Set(leftItems.map(item => item.key)), rightKeys = new Set(rightItems.map(item => item.key));
    let both = leftItems.filter(item => rightKeys.has(item.key)).map(item => item.display);
    let leftOnly = leftItems.filter(item => !rightKeys.has(item.key)).map(item => item.display);
    let rightOnly = rightItems.filter(item => !leftKeys.has(item.key)).map(item => item.display);
    let union = unique([...leftItems, ...rightItems]).map(item => item.display);
    let differences = [...leftOnly, ...rightOnly];
    const counts = new Map();
    for (const [items, side] of [[rawLeft, 'left'], [rawRight, 'right']]) {
      for (const item of items) {
        if (!counts.has(item.key)) counts.set(item.key, { item: item.display, left: 0, right: 0, difference: 0 });
        const row = counts.get(item.key); row[side]++; row.difference = row.left - row.right;
      }
    }
    let frequency = [...counts.values()];
    if (options.sortOutput) {
      both = sortItems(both); leftOnly = sortItems(leftOnly); rightOnly = sortItems(rightOnly);
      union = sortItems(union); differences = sortItems(differences);
      frequency.sort((a, b) => naturalOrder(a.item, b.item));
    }
    return { both, leftOnly, rightOnly, union, differences, frequency, leftCount: leftItems.length, rightCount: rightItems.length, preview: { left: leftParsed.preview, right: rightParsed.preview } };
  }
  function formatList(title, items) {
    const heading = `${title} (${items.length} ${items.length === 1 ? 'item' : 'items'})`;
    return `${heading}\n${'-'.repeat(heading.length)}\n${items.length ? items.join('\n') : 'No items found.'}\n`;
  }
  function frequencyText(rows) {
    // JSON string notation preserves tabs, quotes, whitespace and empty items on one line.
    return ['Item (JSON string)\tLeft count\tRight count\tDifference (left minus right)', ...rows.map(row => `${JSON.stringify(row.item)}\t${row.left}\t${row.right}\t${row.difference}`)].join('\n') + '\n';
  }
  function report(result, mode, leftName = 'Left List', rightName = 'Right List', generated = new Date().toLocaleString(), format = 'report') {
    leftName = leftName.trim() || 'Left List'; rightName = rightName.trim() || 'Right List';
    if (leftName.length > LIMITS.nameChars || rightName.length > LIMITS.nameChars) throw new Error('List names are limited to 100 characters.');
    const titles = { both: `Items in both "${leftName}" and "${rightName}"`, leftOnly: `Items only in "${leftName}"`, rightOnly: `Items only in "${rightName}"`, union: 'Merged distinct list', differences: 'Items exclusive to either list' };
    let text;
    if (format === 'items') {
      if (!Object.hasOwn(titles, mode)) throw new Error('Items-only export requires a list view.');
      // A terminating newline distinguishes one blank item from no items.
      text = result[mode].length ? result[mode].join('\n') + '\n' : '';
    } else if (format !== 'report') throw new Error('Choose an output format.');
    else if (mode === 'frequency') text = frequencyText(result.frequency);
    else if (mode === 'all') {
      text = ['List Comparison Report', `Generated: ${generated}`, '', `Left list:  ${leftName}`, `Right list: ${rightName}`, '', 'Summary', '-------', `Items in both lists: ${result.both.length}`, `Items only in ${leftName}: ${result.leftOnly.length}`, `Items only in ${rightName}: ${result.rightOnly.length}`, `Merged distinct items: ${result.union.length}`, `Combined differences: ${result.differences.length}`, '', ...Object.keys(titles).map(key => formatList(titles[key], result[key])), 'Frequency comparison (before deduplication)', frequencyText(result.frequency)].join('\n');
    } else {
      if (!Object.hasOwn(titles, mode)) throw new Error('Choose a comparison mode.');
      text = formatList(titles[mode], result[mode]);
    }
    if (text.length > LIMITS.outputChars) throw new Error('The report exceeds the 10,000,000-character output limit.');
    return text;
  }
  const api = Object.freeze({ LIMITS, defaults, cleanupDefaults, compare, report });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ListComparison = api;
})(globalThis);
