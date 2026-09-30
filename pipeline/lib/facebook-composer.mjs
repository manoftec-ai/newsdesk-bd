// lib/facebook-composer.mjs — drive Meta Business Suite's web composer to publish a Page post.
//
// No Graph API, no app review, no token: it types into the same composer a human uses.
// Everything is located by aria-label / role / placeholder rather than CSS classes, because
// Meta changes class names constantly and ships redesigns that break scrapers.
//
// SAFETY CONTRACT — this interacts with an account, so it refuses to guess:
//   * never posts when a login wall or a checkpoint is detected (returns reason, halts the run)
//   * never marks a story as sent unless publishing was positively confirmed
//   * an "uncertain" outcome (clicked, cannot confirm) halts the batch and screenshots, so a
//     human can look before anything is retried and risks a duplicate post
import { join } from 'node:path';

export const COMPOSER_URL = 'https://business.facebook.com/latest/composer/';
export const HOME_URL = 'https://business.facebook.com/';
export const LOGIN_URL = 'https://www.facebook.com/login';

// Meta serves captchas and 2FA challenges to unfamiliar profiles. We never try to defeat
// them — we detect them, screenshot, and hand control back to a human.
export const CHALLENGE_PATTERN =
  /captcha|security check|verify it's you|confirm it's you|enter the characters|identify|checkpoint|two-factor|login code|সুরক্ষা যাচাই/;

export async function detectChallenge(session) {
  const body = await session.evaluate(`(document.body?.innerText || '').slice(0, 2000)`).catch(() => '');
  const match = body.match(CHALLENGE_PATTERN);
  return match ? match[0] : null;
}

