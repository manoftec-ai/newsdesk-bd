// tools/site_preflight.mjs — fail-closed validation for generated public Markdown.
// usage: node tools/site_preflight.mjs [--news=/path/to/site/src/content/news] [--pick=state/pick.json]
//        node tools/site_preflight.mjs --slug=story-slug --news=/path/to/news
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import YAML from 'yaml';
import { PUBLICATION_GATE_VERSION } from '../lib/publication-gate.mjs';

export const PREFLIGHT_FAILURE_CODES = Object.freeze([
  'FILE_READ_FAILED',
  'FRONTMATTER_MISSING',
  'FRONTMATTER_INVALID',
  'TITLE_MISSING',
  'DATE_INVALID',
  'CATEGORY_MISSING',
  'AUTHOR_MISSING',
  'BODY_MISSING',
  'NOT_PUBLIC',
  'PUBLICATION_GATE_NOT_PASSED',
  'PUBLICATION_GATE_VERSION_INVALID',
  'PUBLICATION_TIMESTAMP_INVALID',
  'CLUSTER_ID_INVALID',
  'CLAIM_MANIFEST_INVALID',
  'EVIDENCE_HASH_INVALID',
  'VERIFICATION_STATUS_INVALID',
  'VERIFICATION_METADATA_MISMATCH',
  'SOURCES_MISSING',
  'SOURCE_URL_INVALID',
  'GOOGLE_NEWS_WRAPPER_UNRESOLVED',
  'SLUG_MISMATCH',
]);

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;
const HASH_RE = /^[a-f0-9]{16}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}T/;

function validDate(value) {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function validUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.hostname.endsWith('news.google.com');
  } catch {
    return false;
  }
}

function isGoogleNewsUrl(value) {
  try {
    return new URL(value).hostname === 'news.google.com' || new URL(value).hostname.endsWith('.news.google.com');
  } catch {
    return false;
  }
}

function add(errors, code, message) {
  errors.push({ code, message });
}

function claimIds(value) {
  return Array.isArray(value) && value.length > 0 && value.every((id) => Number.isInteger(id) && id > 0);
}

function parseFrontmatter(content) {
  const text = String(content ?? '');
  const match = text.match(FRONTMATTER_RE);
  if (!match) return { data: null, body: text, error: 'FRONTMATTER_MISSING' };
  try {
    const data = YAML.parse(match[1]);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { data: null, body: text.slice(match[0].length), error: 'FRONTMATTER_INVALID' };
    }
    return { data, body: text.slice(match[0].length), error: null };
  } catch (error) {
    return { data: null, body: text.slice(match[0].length), error: 'FRONTMATTER_INVALID', detail: error.message };
  }
}

export function validatePublicArticle(content, { slug, now = new Date(), gateVersion = PUBLICATION_GATE_VERSION } = {}) {
  const errors = [];
  const parsed = parseFrontmatter(content);
  if (parsed.error) {
    add(errors, parsed.error, parsed.detail ?? 'frontmatter could not be parsed');
    return { pass: false, failureCodes: errors.map((error) => error.code), errors, data: null };
  }
  const { data, body } = parsed;

  if (typeof data.title !== 'string' || !data.title.trim()) add(errors, 'TITLE_MISSING', 'title is required');
  if (!validDate(data.date)) add(errors, 'DATE_INVALID', 'date must be a valid ISO date');
  if (typeof data.category !== 'string' || !data.category.trim()) add(errors, 'CATEGORY_MISSING', 'category is required');
  if (typeof data.author !== 'string' || !data.author.trim()) add(errors, 'AUTHOR_MISSING', 'author is required');
  if (!body.trim()) add(errors, 'BODY_MISSING', 'article body is empty');

  if (data.draft !== false) add(errors, 'NOT_PUBLIC', 'draft must be exactly false for a public article');

  const publication = data.publication;
  if (!publication || typeof publication !== 'object' || publication.gate !== 'passed') {
    add(errors, 'PUBLICATION_GATE_NOT_PASSED', 'publication.gate must be passed');
  } else {
    if (publication.gateVersion !== gateVersion) {
      add(errors, 'PUBLICATION_GATE_VERSION_INVALID', `publication.gateVersion must be ${gateVersion}`);
    }
    if (!validDate(publication.checkedAt)) {
      add(errors, 'PUBLICATION_TIMESTAMP_INVALID', 'publication.checkedAt must be a valid ISO date');
    }
    if (!Number.isInteger(publication.clusterId) || publication.clusterId < 1) {
      add(errors, 'CLUSTER_ID_INVALID', 'publication.clusterId must be a positive integer');
    }
    if (!claimIds(publication.claimIds)) {
      add(errors, 'CLAIM_MANIFEST_INVALID', 'publication.claimIds must contain positive integer ids');
    }
    if (typeof publication.evidenceHash !== 'string' || !HASH_RE.test(publication.evidenceHash)) {
      add(errors, 'EVIDENCE_HASH_INVALID', 'publication.evidenceHash must be a 16-character lowercase hex digest');
    }
  }

  const verification = data.verification;
  if (!verification || typeof verification !== 'object' || verification.status !== 'passed') {
    add(errors, 'VERIFICATION_STATUS_INVALID', 'verification.status must be passed');
  } else {
    if (!validDate(verification.evaluatedAt)) {
      add(errors, 'VERIFICATION_METADATA_MISMATCH', 'verification.evaluatedAt must be a valid ISO date');
    }
    if (!claimIds(verification.claimIds)) {
      add(errors, 'VERIFICATION_METADATA_MISMATCH', 'verification.claimIds must contain positive integer ids');
    }
    if (verification.evidenceHash !== publication?.evidenceHash) {
      add(errors, 'VERIFICATION_METADATA_MISMATCH', 'verification.evidenceHash must match publication.evidenceHash');
    }
    if (verification.clusterId !== publication?.clusterId) {
      add(errors, 'VERIFICATION_METADATA_MISMATCH', 'verification.clusterId must match publication.clusterId');
    }
  }

  if (!Array.isArray(data.sources) || data.sources.length === 0) {
    add(errors, 'SOURCES_MISSING', 'at least one direct source is required');
  } else {
    const seen = new Set();
    for (const source of data.sources) {
      if (typeof source?.name !== 'string' || !source.name.trim() || typeof source.url !== 'string' || !source.url.trim()) {
        add(errors, 'SOURCE_URL_INVALID', 'each source needs a name and URL');
        continue;
      }
      if (isGoogleNewsUrl(source.url)) {
        add(errors, 'GOOGLE_NEWS_WRAPPER_UNRESOLVED', `unresolved Google News URL: ${source.url}`);
      } else if (!validUrl(source.url)) {
        add(errors, 'SOURCE_URL_INVALID', `invalid source URL: ${source.url}`);
      }
      if (seen.has(source.url)) add(errors, 'SOURCE_URL_INVALID', `duplicate source URL: ${source.url}`);
      seen.add(source.url);
    }
  }

  if (publication?.slug !== slug) {
    add(errors, 'SLUG_MISMATCH', `publication.slug must equal route slug ${slug}`);
  }

  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (Number.isFinite(nowMs) && validDate(publication?.checkedAt)) {
    const checkedMs = new Date(publication.checkedAt).getTime();
    if (checkedMs > nowMs + 5 * 60_000) {
      add(errors, 'PUBLICATION_TIMESTAMP_INVALID', 'publication.checkedAt cannot be in the future');
    }
  }

  return {
    pass: errors.length === 0,
    failureCodes: [...new Set(errors.map((error) => error.code))],
    errors,
    data,
  };
}

