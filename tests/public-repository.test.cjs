const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

test('tracked public files exclude private documents and design material', () => {
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const publicMarkdown = new Set([
    'README.md',
    'text-diff/vendor/README.md',
    'data-file-converter/vendor/README.md',
    'tests/fixtures/README.md',
  ]);
  for (const file of files) {
    assert.doesNotMatch(file, /^(?:\.interface-design|\.agents|\.codex|\.aws|docs|private|previews)\//, file);
    assert.doesNotMatch(file, /^assets\/hero-examples\/|^assets\/hero\/data-factory-scene\.png$|^LAUNCH_PLAN\.md$/i, file);
    assert.doesNotMatch(file, /(?:^|\/)(?:prompts?|generation)\.(?:json|md|txt)$/i, file);
    if (/\.md$/i.test(file)) assert.ok(publicMarkdown.has(file), `Review Markdown before publishing: ${file}`);
  }
});
