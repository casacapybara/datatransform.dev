(() => {
  'use strict';
  const MAX_CHARACTERS = 200000;
  const MAX_LINES = 5000;
  const splitLines = (text) => text.match(/[^\n]*\n|[^\n]+$/g) || [];
  function compare(original, updated) {
    if (typeof original !== 'string' || typeof updated !== 'string') throw new Error('input_type');
    if (original.length > MAX_CHARACTERS || updated.length > MAX_CHARACTERS ||
        splitLines(original).length > MAX_LINES || splitLines(updated).length > MAX_LINES) throw new Error('input_limit');
    const dmp = new diff_match_patch();
    dmp.Diff_Timeout = 1;
    const encoded = dmp.diff_linesToChars_(original, updated);
    const changes = dmp.diff_main(encoded.chars1, encoded.chars2, false);
    dmp.diff_charsToLines_(changes, encoded.lineArray);
    const rows = [];
    let leftNumber = 1, rightNumber = 1;
    let removed = [], added = [];
    const deadline = Date.now() + 1200;
    const line = (text, kind, side) => ({ text, kind, number: side === 'left' ? leftNumber++ : rightNumber++, parts: [{ op: 0, text }] });
    function flush() {
      for (let i = 0; i < Math.max(removed.length, added.length); i++) {
        const left = i < removed.length ? line(removed[i], 'deleted', 'left') : null;
        const right = i < added.length ? line(added[i], 'inserted', 'right') : null;
        if (left && right && Date.now() < deadline) {
          const parts = dmp.diff_main(left.text, right.text, false, deadline);
          dmp.diff_cleanupSemantic(parts);
          left.parts = parts.filter(part => part[0] !== 1).map(part => ({ op: part[0], text: part[1] }));
          right.parts = parts.filter(part => part[0] !== -1).map(part => ({ op: part[0], text: part[1] }));
        } else {
          if (left) left.parts = [{ op: -1, text: left.text }];
          if (right) right.parts = [{ op: 1, text: right.text }];
        }
        rows.push({ left, right, changed: true });
      }
      removed = []; added = [];
    }
    // Upstream Diff instances are array-like objects, not iterable arrays.
    for (const change of changes) {
      const op = change[0], text = change[1];
      if (op === -1) removed.push(...splitLines(text));
      else if (op === 1) added.push(...splitLines(text));
      else {
        flush();
        for (const sourceLine of splitLines(text)) rows.push({ left: line(sourceLine, 'equal', 'left'), right: line(sourceLine, 'equal', 'right'), changed: false });
      }
    }
    flush();
    return { rows, identical: original === updated };
  }
  globalThis.TextDiffModel = Object.freeze({ compare, MAX_CHARACTERS, MAX_LINES });
})();
