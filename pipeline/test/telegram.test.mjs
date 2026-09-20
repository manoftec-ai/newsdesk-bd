// test/telegram.test.mjs — unit tests for telegram_post helpers
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFrontmatter, latestUnsent } from '../tools/telegram_post.mjs';

test('latestUnsent returns the newest story only', () => {
  const posts = [
    { slug: 'a1', date: '2026-09-19' },
    { slug: 'b2', date: '2026-09-20' },
    { slug: 'c3', date: '2026-09-21' },
  ];
  assert.equal(latestUnsent(posts).slug, 'c3');
  assert.equal(latestUnsent([]), null);
});

test('readFrontmatter parses yaml front matter', () => {
  const dir = mkdtempSync(join(tmpdir(), 'telegram-test-'));
  try {
    const file = join(dir, 's1.md');
    writeFileSync(file, '---\ntitle: "টেস্ট সংবাদ"\ndraft: false\ntags: [dhaka]\n---\nবডি\n');
    const parsed = readFrontmatter(file);
    assert.equal(parsed.fm.title, 'টেস্ট সংবাদ');
    assert.equal(parsed.fm.draft, false);
    assert.deepEqual(parsed.fm.tags, ['dhaka']);
    assert.equal(readFrontmatter(join(dir, 'missing.md')), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});