export async function attemptLogin(session, { email, password }) {
  await session.navigate(LOGIN_URL, { timeoutMs: 45000 });
  const challenge = await detectChallenge(session);
  if (challenge) return { ok: false, reason: `challenge:${challenge}` };

  const filledEmail = await session.evaluate(`(() => {
    const el = document.querySelector('#email, input[name="email"], input[type="email"]');
    if (!el) return false;
    el.focus(); el.value = ${JSON.stringify(email)};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  if (!filledEmail) return { ok: false, reason: 'email-field-not-found' };

  await session.waitFor('!!document.querySelector(\'#pass, input[name="pass"], input[type="password"]\')', { timeoutMs: 20000 });
  const filledPassword = await session.evaluate(`(() => {
    const el = document.querySelector('#pass, input[name="pass"], input[type="password"]');
    if (!el) return false;
    el.focus(); el.value = ${JSON.stringify(password)};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  if (!filledPassword) return { ok: false, reason: 'password-field-not-found' };

  await session.evaluate(`(() => {
    const btn = document.querySelector('button[name="login"], #loginbutton, button[type="submit"]');
    if (btn) { btn.click(); return true; }
    const el = document.querySelector('#pass, input[name="pass"]');
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    return true;
  })()`);

  await session.waitForReadyState(30000).catch(() => null);
  const body = await session.evaluate(`(document.body?.innerText || '').slice(0, 500)`).catch(() => '');
  if (CHALLENGE_PATTERN.test(body)) {
    const which = body.match(CHALLENGE_PATTERN)[0];
    return { ok: false, reason: `challenge:${which}` };
  }
  if (await session.evaluate(`!!document.querySelector('input[type="password"]')`)) {
    return { ok: false, reason: 'password-rejected' };
  }
  return { ok: true, reason: 'login-submitted' };
}

// Runs inside the page. Reports what is actually on screen so `--probe` can be diffed
// against expectations after a Meta redesign instead of failing blind.
export const PAGE_SIGNALS_EXPR = `(() => {
  const all = (sel) => [...document.querySelectorAll(sel)];
  const label = (el) =>
    (el.getAttribute('aria-label') || el.innerText || el.value || '').trim().slice(0, 60);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // Anonymous visitors get a marketing page whose only auth affordance is a "Log in"
  // button — no password field at all. Verified on-device 2026-09-30: a password-field-only
  // check reported a logged-OUT session as logged in, then failed confusingly downstream.
  const loginCta = [...all('a, button, [role="button"]')]
    .filter(visible)
    .map(label)
    .filter((t) => t && /^(log ?in|login|লগ ?ইন|সাইন ?ইন)$/i.test(t))
    .slice(0, 5);
  return {
    url: location.href,
    host: location.hostname,
    title: document.title,
    hasPasswordField: !!document.querySelector('input[type="password"]'),
    hasEmailField: !!document.querySelector('input[name="email"], input[type="email"]'),
    hasLoginForm: !!document.querySelector('form[action*="login"]'),
    loginCta,
    bodyText: (document.body?.innerText || '').slice(0, 300),
    textboxes: all('div[contenteditable="true"], textarea')
      .map((el) => ({
        tag: el.tagName,
        role: el.getAttribute('role') || '',
        aria: el.getAttribute('aria-label') || '',
        placeholder: el.getAttribute('placeholder') || '',
        testid: el.getAttribute('data-testid') || '',
        text: (el.innerText || '').trim().slice(0, 40),
      }))
      .slice(0, 20),
    buttons: all('button, [role="button"]')
      .map((el) => ({
        text: label(el),
        aria: el.getAttribute('aria-label') || '',
        disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
        testid: el.getAttribute('data-testid') || '',
      }))
      .filter((b) => b.text || b.aria)
      .slice(0, 60),
  };
})()`;

export function classifySignals(signals) {
  if (!signals) return { state: 'unknown', reason: 'no-signal' };
  // Login wall first: an anonymous page can still contain a contenteditable or two.
  if (signals.hasPasswordField || signals.hasLoginForm || signals.hasEmailField || signals.loginCta?.length) {
    return { state: 'login-wall', reason: 'login-required' };
  }
  const body = (signals.bodyText || '').toLowerCase();
  if (/checkpoint|security check|verify it's you|confirm it's you|two-step|সুরক্ষা যাচাই/.test(body)) {
    return { state: 'checkpoint', reason: 'checkpoint-challenge' };
  }
  if (signals.textboxes?.length) return { state: 'composer', reason: 'composer-present' };
  return { state: 'unknown', reason: 'no-composer-found' };
}

export async function inspectPage(session) {
  const signals = await session.evaluate(PAGE_SIGNALS_EXPR);
  return { signals, ...classifySignals(signals) };
}

// Prefer a real textbox, then any contenteditable, then a textarea. Ordered most-specific
// first so we never type into a hidden search field.
export const FOCUS_TEXTBOX_EXPR = `(() => {
  const all = (sel) => [...document.querySelectorAll(sel)];
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 40 && r.height > 20;
  };
  const candidates = [
    ...all('div[contenteditable="true"][role="textbox"]'),
    ...all('textarea'),
    ...all('div[contenteditable="true"]'),
  ].filter(visible);
  if (!candidates.length) return null;
  candidates[0].focus();
  return { tag: candidates[0].tagName, focused: document.activeElement === candidates[0] };
})()`;

// Business Suite labels the publish control "Post", "Publish", "Post Now" or "Schedule"
// depending on locale and whether a schedule is set. Matched loosely, in preference order.
const PUBLISH_LABEL_PATTERN = 'post now|publish now|^post$|^publish$|post to page|schedule|প্রকাশ';

export const FIND_PUBLISH_EXPR = `(() => {
  const re = new RegExp(${JSON.stringify(PUBLISH_LABEL_PATTERN)}, 'i');
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 10 && r.height > 10;
  };
  const all = [...document.querySelectorAll('button, [role="button"], [role="submit"]')]
    .filter(visible)
    .map((el) => ({
      text: (el.innerText || '').trim().slice(0, 40),
      aria: el.getAttribute('aria-label') || '',
      disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
    }))
    .filter((b) => re.test(b.text) || re.test(b.aria));
  if (!all.length) return null;
  return { candidates: all.slice(0, 8), chosen: all.find((b) => !b.disabled) ?? all[0] };
})()`;

export async function findPublishControl(session) {
  return session.evaluate(FIND_PUBLISH_EXPR);
}

export async function clickPublish(session) {
  return session.evaluate(`(() => {
    const re = new RegExp(${JSON.stringify(PUBLISH_LABEL_PATTERN)}, 'i');
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 10 && r.height > 10;
    };
    const buttons = [...document.querySelectorAll('button, [role="button"], [role="submit"]')]
      .filter((el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true')
      .filter((el) => re.test((el.innerText || '').trim()) || re.test(el.getAttribute('aria-label') || ''));
    if (!buttons.length) return false;
    buttons[0].click();
    return true;
  })()`);
}

export async function composerText(session) {
  return session.evaluate(`(() => {
    const el = document.querySelector('div[contenteditable="true"][role="textbox"]')
      || document.querySelector('div[contenteditable="true"]')
      || document.querySelector('textarea');
    return el ? (el.innerText || el.value || '').trim() : null;
  })()`);
}

export async function toastText(session) {
  return session.evaluate(`(() => {
    const re = /published|posted|scheduled|shared|live|done|সফল|প্রকাশিত/i;
    const nodes = [...document.querySelectorAll('[role="alert"], [aria-live]')]
      .map((el) => (el.innerText || '').trim())
      .filter((t) => t && re.test(t));
    return nodes[0] ?? null;
  })()`);
}

export async function openComposer(session, { url = COMPOSER_URL, timeoutMs = 45000 } = {}) {
  await session.navigate(url, { timeoutMs });
  // Business Suite is a SPA: give it a beat to hydrate after load fires.
  await session.waitFor(
    'document.querySelectorAll(\'div[contenteditable="true"], textarea\').length > 0',
    { timeoutMs: 20000 },
  ).catch(() => null);
  return inspectPage(session);
}

// Publishes one story. Resolves to a verdict object, never throws for ordinary UI drift:
//   { ok: true,  reason: 'confirmed' }
//   { ok: false, reason: 'login-wall' | 'checkpoint' | 'composer-missing' | 'publish-missing'
//                   | 'publish-disabled' | 'not-typed' | 'uncertain' }
// `uncertain` is the dangerous one: we clicked but cannot prove it landed, so the caller must
// stop and let a human look rather than retry and risk a duplicate.
export async function postStory(session, { text, logDir = 'logs', slug = 'unknown', timeoutMs = 30000 } = {}) {
  const shot = (tag) => session.screenshot(join(logDir, `fb-web-${slug}-${tag}.png`)).catch(() => null);

  const opened = await openComposer(session);
  if (opened.state === 'login-wall' || opened.state === 'checkpoint') {
    await shot('blocked');
    return { ok: false, reason: opened.reason, needsHuman: true };
  }
  if (opened.state !== 'composer') {
    await shot('no-composer');
    return { ok: false, reason: 'composer-missing' };
  }

  const focused = await session.evaluate(FOCUS_TEXTBOX_EXPR);
  if (!focused) {
    await shot('no-textbox');
    return { ok: false, reason: 'composer-missing' };
  }

  await session.typeText(text);

  const landed = await session.waitFor(
    `((document.querySelector('div[contenteditable="true"][role="textbox"]')?.innerText)
      || document.querySelector('div[contenteditable="true"]')?.innerText
      || document.querySelector('textarea')?.value || '').length > ${Math.min(40, text.length)}`,
    { timeoutMs: 15000 },
  );
  if (!landed) {
    await shot('not-typed');
    return { ok: false, reason: 'not-typed' };
  }

  const control = await findPublishControl(session);
  if (!control) {
    await shot('no-publish');
    return { ok: false, reason: 'publish-missing' };
  }
  if (control.chosen?.disabled) {
    await shot('publish-disabled');
    return { ok: false, reason: 'publish-disabled' };
  }

  const clicked = await clickPublish(session);
  if (!clicked) {
    await shot('click-failed');
    return { ok: false, reason: 'publish-missing' };
  }

  // Confirm by two independent signals: a success toast, or the composer emptying out.
  const deadline = Date.now() + timeoutMs;
  let evidence = null;
  while (Date.now() < deadline) {
    const toast = await toastText(session).catch(() => null);
    if (toast) { evidence = { toast }; break; }
    const remaining = await composerText(session).catch(() => null);
    if (remaining !== null && remaining.length <= 2) { evidence = { composerCleared: true }; break; }
    const state = await classifySignals(await session.evaluate(PAGE_SIGNALS_EXPR).catch(() => null));
    if (state.state === 'checkpoint') { await shot('checkpoint'); return { ok: false, reason: 'checkpoint', needsHuman: true }; }
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (!evidence) {
    await shot('uncertain');
    return { ok: false, reason: 'uncertain', needsHuman: true };
  }
  return { ok: true, reason: 'confirmed', evidence };
}