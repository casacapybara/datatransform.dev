(() => {
  const search = document.getElementById('tool-search');
  const clear = document.getElementById('clear-tool-search');
  const count = document.getElementById('tool-search-count');
  const empty = document.getElementById('tool-search-empty');
  const normalise = value => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  const cards = Array.from(document.querySelectorAll('.tool-grid .tool-card'), card => ({
    card,
    text: normalise([
      card.querySelector('h3').textContent,
      card.querySelector('p').textContent,
      ...Array.from(card.querySelectorAll('.tool-categories li'), category => category.textContent),
      card.dataset.searchTerms || ''
    ].join(' '))
  }));

  function filter() {
    const terms = normalise(search.value).trim().split(/\s+/u).filter(Boolean);
    let visible = 0;
    for (const { card, text } of cards) {
      card.hidden = !terms.every(term => text.includes(term));
      if (!card.hidden) visible++;
    }
    count.textContent = terms.length ? `${visible} of ${cards.length} tools` : `${cards.length} tools`;
    empty.hidden = visible !== 0;
    clear.disabled = search.value.length === 0;
  }

  search.addEventListener('input', filter);
  // Some browsers emit a separate event for their native search clear button.
  search.addEventListener('search', filter);
  clear.addEventListener('click', () => {
    search.value = '';
    filter();
    search.focus();
  });
  search.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      clear.click();
    }
  });
  window.addEventListener('pageshow', filter);
  filter();
  document.getElementById('tool-search-controls').hidden = false;
})();
