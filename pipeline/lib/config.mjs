// lib/config.mjs — load pipeline configuration (YAML) + trust register (JSON)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

const CFG_PATH = resolve(import.meta.dirname, '../config/sources.yaml');
const TRUST_PATH = resolve(import.meta.dirname, '../config/trust.json');

export function loadConfig() {
  return parse(readFileSync(CFG_PATH, 'utf8'));
}

export function loadTrust() {
  return JSON.parse(readFileSync(TRUST_PATH, 'utf8'));
}

// Sources we actually fetch right now: headless (403-protected) ones are deferred.
export function activeSources(cfg) {
  return cfg.sources.filter((s) => s.method !== 'headless');
}

// category -> tier (from config tiers map; failure-safe fallback 'B')
export function tierForCategory(cfg, category) {
  const tiers = cfg.tiers || {};
  for (const [tier, cats] of Object.entries(tiers)) {
    if (Array.isArray(cats) && cats.includes(category)) return tier;
  }
  if (cfg.tiers?.all === category) return 'A';
  return 'B';
}