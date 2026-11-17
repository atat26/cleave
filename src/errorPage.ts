// The pages shown in a tab when a site cannot be opened ("This site can't be
// reached") or a page stops working, instead of a blank tab, like Chrome's. They say
// what happened in plain words, offer to try again, and show the error code under
// Details. Pure code with no Electron, so it is easy to test. (A wrong security
// certificate has its own page: certPage.ts.)
import { escapeHtml, shellPage } from './certPage.ts';

interface Failure {
  name: string;
  // What happened, for a site called `host`.
  reason: (host: string) => string;
  // What may help.
  tips: string[];
}

const CHECK_ADDRESS = 'Check the address for a typo';
const CHECK_NET = 'Check your internet connection';
const TRY_LATER = 'Try again in a few minutes';

// The network errors that show a page (by Chromium's error number). Others are
// left alone (and a load you cancel yourself, -3, never shows one).
const FAILURES: Record<number, Failure> = {
  [-7]: {
    name: 'ERR_TIMED_OUT',
    reason: (h) => `${h} took too long to respond.`,
    tips: [CHECK_NET, TRY_LATER],
  },
  [-21]: {
    name: 'ERR_NETWORK_CHANGED',
    reason: () => 'Your network connection changed while the page was loading.',
    tips: [CHECK_NET],
  },
  [-100]: {
    name: 'ERR_CONNECTION_CLOSED',
    reason: (h) => `The connection to ${h} was closed unexpectedly.`,
    tips: [TRY_LATER],
  },
  [-101]: {
    name: 'ERR_CONNECTION_RESET',
    reason: (h) => `The connection to ${h} was reset.`,
    tips: [CHECK_NET, TRY_LATER],
  },
  [-102]: {
    name: 'ERR_CONNECTION_REFUSED',
    reason: (h) => `${h} refused to connect.`,
    tips: ['Check that the site or server is running', CHECK_ADDRESS],
  },
  [-103]: {
    name: 'ERR_CONNECTION_ABORTED',
    reason: (h) => `The connection to ${h} was stopped.`,
    tips: [TRY_LATER],
  },
  [-104]: {
    name: 'ERR_CONNECTION_FAILED',
    reason: (h) => `A connection to ${h} could not be made.`,
    tips: [CHECK_NET, CHECK_ADDRESS],
  },
  [-105]: {
    name: 'ERR_NAME_NOT_RESOLVED',
    reason: (h) => `${h}’s server address could not be found.`,
    tips: [CHECK_ADDRESS, CHECK_NET],
  },
  [-106]: {
    name: 'ERR_INTERNET_DISCONNECTED',
    reason: () => 'You are not connected to the internet.',
    tips: ['Check your network cables, modem and router', 'Reconnect to Wi-Fi'],
  },
  [-107]: {
    name: 'ERR_SSL_PROTOCOL_ERROR',
    reason: (h) => `${h} sent a response the browser could not understand.`,
    tips: [TRY_LATER],
  },
  [-109]: {
    name: 'ERR_ADDRESS_UNREACHABLE',
    reason: (h) => `${h} cannot be reached from this network.`,
    tips: [CHECK_NET, 'Check that you are on the right network or VPN'],
  },
  [-113]: {
    name: 'ERR_SSL_VERSION_OR_CIPHER_MISMATCH',
    reason: (h) => `${h} uses security settings this browser does not support.`,
    tips: [TRY_LATER],
  },
  [-118]: {
    name: 'ERR_CONNECTION_TIMED_OUT',
    reason: (h) => `${h} took too long to respond.`,
    tips: [CHECK_NET, TRY_LATER],
  },
  [-310]: {
    name: 'ERR_TOO_MANY_REDIRECTS',
    reason: (h) => `${h} sent you around in circles (too many redirects).`,
    tips: ['Clearing this site’s cookies in Settings may help'],
  },
  [-312]: {
    name: 'ERR_UNSAFE_PORT',
    reason: (h) =>
      `The browser does not connect to this port on ${h}, for your safety.`,
    tips: [CHECK_ADDRESS],
  },
  [-324]: {
    name: 'ERR_EMPTY_RESPONSE',
    reason: (h) => `${h} did not send any data.`,
    tips: [TRY_LATER],
  },
};

// Is this network error one that shows a "can't be reached" page?
export const isLoadError = (code: number): boolean => code in FAILURES;

export const loadErrorName = (code: number): string =>
  FAILURES[code]?.name ?? 'ERR_FAILED';

const retry = `<p><a class="btn" href="aib:reload">Reload</a></p>`;

// The page for a site that cannot be reached.
export function loadErrorUrl(host: string, code: number): string {
  const failure = FAILURES[code];
  const safeHost = escapeHtml(host);
  const offline = code === -106;
  const reason = escapeHtml(
    failure ? failure.reason(host) : `${host} could not be opened.`,
  );
  const tips = (failure?.tips ?? [TRY_LATER])
    .map((tip) => `<li>${escapeHtml(tip)}</li>`)
    .join('');
  return shellPage(
    offline ? 'No internet' : 'This site can’t be reached',
    `<div class="icon">${offline ? '⏻' : '!'}</div>
<h1>${offline ? 'No internet' : `This site can’t be reached`}</h1>
<p>${reason}</p>
<ul class="muted">${tips}</ul>
${retry}
<details><summary>Details</summary>
<p>The address was <b>${safeHost}</b>. The code is <code>${escapeHtml(loadErrorName(code))}</code>.</p></details>`,
  );
}

// The page for a tab whose page stopped working (crashed or ran out of memory).
export function crashPageUrl(host: string): string {
  return shellPage(
    'This page stopped working',
    `<div class="icon">!</div>
<h1>This page stopped working</h1>
<p>${escapeHtml(host === '' ? 'The page' : host)} crashed or ran out of memory. Your other tabs are fine.</p>
${retry}`,
  );
}
