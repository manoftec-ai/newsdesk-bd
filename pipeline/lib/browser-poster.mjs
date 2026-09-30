// lib/browser-poster.mjs — launch a local Chromium and drive it over the DevTools Protocol.
//
// Why CDP and not Playwright: Playwright does not support Android hosts, and Termux's
// Chromium is an Android-native build. Talking CDP straight to a Chromium we launch
// ourselves avoids Playwright's browser-download and preflight assumptions entirely, and
// needs no npm dependency at all (Node >= 22 ships a global WebSocket).
//
// The profile directory is the login. Whoever has that directory is logged in, which is why
// this must run on a real device (residential IP) and never on a CI runner.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PREFIX = process.env.PREFIX ?? '/data/data/com.termux/files/usr';

const CHROMIUM_CANDIDATES = [
  process.env.CHROMIUM_PATH,
  join(PREFIX, 'lib/chromium/chrome'),
  join(PREFIX, 'lib/chromium-browser/chrome'),
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
];

export function resolveChromium(explicit) {
  const candidates = [explicit, process.env.CHROMIUM_PATH, ...CHROMIUM_CANDIDATES];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  throw new Error(
    'no Chromium binary found — on Termux run: pkg install x11-repo chromium, ' +
      'or set CHROMIUM_PATH',
  );
}

export function chromiumVersion(binary) {
  try {
    return execFileSync(binary, ['--version'], { encoding: 'utf8', timeout: 20000 })
      .match(/(\d+)\.(\d+)\.(\d+)\.(\d+)/)?.slice(0, 4).join('.') ?? null;
  } catch {
    return null;
  }
}

// Headless Chromium advertises "HeadlessChrome" in navigator.userAgent and in the
// sec-ch-ua client hints, which is the single loudest bot tell there is. We present an
// ordinary Android Chrome identity instead — matching the device we actually run on.
export function stealthIdentity(binary) {
  const version = chromiumVersion(binary);
  const major = version?.split('.')[0] ?? '131';
  const full = version ?? `${major}.0.0.0`;
  return {
    userAgent:
      `Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) ` +
      `Chrome/${full} Mobile Safari/537.36`,
    acceptLanguage: 'en-US,en;q=0.9',
    userAgentMetadata: {
      brands: [
        { brand: 'Chromium', version: major },
        { brand: 'Google Chrome', version: major },
        { brand: 'Not_A Brand', version: '24' },
      ],
      fullVersionList: [
        { brand: 'Chromium', version: full },
        { brand: 'Google Chrome', version: full },
        { brand: 'Not_A Brand', version: '24' },
      ],
      fullVersion: full,
      platform: 'Android',
      platformVersion: '14.0.0',
      architecture: '',
      model: 'Pixel 7',
      mobile: true,
      bitness: '',
      wow64: false,
    },
  };
}

// Must be called after Network.enable and before the first navigation of interest.
export async function applyStealth(session, binary) {
  const identity = stealthIdentity(binary);
  await session.send('Network.enable');
  await session.send('Network.setUserAgentOverride', identity);
  return identity;
}

// Android/Termux needs the sandbox off; AutomationControlled is the flag Facebook's bot
// heuristics look for, so we turn it off explicitly rather than shipping the default.
export function chromiumArgs({ port, userDataDir, headless, lang = 'en-US' }) {
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate,MediaRouter,OptimizationHints',
    '--disable-blink-features=AutomationControlled',
    '--remote-allow-origins=*',
    '--password-store=basic',
    '--use-mock-keychain',
    `--lang=${lang}`,
  ];
  if (headless) args.push('--headless=new', '--window-size=1280,1024');
  else args.push('--start-maximized');
  return args;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function devToolsPort(port, userDataDir, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  const portFile = join(userDataDir, 'DevToolsActivePort');
  while (Date.now() < deadline) {
    if (existsSync(portFile)) {
      const raw = readFileSync(portFile, 'utf8').split('\n');
      const active = Number(raw[0]);
      if (Number.isInteger(active) && active > 0) {
        const res = await fetch(`http://127.0.0.1:${active}/json/version`).catch(() => null);
        if (res && res.ok) return active;
      }
    }
    await sleep(250);
  }
  throw new Error('Chromium DevTools endpoint never came up');
}

