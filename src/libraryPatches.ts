// Small fixes to a library we use, applied as the app is built (we cannot edit node_modules, and a
// copy of the library would stop getting its updates). Each fix replaces one exact piece of text and
// REFUSES to build if that text is not found exactly once, so a library update that changes the code
// is noticed and looked at, instead of silently going unpatched.

// The Chrome Web Store's address.
export const WEB_STORE_ORIGIN = 'https://chromewebstore.google.com';

// The library decides a message comes from the Web Store by checking the start of the sender's
// address. The address must match the store's exactly, so this makes it an exact comparison.
const LOOSE_ORIGIN_CHECK =
  '!senderOrigin || !senderOrigin.startsWith(WEBSTORE_URL)';
const EXACT_ORIGIN_CHECK = '!senderOrigin || senderOrigin !== WEBSTORE_URL';

// Replace one exact piece of text, which must be in the code exactly once.
function replaceOnce(
  code: string,
  from: string,
  to: string,
  library: string,
): string {
  const parts = code.split(from);
  if (parts.length !== 2) {
    throw new Error(
      `${library} changed: expected to find "${from}" exactly once, found ${parts.length - 1}. Look at the new code, then update src/libraryPatches.ts.`,
    );
  }
  return parts.join(to);
}

// The extension library (electron-chrome-extensions) answers almost every request an extension makes
// and pushes events to every extension, without checking the extension's manifest. Two hooks send
// every call and every event through Cleave's rules (src/extensionGate.ts) first. If the rules are
// not loaded, calls fail and events are not sent.
export const EXTENSION_GATE_GLOBAL = '__cleaveExtensionGate';

export function patchExtensionGate(code: string): string {
  const library = 'electron-chrome-extensions';
  const gate = `globalThis.${EXTENSION_GATE_GLOBAL}`;
  let patched = replaceOnce(
    code,
    'const result = await handler.callback(extEvent, ...args);',
    `const __gate = ${gate};
    if (!__gate) throw new Error(\`\${handlerName} is unavailable: Cleave's extension rules are not loaded.\`);
    __gate.before(handlerName, extension?.manifest, args, extension?.id);
    const result = __gate.after(handlerName, extension?.manifest, args, await handler.callback(extEvent, ...args));`,
    library,
  );
  patched = replaceOnce(
    patched,
    'const { type, extensionId } = listener;',
    `const { type, extensionId } = listener;
      const __gate = ${gate};
      const __extension = (this.session.extensions || this.session).getExtension(extensionId);
      const listenerArgs = __gate && __extension ? __gate.event(eventName, __extension.manifest, args) : null;
      if (listenerArgs === null) continue;`,
    library,
  );
  patched = replaceOnce(
    patched,
    'serviceWorker.send(ipcName, ...args);',
    'serviceWorker.send(ipcName, ...listenerArgs);',
    library,
  );
  return replaceOnce(
    patched,
    'listener.host.send(ipcName, ...args);',
    'listener.host.send(ipcName, ...listenerArgs);',
    library,
  );
}

export function patchWebStoreOriginCheck(code: string): string {
  const parts = code.split(LOOSE_ORIGIN_CHECK);
  if (parts.length !== 2) {
    throw new Error(
      `electron-chrome-web-store changed: expected to find its Web Store origin check exactly once, found ${parts.length - 1}. Look at the new code, then update src/libraryPatches.ts.`,
    );
  }
  return parts.join(EXACT_ORIGIN_CHECK);
}
