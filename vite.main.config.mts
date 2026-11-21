import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import {
  patchExtensionGate,
  patchWebStoreOriginCheck,
} from './src/libraryPatches.ts';

// The two extension libraries each have a small helper script that is loaded into web pages. They look
// for it next to the built main file. While developing, they find it in node_modules; the installed
// app has no node_modules (everything else is bundled into main.cjs), so copy the scripts next to it.
const requireHere = createRequire(import.meta.url);
const HELPER_SCRIPTS = [
  'electron-chrome-extensions/preload',
  'electron-chrome-web-store/preload',
];
const copyExtensionHelperScripts = (): Plugin => ({
  name: 'copy-extension-helper-scripts',
  generateBundle() {
    for (const name of HELPER_SCRIPTS) {
      const file = requireHere.resolve(name);
      this.emitFile({
        type: 'asset',
        fileName: path.basename(file),
        source: fs.readFileSync(file),
      });
    }
  },
});

// Fix a library as it is bundled (see src/libraryPatches.ts). The build stops if the library is not
// part of it, or if its code has changed so the fix no longer fits.
const patchLibrary = (
  name: string,
  file: RegExp,
  patch: (code: string) => string,
): Plugin => {
  let patched = false;
  return {
    name: `patch-${name}`,
    transform(code, id) {
      if (!file.test(id)) return null;
      patched = true;
      return { code: patch(code), map: null };
    },
    buildEnd() {
      if (!patched) {
        throw new Error(
          `${name} was not part of the build, so it was not patched (see src/libraryPatches.ts).`,
        );
      }
    },
  };
};

// https://vitejs.dev/config
export default defineConfig({
  // The extension libraries look for their own helper scripts relative to where
  // they run (import.meta.dirname). The bundler would otherwise erase that, and
  // the helper scripts would not be found. Here it is the folder of the built file.
  define: {
    'import.meta.dirname': '__dirname',
  },
  plugins: [
    copyExtensionHelperScripts(),
    patchLibrary(
      'electron-chrome-web-store',
      /electron-chrome-web-store[\\/]dist[\\/](esm|cjs)[\\/]browser[\\/]index\.m?js$/,
      patchWebStoreOriginCheck,
    ),
    patchLibrary(
      'electron-chrome-extensions',
      /electron-chrome-extensions[\\/]dist[\\/](esm|cjs)[\\/]index\.m?js$/,
      patchExtensionGate,
    ),
  ],
});
