// tools/facebook_web_post.mjs — publish stories to a Facebook Page by driving the Business
// Suite web composer. No Graph API, no app review, no Page token: it types into the same
// composer a human uses, using a Chromium profile on THIS device.
//
// Shares pipeline/state/facebook-sent.json with facebook_post.mjs on purpose — whichever
// transport runs, a slug already on the Page is never posted again.
//
// MUST run on a real device. Never wire this into GitHub Actions: GitHub runners are
// datacenter IPs (Facebook challenges those hard) and their disk is wiped every job, which
// would throw away the login.
//
//   node tools/facebook_web_post.mjs --setup-display   # manual login (needs termux-x11)
//   node tools/facebook_web_post.mjs --setup           # headless auto-login (env creds)
//   node tools/facebook_web_post.mjs --probe           # dump composer DOM signals
//   node tools/facebook_web_post.mjs --dry-run         # show the exact text, no browser
//   node tools/facebook_web_post.mjs --limit 3         # post up to 3 pending stories
//   node tools/facebook_web_post.mjs --loop            # daemon: keep draining
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, pageTarget, CdpSession, applyStealth, sleepMs, clearProfile } from '../lib/browser-poster.mjs';
import {
  COMPOSER_URL,
  HOME_URL,
  inspectPage,
  attemptLogin,
  detectChallenge,
  postStory,
} from '../lib/facebook-composer.mjs';
import { collectPostCandidates, pendingPosts, formatPostText, humanDelayMs } from '../lib/social-post-text.mjs';

const PIPELINE_DIR = resolve(import.meta.dirname, '..');
const CONTENT_DIR = resolve(PIPELINE_DIR, '../site/src/content/news');
const STATE_DIR = resolve(PIPELINE_DIR, 'state');
const LOG_DIR = resolve(PIPELINE_DIR, 'logs');
const STATE_FILE = resolve(STATE_DIR, 'facebook-sent.json');
const STATUS_FILE = resolve(STATE_DIR, 'facebook-web-status.json');

const PROFILE_DIR = process.env.FACEBOOK_PROFILE_DIR
  ?? resolve(process.env.HOME ?? '/data/data/com.termux/files/home', '.config/newsdesk/facebook-chrome');

const DEFAULT_MAX_PER_SESSION = 25;
const DEFAULT_DELAY_MIN = 1500;
const DEFAULT_DELAY_MAX = 4500;
const CONSECUTIVE_FAILURE_LIMIT = 3;

function log(line) {
  console.log(`facebook_web_post: ${line}`);
}

// `--flag=123` → 123. Deriving the slice from the flag name keeps the offsets honest.
function numFlag(arg, flag) {
  return arg.startsWith(`${flag}=`) ? Number(arg.slice(flag.length + 1)) : null;
}

export function parseArgs(argv) {
  const args = { limit: undefined, since: undefined, loop: false, intervalMs: 20 * 60 * 1000, delayMin: DEFAULT_DELAY_MIN, delayMax: DEFAULT_DELAY_MAX, maxPerSession: DEFAULT_MAX_PER_SESSION };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const valued = (flag) => {
      const n = numFlag(arg, flag);
      return n === null ? undefined : n;
    };
    if (arg === '--setup') args.setup = 'headless';
    else if (arg === '--setup-display') args.setup = 'display';
    else if (arg === '--probe') args.probe = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--loop') args.loop = true;
    else if (arg === '--loop-once') args.loopOnce = true;
    else if (arg === '--all') args.limit = Infinity;
    else if (arg === '--reset-profile') args.resetProfile = true;
    else if (arg === '--since') args.since = argv[++i];
    else if (valued('--since') !== undefined) args.since = valued('--since');
    else if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (valued('--limit') !== undefined) args.limit = valued('--limit');
    else if (arg === '--interval') args.intervalMs = Number(argv[++i]);
    else if (valued('--interval') !== undefined) args.intervalMs = valued('--interval');
    else if (arg === '--delay-min') args.delayMin = Number(argv[++i]);
    else if (valued('--delay-min') !== undefined) args.delayMin = valued('--delay-min');
    else if (arg === '--delay-max') args.delayMax = Number(argv[++i]);
    else if (valued('--delay-max') !== undefined) args.delayMax = valued('--delay-max');
    else if (arg === '--max-per-session') args.maxPerSession = Number(argv[++i]);
    else if (valued('--max-per-session') !== undefined) args.maxPerSession = valued('--max-per-session');
  }
  // A poll that only ever considers ONE story can never keep up with a backlog: the site
  // published 40-71 stories/day at peak. So a looping run drains everything available and
  // --max-per-session is what actually bounds it. One-shot runs default to a single story,
  // matching the Graph API tool's behaviour.
  if (args.limit === undefined) args.limit = (args.loop || args.loopOnce) ? Infinity : 1;
  return args;
}

