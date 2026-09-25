#!/usr/bin/env node
// tools/decision_router.mjs — CLI for LOCAL_DECISION_ROUTER (local, offline, deterministic).
//
//   node tools/decision_router.mjs --list
//   node tools/decision_router.mjs --rules
//   node tools/decision_router.mjs FAILURE_ROUTING --state='{"attempts":3,"sameError":true}'
//   node tools/decision_router.mjs AGENT_ROUTE --state-file=/path/to.json --json
//
// Exit code is ALWAYS 0 unless the arguments are unusable. The router is
// advisory, so it must never fail a script, a test or a pipeline run.
//
// Env:
//   LDR_MODE=disabled|off   evaluate nothing and return SKIP
//   LDR_LOG_DIR             where the JSONL decision log is written
//                           (default pipeline/logs/, already gitignored)
import { readFileSync } from 'node:fs';
import { buildRequest, decide, ENGINE, ACTIONS, DECISION_TYPES } from '../lib/decision-router.mjs';
import { listRules, THRESHOLDS, PRIORITY } from '../lib/decision-rules.mjs';

const argv = process.argv.slice(2);
const arg = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const flag = (name) => argv.includes(`--${name}`);

if (flag('list') || argv.length === 0) {
  console.log(`${ENGINE} — local deterministic decision router`);
  console.log('No API key, no network, no external AI, no probabilistic output.\n');
  for (const t of Object.keys(DECISION_TYPES)) console.log(`  ${t}`);
  console.log('\nactions:');
  for (const a of Object.keys(ACTIONS)) console.log(`  ${a}`);
  console.log('\nusage:');
  console.log('  node tools/decision_router.mjs <DECISION_TYPE> --state=\'{"attempts":3,"sameError":true}\'');
  console.log('  node tools/decision_router.mjs --rules      # every rule with id, priority and action');
  process.exit(0);
}

if (flag('rules')) {
  console.log('PRIORITY ORDER (1 = highest; a lower-priority rule can never override a higher one)\n');
  const names = Object.fromEntries(Object.entries(PRIORITY).map(([k, v]) => [v, k]));
  for (const r of listRules()) {
    console.log(`[P${r.priority} ${names[r.priority] ?? ''}] ${r.id.padEnd(12)} -> ${r.action}`);
    console.log(`    ${r.description}`);
    console.log(`    applies to: ${r.appliesTo}`);
  }
  console.log('\nTHRESHOLDS');
  for (const [k, v] of Object.entries(THRESHOLDS)) console.log(`  ${k.padEnd(32)} ${v}`);
  process.exit(0);
}

const decisionType = argv.find((a) => !a.startsWith('--'));
if (!decisionType) {
  console.error('usage: decision_router.mjs <DECISION_TYPE> --state=... | --state-file=...  (or --list / --rules)');
  process.exit(1);
}

let rawState = arg('state') ?? '{}';
if (arg('state-file')) {
  try {
    rawState = readFileSync(arg('state-file'), 'utf8');
  } catch (e) {
    console.error(`cannot read state file: ${e.message}`);
    process.exit(1);
  }
}
let state;
try {
  state = JSON.parse(rawState);
} catch {
  console.error('--state must be valid JSON, e.g. --state=\'{"attempts":3,"sameError":true}\'');
  process.exit(1);
}

const request = buildRequest({ decisionType, task: arg('task') ?? '', state });
const r = decide(request, { env: { ...process.env, LDR_LOG_DIR: process.env.LDR_LOG_DIR } });

if (flag('json')) {
  console.log(JSON.stringify(r, null, 2));
} else {
  console.log(`engine         : ${r.engine} v${r.engineVersion}  (local + deterministic, NOT an external model)`);
  console.log(`decisionType   : ${r.decisionType}`);
  if (r.task) console.log(`task           : ${r.task}`);
  console.log(`action         : ${r.action}`);
  console.log(`ruleId         : ${r.ruleId}   (priority ${r.rulePriority})`);
  console.log(`reason         : ${r.reason}`);
  console.log(`ruleConfidence : ${r.ruleConfidence}  [${r.confidenceKind}] — NOT a probability`);
  console.log(`humanApproval  : ${r.requiresHumanApproval}`);
  console.log(`shadowMode     : ${r.shadowMode}  -> workflow ${r.wouldChangeWorkflow ? 'CHANGED' : 'unchanged'}`);
  console.log(`state          : ${JSON.stringify(r.state)}`);
  console.log(`evaluated      : ${r.evaluated.map((e) => `${e.id}${e.matched ? '*' : ''}`).join(' ')}  (* = matched)`);
  console.log(`log            : ${r.logFile ?? 'not written'}`);
}
process.exit(0);
