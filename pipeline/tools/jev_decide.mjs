#!/usr/bin/env node
// tools/jev_decide.mjs — CLI for the Jachaidesk Jev decision router (SHADOW MODE).
//
//   node tools/jev_decide.mjs --list
//   node tools/jev_decide.mjs AGENT_ROUTE --task=t-123 --state='{"task":"..."}' [--json]
//   node tools/jev_decide.mjs AGENT_ROUTE --state-file=/path/to.json --bypass
//
// Exit code is ALWAYS 0 unless the arguments are unusable. A Jev failure is
// never a build/test failure — this is an advisory shadow signal.
//
// Env:
//   TYPESAFE_API_KEY         or  TYPESAFE_API_KEY_FILE   (required for a real call)
//   JEV_MODE                 shadow (default) | disabled
//   JEV_SHADOW_LOG_DIR       default pipeline/logs/  (already gitignored)
import { readFileSync } from 'node:fs';
import { jevDecide, listDecisions, loadCatalog, isConfigured } from '../lib/jev-router.mjs';

const argv = process.argv.slice(2);
const arg = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const flag = (name) => argv.includes(`--${name}`);

if (flag('list') || argv.length === 0) {
  const cat = loadCatalog();
  console.log(`Jev decision catalog v${cat.version}  mode=${cat.mode}  configured=${isConfigured()}`);
  for (const d of listDecisions(cat)) {
    console.log(`\n${d.name}`);
    console.log(`  purpose : ${d.purpose}`);
    console.log(`  selects : ${d.selected}`);
    console.log(`  options : ${d.options.join(' | ')}`);
    console.log(`  also    : ${d.questionIds.filter((q) => q !== d.selected).join(', ') || '(none)'}`);
  }
  console.log('\nfuture-only (defined, NOT wired):');
  for (const c of cat.futureOnly.candidates) console.log(`  - ${c}`);
  process.exit(0);
}

const decisionType = argv.find((a) => !a.startsWith('--'));
if (!decisionType) {
  console.error('usage: jev_decide.mjs <DECISION_TYPE> --state=... | --state-file=...  (or --list)');
  process.exit(1);
}

let state = arg('state') ?? '';
if (arg('state-file')) {
  try {
    state = readFileSync(arg('state-file'), 'utf8');
  } catch (e) {
    console.error(`cannot read state file: ${e.message}`);
    process.exit(1);
  }
}
// --state='{"a":1}' is valid JSON; otherwise treat it as plain text.
if (typeof state === 'string' && state.trim().startsWith('{')) {
  try {
    state = JSON.parse(state);
  } catch {
    /* keep the raw string */
  }
}

const result = await jevDecide(decisionType, {
  taskId: arg('task') ?? `cli-${Date.now()}`,
  state,
  bypass: flag('bypass'),
});

if (flag('json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  if (result.simulated) {
    console.log('!! SIMULATED -- NOT THE JEV/TYPESAFE MODEL -- NO API CALL WAS MADE !!');
    console.log('!! Deterministic local keyword heuristic. No confidence, no scores, no cost. !!');
    console.log('!! This proves the plumbing only. It is NOT a real Jev decision.            !!');
    console.log('');
  }
  console.log(`decision : ${result.decisionType}`);
  console.log(`task     : ${result.taskId}`);
  console.log(`mode     : ${result.mode}   (shadow = advisory only)`);
  console.log(`key      : ${result.key}`);
  console.log(`state    : ${JSON.stringify(result.state)}`);
  if (result.ok) {
    console.log(`route    : ${result.route}${result.confidence !== null ? `  (confidence ${result.confidence})` : '  (confidence: n/a — none available offline)'}`);
    console.log(`flags    : ${JSON.stringify(result.flags)}`);
    console.log(`escalate : ${result.escalate}`);
    if (result.nextStep) console.log(`nextStep : ${result.nextStep}`);
    if (result.simulation) {
      console.log(`sim      : ${result.simulation.method}`);
      console.log(`matched  : ${JSON.stringify(result.simulation.matchedKeywords)}${result.simulation.fallbackToFirstOption ? '  (NO KEYWORD MATCHED — fell back to first declared option, not a guess)' : ''}`);
    }
    console.log(`model    : ${result.jevResult.model ?? 'n/a (not a real call)'}  network=${result.jevResult.network}  usage=${JSON.stringify(result.jevResult.usage)}`);
    console.log(`authority: ${result.authority}`);
  } else {
    console.log(`result   : NOT AVAILABLE (${result.reason || result.skipped})`);
  }
  console.log(`workflow : ${result.affectedWorkflow ? 'CHANGED' : 'unchanged'} (shadow mode never changes it)`);
  if (result.agent) {
    console.log('');
    console.log('--- agent contract (machine-readable, no LLM prose) ---');
    console.log(`  decision    : ${result.agent.decision}`);
    console.log(`  confidence  : ${result.agent.confidence}`);
    console.log(`  escalate    : ${result.agent.escalate}`);
    console.log(`  nextStep    : ${result.agent.nextStep}`);
    console.log(`  authority   : ${result.agent.authority}`);
    console.log(`  source      : ${result.agent.source}`);
  }
  console.log(`log      : ${result.logFile ?? 'not written'}`);
}
process.exit(0);
