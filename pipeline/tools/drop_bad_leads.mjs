// Drop page text we could not re-extract cleanly.
//
// 2026-07-27. tools/resolve_sources.mjs --retext rebuilds a member's lead with
// the paragraph-scored extractor. When a page does not put its body in <p> (many
// of these sites use divs), the run cannot find an article run and leaves the
// old lead in place - which is the contaminated text. Keeping it would defeat
// the whole exercise, so a member whose lead is still furniture after retext
// loses the lead entirely and is left to fail the evidence floor honestly.
//
// Only page-extracted leads are touched: they are over 1200 characters, while an
// RSS lead is a headline or two. Measured, plain RSS leads were 0% contaminated
// (0 of 249), so anything short is left alone.
import fs from 'node:fs';
import { proseProblem } from '../lib/prose.mjs';

const BRIEFS = 'state/briefs';
let cleared = 0;
let kept = 0;
let checked = 0;

for (const f of fs.readdirSync(BRIEFS).filter((x) => x.endsWith('.json'))) {
  const p = `${BRIEFS}/${f}`;
  const brief = JSON.parse(fs.readFileSync(p, 'utf8'));
  let dirty = false;
  for (const m of brief.members ?? []) {
    const lead = String(m.lead ?? '');
    if (lead.length <= 1200) continue;
    checked++;
    if (proseProblem(lead) !== null) {
      m.lead = '';
      cleared++;
      dirty = true;
    } else kept++;
  }
  if (dirty) fs.writeFileSync(p, `${JSON.stringify(brief, null, 2)}\n`, 'utf8');
}

console.log(`  page-extracted leads checked : ${checked}`);
console.log(`  still furniture -> cleared   : ${cleared}`);
console.log(`  clean, kept                   : ${kept}`);
