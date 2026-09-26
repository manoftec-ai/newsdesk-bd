// tools/finalize_stories.mjs — finalize only the exact stories selected in pick.json.
// usage: node tools/finalize_stories.mjs [--pick=/path/to/pick.json] [--site=/path/to/site] [--max=N]
// body files: pipeline/tmp/stories/<slug>.b.md (body only, no front matter)
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { openDb } from '../lib/db.mjs';
import { BRIEFS_DIR } from '../lib/extract.mjs';
import { runPublicationGate } from '../lib/publication-gate.mjs';
import { frontMatter, prepBody, storyExists } from '../lib/synth.mjs';
import { loadPublishedTitles, isTitleDuplicate, normTitle } from '../lib/published.mjs';
import { validatePublicArticle } from './site_preflight.mjs';
import {
  bodySubstanceCheck,
  minPublishWords,
  evidenceSufficiency,
  DEFAULT_MIN_EVIDENCE_WORDS,
  richSourceRule,
  richSourceThresholds,
} from '../lib/editorial.mjs';
import { clusterCoherence, coherenceMin, COHERENCE_FAILURE_CODE } from '../lib/cluster-coherence.mjs';

const DEFAULT_PICK_PATH = resolve(import.meta.dirname, '../state/pick.json');
const DEFAULT_SITE_DIR = resolve(import.meta.dirname, '../../site/src/content/news');
const DEFAULT_DB_PATH = resolve(import.meta.dirname, '../state/store.db');
const DEFAULT_BODIES_DIR = resolve(import.meta.dirname, '../tmp/stories');
const DEFAULT_REJECTIONS_PATH = resolve(import.meta.dirname, '../tmp/finalize-rejections.json');
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function option(name, fallback = null) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function readPick(pickPath) {
  const parsed = JSON.parse(readFileSync(pickPath, 'utf8'));
  const picked = Array.isArray(parsed.picked) ? parsed.picked : [];
  const slugs = [];
  const invalid = [];
  for (const item of picked) {
    const slug = typeof item === 'string' ? item : item?.slug;
    if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
      invalid.push(slug ?? item);
      continue;
    }
    if (!slugs.includes(slug)) slugs.push(slug);
  }
  return { picked, slugs, invalid };
}