export function readSentState() {
  if (!existsSync(STATE_FILE)) return new Set();
  try { return new Set(JSON.parse(readFileSync(STATE_FILE, 'utf8')).sent ?? []); } catch { return new Set(); }
}

// Written as the story is published so a crash mid-batch can never re-post what already
// landed. Kept separate from facebook-sent.json (which facebook_post.mjs rewrites wholesale).
export function writeSentState(sent) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify({ sent: [...sent].sort() }, null, 2) + '\n');
}

export function writeStatus(patch) {
  mkdirSync(STATE_DIR, { recursive: true });
  const prev = existsSync(STATUS_FILE)
    ? JSON.parse(readFileSync(STATUS_FILE, 'utf8'))
    : {};
  writeFileSync(STATUS_FILE, JSON.stringify({ ...prev, ...patch, updatedAt: new Date().toISOString() }, null, 2) + '\n');
}

export function pendingQueue(limit, sent = readSentState(), since = undefined) {
  const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'));
  const posts = collectPostCandidates(files, CONTENT_DIR);
  // Nothing has ever been posted to this Page, so the whole archive is "pending". Without a
  // cutoff the first run would dump 400+ historical stories onto the Page. `since` (a date
  // string) means: only publish stories from this date onward, leave the backlog alone.
  const fresh = since ? posts.filter((p) => p.date.slice(0, 10) >= since) : posts;
  return pendingPosts(fresh, sent, limit);
}

async function withBrowser(fn, { headless }) {
  const chrome = await launchChromium({
    userDataDir: PROFILE_DIR,
    headless,
    onLog: (line) => console.error(line),
  });
  try {
    const target = await pageTarget(chrome.port);
    const session = await CdpSession.connect(target.webSocketDebuggerUrl);
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await applyStealth(session, chrome.binary);
    return await fn(session, chrome);
  } finally {
    await chrome.close();
  }
}

async function ensureLoggedIn(session) {
  await session.navigate(HOME_URL, { timeoutMs: 45000 });
  const challenge = await detectChallenge(session);
  if (challenge) return { loggedIn: false, reason: `challenge:${challenge}` };
  const state = await inspectPage(session);
  if (state.state === 'login-wall') return { loggedIn: false, reason: 'login-required' };
  if (state.state === 'checkpoint') return { loggedIn: false, reason: 'checkpoint-challenge' };
  return { loggedIn: true, reason: 'no-login-wall' };
}

