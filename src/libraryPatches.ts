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

export function patchWebStoreOriginCheck(code: string): string {
  const parts = code.split(LOOSE_ORIGIN_CHECK);
  if (parts.length !== 2) {
    throw new Error(
      `electron-chrome-web-store changed: expected to find its Web Store origin check exactly once, found ${parts.length - 1}. Look at the new code, then update src/libraryPatches.ts.`,
    );
  }
  return parts.join(EXACT_ORIGIN_CHECK);
}
