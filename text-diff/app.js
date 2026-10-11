(() => {
  'use strict';
  const original = document.getElementById('original');
  const updated = document.getElementById('updated');
  const compare = document.getElementById('compare');
  const message = document.getElementById('message');
  const results = document.getElementById('results');
  const output = document.getElementById('diff-output');
  const status = document.getElementById('diff-status');
  const previous = document.getElementById('previous');
  const next = document.getElementById('next');
  let worker = null, timer = null, changes = [], current = -1;
  const emit = (name, data) => {
    try { globalThis.DataTransformEvents?.emit(name, data); }
    catch { /* Analytics must never prevent a comparison. */ }
  };
  function say(text, error = false) {
    message.classList.toggle('error', error);
    message.setAttribute('role', error ? 'alert' : 'status');
    message.setAttribute('aria-live', error ? 'assertive' : 'polite');
    message.textContent = text;
  }
  function stop() {
    if (worker) worker.terminate();
    worker = null;
    clearTimeout(timer);
    compare.disabled = false;
    compare.textContent = 'Compare text';
    output.removeAttribute('aria-busy');
  }
  function reset() {
    stop(); results.hidden = true; output.replaceChildren();
    changes = []; current = -1; previous.disabled = next.disabled = true;
    say('');
  }
  function selectChange(index, scroll = true) {
    if (!changes.length) return;
    changes[current]?.classList.remove('current');
    current = index;
    changes[current].classList.add('current');
    previous.disabled = current === 0;
    next.disabled = current === changes.length - 1;
    status.textContent = `Change ${current + 1} of ${changes.length}`;
    if (scroll) output.scrollTop = changes[current].offsetTop - output.offsetTop - 20;
  }
  function cell(line, side) {
    const element = document.createElement('div');
    element.className = `diff-cell ${line?.kind || 'placeholder'}`;
    const number = document.createElement('span');
    number.className = 'line-number';
    number.setAttribute('aria-hidden', 'true');
    number.textContent = line ? String(line.number) : '';
    element.appendChild(number);
    const marker = document.createElement('span'); marker.className = 'change-marker';
    marker.setAttribute('aria-hidden', 'true');
    marker.textContent = line?.kind === 'deleted' ? '−' : line?.kind === 'inserted' ? '+' : '';
    element.appendChild(marker);
    const content = document.createElement('div'); content.className = 'line-content';
    const label = document.createElement('span'); label.className = 'sr-only';
    label.textContent = line ? `${side} line ${line.number}${line.kind === 'equal' ? '' : `, ${line.kind}`}: ` : `No matching ${side.toLowerCase()} line. `;
    content.appendChild(label);
    if (line) {
      line.parts.forEach(({ op, text }) => {
        const segment = document.createElement(op === -1 ? 'del' : op === 1 ? 'ins' : 'span');
        // Keep actual line breaks in the model, and show a marker in the view.
        segment.textContent = text.replace(/\n$/, '');
        if (text.endsWith('\n')) {
          const newline = document.createElement('span'); newline.className = 'newline';
          newline.textContent = ' ↵'; newline.setAttribute('aria-label', 'Line break');
          segment.appendChild(newline);
        }
        content.appendChild(segment);
      });
    }
    element.appendChild(content);
    return element;
  }
  function render(result) {
    output.replaceChildren(); changes = []; current = -1;
    const fragment = document.createDocumentFragment();
    result.rows.forEach((row) => {
      const element = document.createElement('div'); element.className = 'diff-row';
      element.append(cell(row.left, 'Original'), cell(row.right, 'Updated'));
      if (row.changed) changes.push(element);
      fragment.appendChild(element);
    });
    output.appendChild(fragment);
    results.hidden = false;
    output.scrollTop = 0;
    previous.disabled = next.disabled = true;
    status.textContent = result.identical ? 'The texts are identical.' : `${changes.length} changed ${changes.length === 1 ? 'row' : 'rows'}.`;
    if (changes.length) selectChange(0, false);
    say(result.identical ? 'The texts are identical.' : 'Comparison complete. Removed text is marked with a minus; added text with a plus.');
    emit('comparison_completed', { result: result.identical ? 'identical' : 'different' });
  }
  compare.addEventListener('click', () => {
    reset();
    if (original.value.length > 200000 || updated.value.length > 200000 ||
        (original.value.match(/[^\n]*\n|[^\n]+$/g) || []).length > 5000 ||
        (updated.value.match(/[^\n]*\n|[^\n]+$/g) || []).length > 5000) {
      say('Use up to 200,000 characters and 5,000 lines in each input.', true);
      emit('comparison_failed', { reason: 'input_limit' }); return;
    }
    if (!globalThis.Worker) {
      say('This browser cannot run the comparison. Try a current version of Chrome, Edge, Firefox, or Safari.', true);
      emit('comparison_failed', { reason: 'unavailable' }); return;
    }
    compare.disabled = true; compare.textContent = 'Comparing…';
    say('Comparing text…'); output.setAttribute('aria-busy', 'true');
    try {
      worker = new Worker('./diff-worker.js');
      worker.addEventListener('message', ({ data }) => {
        stop();
        if (data.error) {
          say(data.error === 'input_limit' ? 'Use up to 200,000 characters and 5,000 lines in each input.' : 'The comparison could not finish. Try shorter text.', true);
          emit('comparison_failed', { reason: data.error });
        } else render(data.result);
      });
      worker.addEventListener('error', () => {
        stop(); say('The comparison could not load. Refresh the page and try again.', true);
        emit('comparison_failed', { reason: 'processing' });
      });
      worker.postMessage({ original: original.value, updated: updated.value });
      timer = setTimeout(() => {
        stop(); say('The comparison took too long. Try shorter text.', true);
        emit('comparison_failed', { reason: 'processing' });
      }, 8000);
    } catch {
      stop(); say('The comparison could not start. Refresh the page and try again.', true);
      emit('comparison_failed', { reason: 'unavailable' });
    }
  });
  [original, updated].forEach((input) => input.addEventListener('input', reset));
  document.querySelectorAll('[data-clear]').forEach((button) => button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.clear);
    input.value = ''; reset(); input.focus();
    emit('input_cleared', { side: input.id });
  }));
  document.querySelectorAll('[data-paste]').forEach((button) => {
    button.hidden = !navigator.clipboard?.readText;
    button.addEventListener('click', async () => {
      const input = document.getElementById(button.dataset.paste);
      try {
        const text = await navigator.clipboard.readText();
        input.value += text; reset(); input.focus();
        emit('clipboard_pasted', { side: input.id });
      } catch {
        say('Clipboard access was unavailable. Paste directly into the input using your browser or keyboard.', true);
        emit('clipboard_failed', { side: input.id });
      }
    });
  });
  previous.addEventListener('click', () => { selectChange(current - 1); emit('difference_navigated', { direction: 'previous' }); });
  next.addEventListener('click', () => { selectChange(current + 1); emit('difference_navigated', { direction: 'next' }); });
  emit('tool_opened');
})();