async function runSetup(mode) {
  if (mode === 'display' && !process.env.DISPLAY) {
    log('--setup-display needs a display. On Termux: pkg install termux-x11-nightly,');
    log('run `termux-x11` (or `termux-x11 &`), then re-run this command inside that session.');
    log('Alternatively use --setup for headless auto-login with FACEBOOK_LOGIN_EMAIL/PASSWORD.');
    return { setup: false, reason: 'no-display' };
  }

  const email = process.env.FACEBOOK_LOGIN_EMAIL;
  const password = process.env.FACEBOOK_LOGIN_PASSWORD;

  if (mode === 'headless' && !(email && password)) {
    log('--setup needs FACEBOOK_LOGIN_EMAIL and FACEBOOK_LOGIN_PASSWORD, or use --setup-display.');
    return { setup: false, reason: 'no-credentials' };
  }

  return withBrowser(async (session, chrome) => {
    log(`profile: ${PROFILE_DIR}`);
    const before = await ensureLoggedIn(session);
    if (before.loggedIn) {
      log(`already logged in (${chrome.identity.userAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? '?'})`);
      return { setup: true, reason: 'already-logged-in' };
    }
    if (mode === 'display') {
      log('a browser window is open — log in by hand, then close the window.');
      log('(stay logged in; do NOT log out, or the profile loses the session)');
      const deadline = Date.now() + 10 * 60 * 1000;
      while (Date.now() < deadline && chrome.isRunning()) {
        await sleepMs(3000);
      }
      return { setup: true, reason: 'display-window-closed' };
    }

    const result = await attemptLogin(session, { email, password });
    if (!result.ok) {
      await session.screenshot(resolve(LOG_DIR, 'fb-login-blocked.png')).catch(() => null);
      log(`login did not complete: ${result.reason}`);
      log(`screenshot: ${LOG_DIR}/fb-login-blocked.png`);
      log('a captcha/checkpoint cannot be solved automatically — re-run with --setup-display');
      return { setup: false, reason: result.reason };
    }
    log('login submitted; verifying by opening the composer...');
    await session.navigate(COMPOSER_URL, { timeoutMs: 45000 });
    const state = await inspectPage(session);
    log(`composer state: ${state.state} (${state.reason})`);
    if (state.state === 'composer') {
      log('setup OK — the profile can reach the composer.');
      return { setup: true, reason: 'composer-reachable' };
    }
    await session.screenshot(resolve(LOG_DIR, 'fb-setup-composer.png')).catch(() => null);
    return { setup: false, reason: state.reason };
  }, { headless: mode === 'headless' });
}

async function runProbe() {
  return withBrowser(async (session) => {
    const auth = await ensureLoggedIn(session);
    log(`auth: ${auth.loggedIn ? 'ok' : auth.reason}`);
    await session.navigate(COMPOSER_URL, { timeoutMs: 45000 });
    const info = await inspectPage(session);
    mkdirSync(LOG_DIR, { recursive: true });
    const out = resolve(LOG_DIR, 'fb-composer-probe.json');
    writeFileSync(out, JSON.stringify({ auth, ...info }, null, 2) + '\n');
    await session.screenshot(resolve(LOG_DIR, 'fb-composer-probe.png')).catch(() => null);
    log(`state: ${info.state} (${info.reason})`);
    log(`textboxes found: ${info.signals?.textboxes?.length ?? 0}`);
    log(`report: ${out}`);
    log(`screenshot: ${LOG_DIR}/fb-composer-probe.png`);
    return info;
  }, { headless: true });
}

async function runDryRun(limit, since) {
  const queue = pendingQueue(limit, readSentState(), since);
  if (!queue.length) {
    log('nothing pending');
    return { posted: 0 };
  }
  log(`${queue.length} pending; exact text that would be posted:\n`);
  for (const post of queue) {
    log(`--- ${post.slug}`);
    log(formatPostText(post));
  }
  return { posted: 0, pending: queue.length };
}

// The batch loop. Stops the moment something needs a human, because a wrong click on a
// Facebook account is far more expensive than a story that waits.
export async function runBatch({ limit, since, delayMin, delayMax, maxPerSession }) {
  const sent = readSentState();
  let queue = pendingQueue(limit, sent, since);
  if (!queue.length) {
    log('nothing new to post');
    return { posted: 0, reason: 'nothing-new' };
  }
  if (queue.length > maxPerSession) {
    log(`backlog of ${queue.length} — capping this session at ${maxPerSession}`);
    queue = queue.slice(0, maxPerSession);
  }

  const batchStartedAt = new Date().toISOString();
  const results = { posted: [], failed: [] };

  await withBrowser(async (session) => {
    const auth = await ensureLoggedIn(session);
    if (!auth.loggedIn) {
      // Not an exception: a daemon that logs out is a normal state to sit in, not a crash.
      log(`not logged in (${auth.reason}) — run: node tools/facebook_web_post.mjs --setup`);
      writeStatus({ lastRun: batchStartedAt, notLoggedIn: auth.reason });
      return { ...results, halted: true, reason: auth.reason };
    }

    let consecutiveFailures = 0;
    for (const post of queue) {
      const verdict = await postStory(session, {
        text: formatPostText(post),
        slug: post.slug,
        logDir: LOG_DIR,
      });

      if (verdict.ok) {
        sent.add(post.slug);
        writeSentState(sent);
        results.posted.push(post.slug);
        consecutiveFailures = 0;
        log(`posted ${post.slug}`);
        writeStatus({ lastRun: batchStartedAt, lastPosted: post.slug, lastPostedAt: new Date().toISOString() });
      } else {
        results.failed.push({ slug: post.slug, reason: verdict.reason });
        consecutiveFailures++;
        log(`FAILED ${post.slug}: ${verdict.reason}`);
        if (verdict.needsHuman) {
          log('halting the batch — this needs a human decision.');
          writeStatus({ lastRun: batchStartedAt, halt: { slug: post.slug, reason: verdict.reason } });
          return { ...results, halted: true, reason: verdict.reason };
        }
        if (consecutiveFailures >= CONSECUTIVE_FAILURE_LIMIT) {
          log(`halting after ${CONSECUTIVE_FAILURE_LIMIT} consecutive failures — not hammering a broken UI.`);
          writeStatus({ lastRun: batchStartedAt, halt: { reason: 'consecutive-failures' } });
          return { ...results, halted: true, reason: 'consecutive-failures' };
        }
      }
      await sleepMs(humanDelayMs(delayMin, delayMax));
    }
  }, { headless: true });

  writeStatus({ lastRun: batchStartedAt, lastPostedCount: results.posted.length, lastFailed: results.failed });
  log(`done: ${results.posted.length} posted, ${results.failed.length} failed`);
  return { posted: results.posted.length, failed: results.failed };
}