function markdownFiles(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(full);
    }
  };
  visit(dir);
  return files.sort();
}

function option(name, fallback = null) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function selectedSlugs(pickPath) {
  const parsed = JSON.parse(readFileSync(pickPath, 'utf8'));
  if (!Array.isArray(parsed.picked)) throw new Error('pick file has no picked array');
  return parsed.picked.map((item) => (typeof item === 'string' ? item : item?.slug)).filter((slug) => typeof slug === 'string');
}

export function preflightNews({ newsDir, slugs = null, now = new Date(), gateVersion = PUBLICATION_GATE_VERSION } = {}) {
  const root = resolve(newsDir);
  const files = markdownFiles(root);
  const bySlug = new Map(files.map((file) => [relative(root, file).replaceAll(sep, '/').replace(/\.md$/, ''), file]));
  const targets = slugs === null ? [...bySlug.keys()] : [...new Set(slugs)];
  const results = [];

  for (const slug of targets) {
    const file = bySlug.get(slug);
    if (!file) {
      results.push({ slug, pass: false, failureCodes: ['FILE_READ_FAILED'], errors: [{ code: 'FILE_READ_FAILED', message: `article not found: ${slug}` }] });
      continue;
    }
    try {
      const result = validatePublicArticle(readFileSync(file, 'utf8'), { slug, now, gateVersion });
      results.push({ slug, path: file, ...result });
    } catch (error) {
      results.push({ slug, path: file, pass: false, failureCodes: ['FILE_READ_FAILED'], errors: [{ code: 'FILE_READ_FAILED', message: error.message }] });
    }
  }
  return { pass: results.every((result) => result.pass), results };
}

function writtenSlugs(resultPath) {
  const parsed = JSON.parse(readFileSync(resultPath, 'utf8'));
  if (!Array.isArray(parsed.written)) throw new Error('finalizer result has no written array');
  return parsed.written.map((item) => item?.slug).filter((slug) => typeof slug === 'string');
}

function main() {
  try {
    const newsDir = resolve(option('news', resolve(import.meta.dirname, '../../site/src/content/news')));
    const pickArg = option('pick');
    const writtenArg = option('written');
    const explicit = option('slug');
    const slugs = explicit
      ? [explicit]
      : writtenArg
        ? writtenSlugs(resolve(writtenArg))
        : pickArg
          ? selectedSlugs(resolve(pickArg))
          : null;
    const result = preflightNews({ newsDir, slugs });
    for (const item of result.results) {
      if (item.pass) {
        console.log(`[preflight] PASS ${item.slug}`);
      } else {
        console.error(`[preflight] FAIL ${item.slug}: ${item.failureCodes.join(', ')}`);
        for (const error of item.errors) console.error(`  - ${error.message}`);
      }
    }
    if (!result.pass) process.exitCode = 1;
  } catch (error) {
    console.error(`[preflight] failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
