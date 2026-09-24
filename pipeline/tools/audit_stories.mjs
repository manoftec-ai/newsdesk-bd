// tools/audit_stories.mjs — run the two-stage auditor over drafted bodies.
// usage: node tools/audit_stories.mjs [--slug=SLUG] [--dry]
// With --slug it audits ONE body file pipeline/tmp/stories/<slug>.b.md.
// Without, audits ALL .b.md bodies and reports pass/block counts (no write).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadBrief } from '../lib/synth.mjs';
import { mechanicalAudit, auditArticle, AUDIT_POINTS } from '../lib/audit.mjs';

const slugArg = process.argv.find((a) => a.startsWith('--slug='))?.split('=')[1];
const dry = process.argv.includes('--dry');
const bodiesDir = resolve(import.meta.dirname, '../tmp/stories');

async function auditOne(slug) {
  const f = join(bodiesDir, `${slug}.b.md`);
  if (!existsSync(f)) { console.log(`! no body file for ${slug}`); return; }
  const body = readFileSync(f, 'utf8');
  const brief = loadBrief(slug);
  const mech = mechanicalAudit(brief, body);
  console.log(`# ${slug}  mechanical: ${mech.pass ? 'PASS' : `FAIL (${mech.fails.length})`}`);
  for (const v of mech.fails) console.log(`   - ${v.id}: ${v.note}`);
  const { pass, llm } = await auditArticle(brief, body);
  console.log(`  llm audit: ${pass ? 'PASS' : llm ? 'FAIL' : 'skipped (no LLM key)'}`);
  if (llm && llm.scores) {
    for (const [id, s] of Object.entries(llm.scores)) {
      const p = AUDIT_POINTS.find((x) => x.id === id);
      console.log(`   ${id} ${p?.en ?? ''}: ${s.ok ? 'OK' : 'FAIL'} — ${s.note}`);
    }
  }
}

if (slugArg) {
  await auditOne(slugArg);
} else {
  if (!existsSync(bodiesDir)) { console.log('no tmp/stories bodies'); process.exit(0); }
  const slugs = readdirSync(bodiesDir).filter((f) => f.endsWith('.b.md')).map((f) => f.replace(/\.b\.md$/, ''));
  let pass = 0, fail = 0;
  for (const s of slugs) {
    const body = readFileSync(join(bodiesDir, `${s}.b.md`), 'utf8');
    const mech = mechanicalAudit(loadBrief(s), body);
    if (mech.pass) pass++; else { fail++; console.log(`- ${s}: mechanical FAIL [${mech.fails.map((v) => v.id).join(',')}]`); }
  }
  console.log(`\naudit done. mechanical pass=${pass} fail=${fail}${dry ? ' (dry)' : ''}`);
}
process.exit(0);