function atomicWrite(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporary = join(dirname(filePath), `.${filePath.split('/').pop()}.${process.pid}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
    renameSync(temporary, filePath);
  } catch (error) {
    try { unlinkSync(temporary); } catch {}
    throw error;
  }
}

function renderStory(slug, brief, body, publication) {
  const { excerpt, keyPoints, remaining } = prepBody(body);
  const quote = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const capTitle = (value) => {
    const title = String(value ?? '').trim();
    if (title.length <= 72) return title;
    const cut = title.slice(0, 71);
    const lastSpace = cut.lastIndexOf(' ');
    return `${(lastSpace > 10 ? cut.slice(0, lastSpace) : cut).trim()}…`;
  };

  let frontmatter = frontMatter(brief, { publication });
  frontmatter = frontmatter.replace('excerpt: "…"', `excerpt: "${quote(excerpt)}"`);
  frontmatter = frontmatter.replace(
    'seoTitle: "…"',
    `seoTitle: "${quote(capTitle(brief.headline))}"`,
  );
  frontmatter = frontmatter.replace(
    'seoDescription: "…"',
    `seoDescription: "${quote(excerpt.length > 155 ? `${excerpt.slice(0, 154)}…` : excerpt)}"`,
  );
  if (keyPoints.length) {
    frontmatter = frontmatter.replace(
      'keyPoints: []',
      `keyPoints:\n${keyPoints.map((point) => `  - "${quote(point)}"`).join('\n')}`,
    );
  }

  const content = remaining.replace(/\[\[SLUG\]\]/g, slug);
  return `---\n${frontmatter.trimEnd()}\n---\n\n${content.trim()}\n`;
}

function rejection(slug, reason, detail = {}) {
  return { slug, reason, ...detail, at: new Date().toISOString() };
}

function listBodySlugs(bodiesDir) {
  if (!existsSync(bodiesDir)) return [];
  return readdirSync(bodiesDir)
    .filter((file) => file.endsWith('.b.md'))
    .map((file) => file.slice(0, -5));
}

export function finalizeStories({
  pickPath = DEFAULT_PICK_PATH,
  siteDir = DEFAULT_SITE_DIR,
  dbPath = DEFAULT_DB_PATH,
  briefsDir = BRIEFS_DIR,
  bodiesDir = DEFAULT_BODIES_DIR,
  rejectionsPath = DEFAULT_REJECTIONS_PATH,
  max = Infinity,
  minWords = minPublishWords(),
  // `env` is declared below, so a default here cannot read it (TDZ). Use
  // process.env directly for the default and let an explicit `env` still win
  // inside the function body.
  minEvidenceWords = Number(process.env.MIN_EVIDENCE_WORDS) || DEFAULT_MIN_EVIDENCE_WORDS,
  now = new Date().toISOString(),
  env = process.env,
} = {}) {
  const evidenceFloor = Number(env.MIN_EVIDENCE_WORDS) || minEvidenceWords;
  const richThresholds = richSourceThresholds(env);
  const startedAt = now;
  const result = {
    startedAt,
    finishedAt: null,
    pickPath,
    siteDir,
    written: [],
    rejected: [],
    skipped: [],
  };

  if (!Number.isFinite(max) && max !== Infinity) {
    throw new Error(`invalid --max=${max}`);
  }

  const selection = readPick(pickPath);
  for (const slug of selection.invalid) {
    result.rejected.push(rejection(String(slug), 'INVALID_PICK_SLUG'));
  }
  // Any body outside the exact allowlist is never read, rendered, or staged.
  const allowed = new Set(selection.slugs);
  for (const slug of listBodySlugs(bodiesDir)) {
    if (!allowed.has(slug)) {
      const item = rejection(slug, 'UNPICKED_BODY_IGNORED');
      if (!result.rejected.some((entry) => entry.slug === slug && entry.reason === item.reason)) {
        result.rejected.push(item);
      }
    }
  }

  const selected = selection.slugs.slice(0, max);
  const publishedTitles = loadPublishedTitles(siteDir);
  let db;
  try {
    db = openDb(dbPath);
    for (const slug of selected) {
      try {
        if (storyExists(slug, { siteDir })) {
          result.skipped.push({ slug, reason: 'ALREADY_PUBLISHED' });
          continue;
        }
        const briefPath = join(briefsDir, `${slug}.json`);
        if (!existsSync(briefPath)) {
          result.rejected.push(rejection(slug, 'BRIEF_MISSING'));
          continue;
        }
        const brief = JSON.parse(readFileSync(briefPath, 'utf8'));
        // Evidence-sufficiency gate: refuse to publish a story whose sources cannot
        // support it. Added 2026-09-26 after measuring why the body median sat at
        // 192 words against a 269-word market median — briefs hand the writer a
        // median of 49 words of material and it already expands that 4x, so the
        // shortfall is evidence, not effort. Configurable via MIN_EVIDENCE_WORDS.
        const sufficiency = evidenceSufficiency(brief, { min: evidenceFloor });
        if (!sufficiency.pass) {
          result.rejected.push(rejection(slug, 'EVIDENCE_TOO_THIN', {
            evidenceWords: sufficiency.evidenceWords,
            minEvidenceWords: sufficiency.minWords,
            members: sufficiency.members,
          }));
          continue;
        }
        // Cluster-coherence guard: reject a brief whose members are not all about
        // the same event, BEFORE any body is considered. The 150-word body floor
        // cannot catch this - a mashed-together cluster still produces plenty of
        // words, they are just the wrong words. Configurable via COHERENCE_MIN.
        const coherence = clusterCoherence(brief, { min: coherenceMin(env) });
        if (!coherence.pass) {
          result.rejected.push(rejection(slug, COHERENCE_FAILURE_CODE, {
            minMaxSimilarity: Number(coherence.minMax.toFixed(3)),
            meanMaxSimilarity: Number(coherence.meanMax.toFixed(3)),
            minRequired: coherence.minRequired,
            members: coherence.n,
            intruders: coherence.intruders,
          }));
          continue;
        }
        if (isTitleDuplicate(brief.headline, brief.date, publishedTitles)) {
          result.skipped.push({ slug, reason: 'DUPLICATE_TITLE' });
          continue;
        }
        const bodyPath = join(bodiesDir, `${slug}.b.md`);
        if (!existsSync(bodyPath)) {
          result.rejected.push(rejection(slug, 'BODY_MISSING'));
          continue;
        }
        const body = readFileSync(bodyPath, 'utf8').trim();
        if (!body) {
          result.rejected.push(rejection(slug, 'BODY_EMPTY'));
          continue;
        }
        const publication = runPublicationGate(brief, body, db, now);
        if (!publication.pass) {
          result.rejected.push(rejection(slug, 'PUBLICATION_GATE_BLOCKED', {
            failureCodes: publication.failureCodes,
            // 2026-09-26: without this the rejection says which gate fired but not
            // which rule inside it, so a blocked article cannot be diagnosed from CI.
            auditFails: publication.auditFails ?? [],
            claimIds: publication.claimIds,
            evidenceHash: publication.evidenceHash,
          }));
          continue;
        }
        // Body-substance floor: evidence checks alone cannot tell a real article
        // from a headline restatement. Blocks NO_READER_VALUE (rv1) and
        // BODY_TOO_THIN. Configurable via PUBLISH_MIN_WORDS.
        // Rich-source rule: when 2+ sources each carry a full article's worth of
        // text, the story must be published as a full article. The user set this
        // explicitly: two sources at 250+ words each means the article is not
        // less than 250 words. Without it a well-sourced story could still ship
        // at the 150-word floor, which throws away evidence already paid for.
        const rich = richSourceRule(brief, richThresholds);
        const floor = Math.max(minWords, rich.requiredWords);
        const substance = bodySubstanceCheck(brief.headline ?? '', body, { minWords: floor });
        if (!substance.pass) {
          result.rejected.push(rejection(slug, 'BODY_SUBSTANCE_BLOCKED', {
            code: substance.code,
            bodyWords: substance.bodyWords,
            minWords: floor,
            novelTokens: substance.novel.length,
            ...(rich.requiredWords > minWords
              ? {
                  richSourceRule: {
                    requiredWords: rich.requiredWords,
                    sourcesAtOrAbove: rich.richSources,
                    perSourceWords: rich.perSourceWords,
                    memberWords: rich.memberWords,
                  },
                }
              : {}),
          }));
          continue;
        }
        const outPath = join(siteDir, `${slug}.md`);
        if (existsSync(outPath)) {
          result.skipped.push({ slug, reason: 'ALREADY_PUBLISHED' });
          continue;
        }
        const content = renderStory(slug, brief, body, { ...publication, slug });
        const preflight = validatePublicArticle(content, { slug, now });
        if (!preflight.pass) {
          result.rejected.push(rejection(slug, 'SITE_PREFLIGHT_BLOCKED', {
            failureCodes: preflight.failureCodes,
            errors: preflight.errors,
          }));
          continue;
        }
        atomicWrite(outPath, content);
        result.written.push({ slug, path: outPath, evidenceHash: publication.evidenceHash });
        publishedTitles.set(normTitle(brief.headline), brief.date);
      } catch (error) {
        result.rejected.push(rejection(slug, 'FINALIZATION_ERROR', { error: error.message }));
      }
    }
  } finally {
    db?.close();
  }

  result.finishedAt = new Date().toISOString();
  atomicWrite(rejectionsPath, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

function main() {
  const maxArg = Number(option('max', ''));
  const max = Number.isFinite(maxArg) && maxArg > 0 ? maxArg : Infinity;
  try {
    const result = finalizeStories({
      pickPath: resolve(option('pick', DEFAULT_PICK_PATH)),
      siteDir: resolve(option('site', DEFAULT_SITE_DIR)),
      dbPath: resolve(option('db', DEFAULT_DB_PATH)),
      briefsDir: resolve(option('briefs', BRIEFS_DIR)),
      bodiesDir: resolve(option('bodies', DEFAULT_BODIES_DIR)),
      rejectionsPath: resolve(option('rejections', DEFAULT_REJECTIONS_PATH)),
      max,
    });
    for (const item of result.written) console.log(`+ ${item.slug}: wrote ${item.path}`);
    for (const item of result.skipped) console.log(`- ${item.slug}: ${item.reason}`);
    for (const item of result.rejected) {
      const codes = item.failureCodes?.length ? ` [${item.failureCodes.join(', ')}]` : '';
      console.error(`! ${item.slug}: ${item.reason}${codes}`);
    }
    console.log(`finalize done. wrote=${result.written.length} skipped=${result.skipped.length} rejected=${result.rejected.length}`);
  } catch (error) {
    console.error(`finalize failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