export async function launchChromium({
  userDataDir,
  headless = true,
  port = 0,
  executablePath,
  args: extraArgs = [],
  onLog,
} = {}) {
  const binary = resolveChromium(executablePath);
  if (!userDataDir) throw new Error('launchChromium requires userDataDir');
  mkdirSync(userDataDir, { recursive: true });

  const args = [...chromiumArgs({ port, userDataDir, headless }), ...extraArgs, 'about:blank'];
  const proc = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const log = onLog ?? (() => {});
  // Chromium on Android/Termux emits a steady stream of harmless errors (dbus is absent,
  // /proc/sys/fs/inotify is unreadable in the app sandbox, GCM registration fails). None of
  // it indicates a problem with us, so it is filtered to keep the poster's log readable.
  const NOISE = /dbus|OOM score|zygote|inotify|mojom|GCM|mcs_client|registration_request|voice_transcription/i;
  proc.stderr.on('data', (chunk) => {
    const line = String(chunk).trim();
    if (line && !NOISE.test(line)) log(`[chrome] ${line}`);
  });
  proc.stdout.on('data', (chunk) => log(`[chrome] ${String(chunk).trim()}`));

  let exited = null;
  proc.on('exit', (code, signal) => { exited = { code, signal }; });

  const activePort = await devToolsPort(port, userDataDir).catch((error) => {
    proc.kill('SIGKILL');
    throw new Error(`${error.message}${exited ? ` (chrome exited code=${exited.code})` : ''}`);
  });

  return {
    proc,
    port: activePort,
    binary,
    identity: stealthIdentity(binary),
    isRunning: () => exited === null,
    async close() {
      try { await fetch(`http://127.0.0.1:${activePort}/json/close`).catch(() => {}); } catch {}
      if (exited === null) {
        proc.kill('SIGTERM');
        await sleep(600);
        if (exited === null) proc.kill('SIGKILL');
      }
    },
  };
}

export async function listTargets(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  return res.json();
}

// Chrome >= 111 requires PUT for /json/new.
export async function createTarget(port, url = 'about:blank') {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
  });
  if (!res.ok) throw new Error(`createTarget failed: HTTP ${res.status}`);
  return res.json();
}

export async function pageTarget(port) {
  const existing = (await listTargets(port)).find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (existing) return existing;
  return createTarget(port);
}

export class CdpSession {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener('message', (event) => this.#onMessage(String(event.data)));
    ws.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) reject(new Error('CDP socket closed'));
      this.pending.clear();
    });
  }

  static async connect(wsUrl, timeoutMs = 20000) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('CDP connect timeout')), timeoutMs);
      ws.addEventListener('open', () => { clearTimeout(timer); res(); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(timer); rej(new Error('CDP connect error')); }, { once: true });
    });
    return new CdpSession(ws);
  }

  #onMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
      else resolve(msg.result);
      return;
    }
    if (msg.method) {
      for (const fn of this.handlers.get(msg.method) ?? []) fn(msg.params);
    }
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, { awaitPromise = true } = {}) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      const text = result.exceptionDetails.exception?.description
        ?? result.exceptionDetails.text ?? 'evaluate failed';
      throw new Error(text);
    }
    return result.result?.value;
  }

  async navigate(url, { timeoutMs = 45000 } = {}) {
    await this.send('Page.navigate', { url });
    await this.waitForReadyState(timeoutMs);
  }

  async waitForReadyState(timeoutMs = 45000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const state = await this.evaluate('document.readyState').catch(() => null);
      if (state === 'complete' || state === 'interactive') return state;
      await sleep(300);
    }
    throw new Error('page never reached an interactive readyState');
  }

  // Polls an expression until it returns truthy. Returns the truthy value, or null on timeout.
  async waitFor(expression, { timeoutMs = 20000, intervalMs = 500 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = await this.evaluate(expression).catch(() => null);
      if (value) return value;
      await sleep(intervalMs);
    }
    return null;
  }

  async typeText(text) {
    await this.send('Input.insertText', { text });
  }

  async screenshot(file) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    mkdirSync(resolve(file, '..'), { recursive: true });
    writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  }

  close() {
    try { this.ws.close(); } catch {}
  }
}

export function sleepMs(ms) {
  return sleep(ms);
}

export function clearProfile(userDataDir) {
  rmSync(userDataDir, { recursive: true, force: true });
}