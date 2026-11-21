import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { patchWebStoreOriginCheck } from './src/libraryPatches.ts';

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

// Fix the Web Store library's origin check as it is bundled (see src/libraryPatches.ts). The build
// stops if the library's code is not found or has changed.
const patchWebStoreLibrary = (): Plugin => {
  let patched = false;
  return {
    name: 'patch-web-store-origin-check',
    transform(code, id) {
      if (
        !/electron-chrome-web-store[\\/]dist[\\/](esm|cjs)[\\/]browser[\\/]index\.m?js$/.test(
          id,
        )
      ) {
        return null;
      }
      patched = true;
      return { code: patchWebStoreOriginCheck(code), map: null };
    },
    buildEnd() {
      if (!patched) {
        throw new Error(
          'The Web Store library was not part of the build, so its origin check was not fixed (see src/libraryPatches.ts).',
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
  plugins: [copyExtensionHelperScripts(), patchWebStoreLibrary()],
});
