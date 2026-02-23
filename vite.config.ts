import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'path';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

// Use GitHub Pages base URL in CI, otherwise root
const base = process.env.GITHUB_ACTIONS ? '/tony-stonks-pro-trader/' : '/';

export default defineConfig({
  plugins: [
    preact(),
    wasm(),
    topLevelAwait()
  ],
  base,
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  build: {
    target: 'esnext',
    minify: 'terser',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      },
      output: {
        manualChunks: {
          three: ['three'],
          rapier: ['@dimforge/rapier3d-compat'],
          howler: ['howler']
        }
      }
    }
  },
  publicDir: 'public',
  server: {
    port: 3000,
    open: true
  }
});
