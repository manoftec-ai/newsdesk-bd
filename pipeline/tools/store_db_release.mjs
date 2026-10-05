// tools/store_db_release.mjs — park store.db on a GitHub release asset
// instead of committing it to git. store.db passed GitHub's 100MB
// repo-file limit on 2026-10-04, after which every pipeline state push
// was rejected (GH001 pre-receive hook) and updates silently stopped.
//
// Usage in CI (where GITHUB_TOKEN + GITHUB_REPOSITORY are set):
//   node pipeline/tools/store_db_release.mjs download   # before work
//   node pipeline/tools/store_db_release.mjs upload     # after work
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY;
if (!TOKEN || !REPO) { console.error('need GITHUB_TOKEN + GITHUB_REPOSITORY'); process.exit(1); }

const DB = resolve(import.meta.dirname, '../state/store.db');
const TMP = resolve(import.meta.dirname, '../tmp/store.db.gz');

async function api(url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'newsdesk-store-sync',
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(`${opts.method || 'GET'} ${url} -> ${r.status} ${t}`); }
  return r;
}

async function getRelease() {
  try {
    const r = await api(`https://api.github.com/repos/${REPO}/releases/tags/state`);
    return await r.json();
  } catch {
    const r = await api(`https://api.github.com/repos/${REPO}/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_name: 'state', name: 'pipeline state', body: 'store.db parking spot (managed by tools/store_db_release.mjs)' }),
    });
    return await r.json();
  }
}

const cmd = process.argv[2];
if (cmd === 'download') {
  const rel = await getRelease();
  const asset = (rel.assets || []).find((a) => a.name === 'store.db.gz');
  if (!asset) { console.log('no state asset yet; continuing with an empty/local store.db'); process.exit(0); }
  const r = await api(asset.url, { headers: { Accept: 'application/octet-stream' } });
  writeFileSync(TMP, Buffer.from(await r.arrayBuffer()));
  execFileSync('gunzip', ['-f', TMP]);
  execFileSync('mv', [TMP.replace(/\.gz$/, ''), DB]);
  console.log(`store.db restored (${(statSync(DB).size / 1048576).toFixed(1)} MiB) from state release`);
} else if (cmd === 'upload') {
  if (!existsSync(DB)) { console.log('no store.db to upload'); process.exit(0); }
  execFileSync('gzip', ['-kf', DB]);
  execFileSync('mv', [DB + '.gz', TMP]);
  const rel = await getRelease();
  const old = (rel.assets || []).find((a) => a.name === 'store.db.gz');
  if (old) await api(`https://api.github.com/repos/${REPO}/releases/assets/${old.id}`, { method: 'DELETE' });
  const base = rel.upload_url.replace(/\{[^}]*\}/, '');
  await api(`${base}?name=store.db.gz`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/gzip' },
    body: readFileSync(TMP),
  });
  execFileSync('rm', ['-f', TMP]);
  console.log(`store.db.gz uploaded (${(statSync(DB).size / 1048576).toFixed(1)} MiB source) to state release`);
} else {
  console.error('usage: store_db_release.mjs <download|upload>'); process.exit(1);
}
