const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readdirSync, readFileSync, existsSync } = require('node:fs');
const { join, resolve, dirname } = require('node:path');
test('deployment contains only public assets and all local page dependencies exist', () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { env: { ...process.env, SITE_PREVIEW: '1' } });
  function files(path) { return readdirSync(path, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(join(path, item.name)) : [join(path, item.name)]); }
  const built = files('dist');
  assert.equal(built.length, 23);
  assert.ok(!built.some(file => /private|planning|LAUNCH_PLAN|tests|README|package|logo\.png/.test(file)));
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
  const headers = readFileSync('dist/_headers', 'utf8');
  assert.match(headers, /connect-src 'none'/);
  assert.match(headers, /worker-src 'self'/);
  assert.match(headers, /X-Robots-Tag: noindex/);
  assert.match(readFileSync('dist/robots.txt', 'utf8'), /Disallow: \//);
  // Publishing the domain must explicitly opt in to indexing.
  execFileSync(process.execPath, ['scripts/build.mjs'], { env: { ...process.env, SITE_PREVIEW: '0' } });
  assert.doesNotMatch(readFileSync('dist/_headers', 'utf8'), /X-Robots-Tag: noindex/);
  assert.match(readFileSync('dist/robots.txt', 'utf8'), /Allow: \//);
  execFileSync(process.execPath, ['scripts/build.mjs']);
});
