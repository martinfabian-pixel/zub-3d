import { defineConfig } from 'vite';

export default defineConfig({
  // Works both at /zub-3d/ on GitHub Pages and in a local preview.
  base: './',
  build: { target: 'es2022' },
});