async function runLoop(args) {
  log(`daemon started (profile ${PROFILE_DIR}, every ${Math.round(args.intervalMs / 60000)} min)`);
  while (true) {
    try {
      await runBatch(args);
    } catch (error) {
      log(`batch error: ${error.message}`);
      writeStatus({ lastError: error.message });
    }
    await sleepMs(args.intervalMs);
  }
}

export const USAGE = `Usage: node tools/facebook_web_post.mjs [mode] [options]

Modes
  --setup-display        Manual login in a real browser window (needs termux-x11 + DISPLAY)
  --setup                Headless auto-login (FACEBOOK_LOGIN_EMAIL + FACEBOOK_LOGIN_PASSWORD)
  --probe                Open the composer and dump its DOM signals (JSON + screenshot)
  --dry-run              Print the exact text that would be posted; opens no browser
  --limit N              Post up to N pending stories in one session (default 1)
  --all                  Post every pending story (still capped by --max-per-session)
  --loop                 Internal polling loop (prefer tools/facebook_web_daemon.sh instead)
  --loop-once            Drain the backlog once and exit (used by the daemon script)
  --reset-profile        Delete the Chromium login profile (forces a fresh login)
  --since=DATE           Only publish stories dated DATE or later (env FACEBOOK_SINCE).
                         Use this on first run: nothing has been posted to the Page yet, so
                         without it the whole archive would be published in one go

Options
  --interval=MS          --loop poll interval (default 1200000 = 20 min)
  --delay-min=MS         Minimum gap between posts (default 1500)
  --delay-max=MS         Maximum gap between posts (default 4500)
  --max-per-session=N    Stop after N posts even in --loop (default 25)

Environment
  FACEBOOK_PROFILE_DIR      Chromium profile that holds the login
                            (default ~/.config/newsdesk/facebook-chrome)
  CHROMIUM_PATH              Override the browser binary
  FACEBOOK_LOGIN_EMAIL       For --setup
  FACEBOOK_LOGIN_PASSWORD    For --setup
`;

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    return { help: true };
  }
  if (args.resetProfile) {
    clearProfile(PROFILE_DIR);
    log(`profile cleared: ${PROFILE_DIR}`);
    if (!args.setup && !argv.includes('--setup-display')) return { reset: true };
  }
  if (args.setup) return runSetup(args.setup);
  if (args.probe) return runProbe();
  args.since ??= process.env.FACEBOOK_SINCE;
  if (args.dryRun) return runDryRun(args.limit, args.since);
  if (args.loop) return runLoop(args);
  return runBatch(args);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().then((result) => {
    if (result?.setup === false || result?.halted) process.exit(3);
    process.exit(0);
  }).catch((error) => {
    console.error('facebook_web_post: unexpected error', error);
    process.exit(1);
  });
}