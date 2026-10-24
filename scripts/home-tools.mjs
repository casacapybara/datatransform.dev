const escapeHtml = (value) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

// Enrich static cards at build time; keep their titles and descriptions in HTML.
export function renderHomeTools(html, config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Home tool config must be an object.');
  const seen = new Set();
  const rendered = html.replace(/<a class="panel tool-card" href="(?:\.\/)?([a-z0-9-]+)\/">([\s\S]*?)<\/a>/g, (card, slug, content) => {
    const metadata = Object.hasOwn(config, slug) && config[slug];
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error(`Missing home tool metadata: ${slug}`);
    if (seen.has(slug)) throw new Error(`Duplicate home tool card: ${slug}`);
    seen.add(slug);
    for (const field of ['categories', 'searchTerms']) {
      if (!Array.isArray(metadata[field]) || metadata[field].some(value => typeof value !== 'string' || !value.trim())) {
        throw new Error(`${slug}.${field} must be an array of non-empty strings.`);
      }
    }
    for (const field of Object.keys(metadata)) {
      if (!['categories', 'searchTerms'].includes(field)) throw new Error(`Unknown home tool field: ${slug}.${field}`);
    }
    const pills = metadata.categories.length ? `<ul class="tool-categories" aria-label="Categories">${metadata.categories.map(category => `<li>${escapeHtml(category.trim())}</li>`).join('')}</ul>` : '';
    const opening = card.slice(0, card.indexOf('>'));
    const body = content.replace('<span class="open-tool">', () => `${pills}<span class="open-tool">`);
    return `${opening} data-search-terms="${escapeHtml(metadata.searchTerms.join(' '))}">${body}</a>`;
  });
  for (const slug of Object.keys(config)) {
    if (!seen.has(slug)) throw new Error(`Home tool metadata has no matching card: ${slug}`);
  }
  if (!seen.size) throw new Error('No home tool cards found.');
  return rendered;
}
