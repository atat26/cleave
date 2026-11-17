import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  // The extension libraries look for their own helper scripts relative to where
  // they run (import.meta.dirname). The bundler would otherwise erase that, and
  // the helper scripts would not be found. Here it is the folder of the built file.
  define: {
    'import.meta.dirname': '__dirname',
  },
});
