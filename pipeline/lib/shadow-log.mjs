// lib/shadow-log.mjs — append-only JSONL shadow log for Jev decisions.
//
// HARD RULES (do not weaken):
//   1. Never write a secret. Everything passes through redact() first.
//   2. Never write to a tracked path. Default dir is pipeline/logs/ which .gitignore
//      already excludes (patterns: pipeline/logs/, *.log).
//   3. Never throw. Logging is best-effort and must not break a caller.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const DEFAULT_LOG_DIR = resolve(import.meta.dirname, '../logs');

// Anything that looks like a credential is replaced before it can reach disk.
const SECRET_PATTERNS = [
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{12,}\b/g, '[redacted:key-like]'],
  [/\bgh[pousr]_[A-Za-z0-9]{16,}\b/g, '[redacted:github-token]'],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*/gi, 'Bearer [redacted]'],
  // Any *_KEY / *_TOKEN / *_SECRET / *_PASSWORD assignment, in JSON or env style.
  [/\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)[A-Za-z0-9_]*)("?\s*[:=]\s*"?)([^"'\s,}]+)/gi, '$1$2[redacted]'],
  [/\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[redacted:jwt]'],
];

const MAX_STRING = 4000;

export function redact(value, depth = 0) {
  if (value == null) return null;
  if (depth > 6) return '[redacted:max-depth]';
  if (typeof value === 'string') {
    let out = value;
    for (const [re, rep] of SECRET_PATTERNS) out = out.replace(re, rep);
    if (out.length > MAX_STRING) out = `${out.slice(0, MAX_STRING)}…[truncated ${out.length - MAX_STRING} chars]`;
    return out;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      // A key name that is itself a secret-ish identifier never gets its value through.
      out[k] = /(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)$/i.test(k) ? '[redacted:field-name]' : redact(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

export function logDir(env = process.env) {
  return resolve(env.JEV_SHADOW_LOG_DIR || DEFAULT_LOG_DIR);
}

export function logFileFor(date = new Date(), env = process.env) {
  const day = date.toISOString().slice(0, 10);
  return resolve(logDir(env), `jev-shadow-${day}.jsonl`);
}

/**
 * Append one structured, redacted record. Returns the file path, or null if
 * logging failed (never throws).
 */
export function appendShadowLog(record, { env = process.env, now = new Date() } = {}) {
  try {
    const file = logFileFor(now, env);
    mkdirSync(dirname(file), { recursive: true });
    const safe = redact({ ts: now.toISOString(), ...record });
    appendFileSync(file, `${JSON.stringify(safe)}\n`, { encoding: 'utf8', mode: 0o600 });
    return file;
  } catch {
    return null;
  }
}

/** Read back a day's records. Used by tests and shadow-log reviews. */
export function readShadowLog(date = new Date(), { env = process.env } = {}) {
  const file = logFileFor(date, env);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
