// tools/stage_published.mjs — validate and stage only finalizer-approved story files.
// usage: node tools/stage_published.mjs --result=pipeline/tmp/finalize-rejections.json [--stage]
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\n').map((line) => line.trim()).filter(Boolean);
}

function normalizePath(root, path) {
  return relative(root, resolve(root, path)).split(sep).join('/');
}

export function approvedStoryPaths(result, { root, siteNewsDir }) {
  const newsRoot = normalizePath(root, siteNewsDir);
  const paths = (result.written ?? []).map((item) => {
    const slug = String(item.slug ?? '');
    if (!SLUG_RE.test(slug)) throw new Error(`invalid written slug: ${slug}`);
    return `${newsRoot}/${slug}.md`;
  });
  return [...new Set(paths)].sort();
}

export function assertPublishScope({ root = process.cwd(), resultPath, siteNewsDir, requireStaged = false } = {}) {
  const absoluteRoot = resolve(root);
  const result = JSON.parse(readFileSync(resolve(absoluteRoot, resultPath), 'utf8'));
  const allowed = new Set(approvedStoryPaths(result, { root: absoluteRoot, siteNewsDir }));
  const newsRoot = normalizePath(absoluteRoot, siteNewsDir);
  const changedInNews = new Set([
    ...git(absoluteRoot, ['diff', '--name-only', '--', newsRoot]),
    ...git(absoluteRoot, ['diff', '--cached', '--name-only', '--', newsRoot]),
    ...git(absoluteRoot, ['ls-files', '--others', '--exclude-standard', '--', newsRoot]),
  ]);
  const unexpectedNewsChanges = [...changedInNews].filter((path) => !allowed.has(path));
  if (unexpectedNewsChanges.length) {
    throw new Error(`unapproved public Markdown changes: ${unexpectedNewsChanges.join(', ')}`);
  }

  const staged = git(absoluteRoot, ['diff', '--cached', '--name-only', '--']);
  const unexpectedStaged = staged.filter((path) => !allowed.has(path));
  if (unexpectedStaged.length) {
    throw new Error(`unexpected staged paths: ${unexpectedStaged.join(', ')}`);
  }
  if (requireStaged && staged.length !== allowed.size) {
    throw new Error(`staged path count ${staged.length} does not match approved count ${allowed.size}`);
  }
  for (const path of allowed) {
    if (!existsSync(resolve(absoluteRoot, path))) throw new Error(`approved story is missing: ${path}`);
  }
  return { allowed: [...allowed], staged, changedInNews: [...changedInNews] };
}

function option(name, fallback = null) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function main() {
  try {
    const root = resolve(option('root', process.cwd()));
    const resultPath = option('result', 'pipeline/tmp/finalize-rejections.json');
    const siteNewsDir = option('site', 'site/src/content/news');
    const scope = assertPublishScope({ root, resultPath, siteNewsDir, requireStaged: process.argv.includes('--require-staged') });
    if (process.argv.includes('--stage')) {
      if (scope.allowed.length) {
        execFileSync('git', ['add', '--', ...scope.allowed], { cwd: root, stdio: 'inherit' });
      }
      assertPublishScope({ root, resultPath, siteNewsDir, requireStaged: true });
    }
    for (const path of scope.allowed) console.log(path);
  } catch (error) {
    console.error(`[publish-scope] ${error.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
