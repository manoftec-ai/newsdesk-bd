// tools/cluster_eval.mjs — Golden Test Dataset runner (cluster quality gate).
// Runs the live Bengali TF-IDF clustering over config/golden.json and reports
// pairwise precision/recall/F1 + per-event status. Use --sweep to find the
// best similarity threshold, or --min-f1 to act as a CI gate (exit 1 below it).
//
// usage: node tools/cluster_eval.mjs [--similarity=0.30] [--prune=0.35]
//                                     [--sweep] [--min-f1=0] [--report-only]
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { evaluateClusters } from '../lib/cluster-eval.mjs';

const GOLDEN_FILE = resolve(import.meta.dirname, '../config/golden.json');

function fmt(v) { return Number(v).toFixed(3); }

function main() {
  const golden = JSON.parse(readFileSync(GOLDEN_FILE, 'utf8'));
  const items = Object.entries(golden.items).map(([id, it]) => ({
    id,
    title: it.title,
    body: it.body ?? '',
    published_at: it.publishedAt,
  }));
  const simArg = Number(process.argv.find((a) => a.startsWith('--similarity='))?.split('=')[1]);
  const pruneArg = Number(process.argv.find((a) => a.startsWith('--prune='))?.split('=')[1]);
  const minF1 = Number(process.argv.find((a) => a.startsWith('--min-f1='))?.split('=')[1]) || 0;
  const sweep = process.argv.includes('--sweep');

  if (sweep) {
    console.log('threshold sweep (best F1 on golden set):');
    let best = { th: 0, f1: -1 };
    for (let th = 0.25; th <= 0.75 + 1e-9; th += 0.05) {
      const { scores } = evaluateClusters(items, { similarity: th, prune: pruneArg || 0.35, golden });
      const mark = scores.f1 > best.f1 + 1e-9 ? '*' : ' ';
      if (scores.f1 > best.f1 + 1e-9) best = { th, f1: scores.f1 };
      console.log(`  ${mark} sim=${fmt(th)}  P=${fmt(scores.precision)} R=${fmt(scores.recall)} F1=${fmt(scores.f1)}`);
    }
    console.log(`best: similarity=${fmt(best.th)} F1=${fmt(best.f1)}`);
    return;
  }

  const sim = Number.isFinite(simArg) ? simArg : 0.30;
  const prune = Number.isFinite(pruneArg) ? pruneArg : 0.35;
  // hybrid strong-token agreement (P0-9): --strong=<sim> overrides the tuned
  // production default (0.30); --strong=0 disables hybrid entirely (pure cosine)
  const strongArg = process.argv.find((a) => a.startsWith('--strong='))?.split('=')[1];
  const strong = strongArg === undefined ? 0.30 : Number(strongArg);
  const hasStrong = strong > 0;
  const { scores, events } = evaluateClusters(items, { similarity: sim, prune, golden, strong: hasStrong ? strong : null });

  console.log(`golden evaluation (similarity=${fmt(sim)}, prune=${fmt(prune)}${hasStrong ? `, strong=${fmt(strong)}` : ', pure cosine'}):`);
  console.log(`  pairwise precision=${fmt(scores.precision)}  recall=${fmt(scores.recall)}  F1=${fmt(scores.f1)}`);
  console.log('  per-event:');
  for (const e of events) console.log(`    ${e.event.padEnd(28)} size=${e.size}  ${e.status}`);

  if (minF1 > 0 && scores.f1 < minF1) {
    console.error(`\nGOLDEN GATE FAIL: F1 ${fmt(scores.f1)} < min ${fmt(minF1)}`);
    process.exit(1);
  }
}

main();