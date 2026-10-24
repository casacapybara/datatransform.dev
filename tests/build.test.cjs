const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readdirSync, readFileSync, existsSync } = require('node:fs');
const { join, resolve, dirname } = require('node:path');
test('deployment contains only public assets and all local page dependencies exist', () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { env: { ...process.env, SITE_PREVIEW: '1' } });
  function files(path) { return readdirSync(path, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(join(path, item.name)) : [join(path, item.name)]); }
  const built = files('dist');
  assert.equal(built.length, 91);
  assert.ok(!built.some(file => /private|planning|LAUNCH_PLAN|tests|README|package|logo\.png/.test(file)));
  const home = readFileSync('dist/index.html', 'utf8');
  assert.match(home, /data-search-terms="[^"]*vlookup/);
  assert.match(home, /class="tool-categories"/);
  assert.ok(!existsSync('dist/config/home-tools.json'));
  for (const slug of ['json-explorer', 'text-diff', 'data-cleaner']) {
    const tool = readFileSync(`dist/${slug}/index.html`, 'utf8');
    assert.doesNotMatch(tool, /home-search|tool-search-controls|tool-categories|data-search-terms/);
  }
  const root = resolve('dist');
  for (const file of built.filter(file => file.endsWith('.html'))) {
    const html = readFileSync(file, 'utf8');
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const url = match[1];
      if (/^(https?:|#)/.test(url)) continue;
      const target = url.startsWith('/') ? resolve(root, '.' + url) : resolve(dirname(file), url);
      assert.ok(target.startsWith(root));
      assert.ok(existsSync(target), `${file}: missing ${url}`);
    }
  }
  assert.ok(!built.some(file => /bitwiseflagdecoder4|csv-extractor-v2|csv_to_json_converter|list-compare-v1/.test(file)));
  assert.match(readFileSync('dist/sitemap.xml', 'utf8'), /https:\/\/datatransform\.dev\/csv-search-filter-transform\//);
  assert.match(readFileSync('dist/sitemap.xml', 'utf8'), /https:\/\/datatransform\.dev\/list-comparison\//);
  assert.match(readFileSync('dist/sitemap.xml', 'utf8'), /https:\/\/datatransform\.dev\/csv-merge-join\//);
  assert.match(readFileSync('dist/sitemap.xml', 'utf8'), /https:\/\/datatransform\.dev\/compare-tables\//);
  assert.match(readFileSync('dist/sitemap.xml', 'utf8'), /https:\/\/datatransform\.dev\/data-file-converter\//);
  assert.match(readFileSync('dist/sitemap.xml', 'utf8'), /https:\/\/datatransform\.dev\/data-quality-checker\//);
  assert.match(readFileSync('dist/sitemap.xml', 'utf8'), /https:\/\/datatransform\.dev\/prepare-import\//);
  for (const slug of ['json-explorer','json-workbench']) assert.ok(readFileSync('dist/sitemap.xml','utf8').includes(`https://datatransform.dev/${slug}/`));
  assert.match(readFileSync('dist/sitemap.xml', 'utf8'), /https:\/\/datatransform\.dev\/csv-to-json\//);
  const headers = readFileSync('dist/_headers', 'utf8');
  assert.match(headers, /connect-src https:\/\/datatransform\.dev\/cdn-cgi\/rum;/);
  assert.match(headers, /script-src 'self' https:\/\/static\.cloudflareinsights\.com;/);
  assert.match(headers, /worker-src 'self'/);
  assert.match(headers, /img-src 'self' blob:/);
  assert.match(readFileSync('dist/sitemap.xml', 'utf8'), /https:\/\/datatransform\.dev\/base64-decoder-encoder\//);
  assert.match(headers, /X-Robots-Tag: noindex/);
  assert.match(readFileSync('dist/robots.txt', 'utf8'), /Disallow: \//);
  // Publishing the domain must explicitly opt in to indexing.
  execFileSync(process.execPath, ['scripts/build.mjs'], { env: { ...process.env, SITE_PREVIEW: '0' } });
  assert.doesNotMatch(readFileSync('dist/_headers', 'utf8'), /X-Robots-Tag: noindex/);
  assert.match(readFileSync('dist/robots.txt', 'utf8'), /Allow: \//);
  execFileSync(process.execPath, ['scripts/build.mjs']);
});
