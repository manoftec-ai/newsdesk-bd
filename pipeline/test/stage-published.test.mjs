// test/stage-published.test.mjs — changed-path allowlist contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assertPublishScope } from '../tools/stage_published.mjs';

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'jachai-scope-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  const news = join(root, 'site/src/content/news');
  mkdirSync(news, { recursive: true });
  const resultPath = join(root, 'result.json');
  writeFileSync(resultPath, JSON.stringify({ written: [{ slug: 'metro-test' }] }));
  writeFileSync(join(news, 'metro-test.md'), 'approved');
  return { root, news, resultPath };
}

test('publish scope accepts only finalizer-approved public files', () => {
  const fixture = makeRepo();
  try {
    const scope = assertPublishScope({
      root: fixture.root,
      resultPath: fixture.resultPath,
      siteNewsDir: fixture.news,
    });
    assert.deepEqual(scope.allowed, ['site/src/content/news/metro-test.md']);
    execFileSync('git', ['add', '--', ...scope.allowed], { cwd: fixture.root });
    assert.doesNotThrow(() => assertPublishScope({
      root: fixture.root,
      resultPath: fixture.resultPath,
      siteNewsDir: fixture.news,
      requireStaged: true,
    }));
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('publish scope rejects an unapproved public file', () => {
  const fixture = makeRepo();
  try {
    writeFileSync(join(fixture.news, 'other.md'), 'not approved');
    assert.throws(() => assertPublishScope({
      root: fixture.root,
      resultPath: fixture.resultPath,
      siteNewsDir: fixture.news,
    }), /unapproved public Markdown changes/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
