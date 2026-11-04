import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Model URLs must change with their contents: Pages/CDN caches must never pair
// new optical shaders with an earlier generation of the anatomical asset.
const assetHash = createHash('sha256');
for (const path of ['models/molar.glb', 'models/molar-mobile.glb', 'environment/studio-small-09-1k.hdr']) {
  const file = new URL(`./public/${path}`, import.meta.url);
  assetHash.update(path);
  if (existsSync(file)) assetHash.update(readFileSync(file));
}

const prototypeHash = createHash('sha256');
for (const path of ['molar.glb', 'molar-mobile.glb']) {
  const file = new URL(`./public/prototype-assets/${path}`, import.meta.url);
  prototypeHash.update(path);
  if (existsSync(file)) prototypeHash.update(readFileSync(file));
}

const dentitionHash = createHash('sha256');
for (const path of ['manifest.json', 'dentition.glb', 'dentition-mobile.glb']) {
  const file = new URL(`./public/dentition-assets/${path}`, import.meta.url);
  dentitionHash.update(path);
  if (existsSync(file)) dentitionHash.update(readFileSync(file));
}

export default defineConfig({
  // Works both at /zub-3d/ on GitHub Pages and in a local preview.
  base: './',
  define: {
    __ASSET_REVISION__: JSON.stringify(assetHash.digest('hex').slice(0, 12)),
    __PROTOTYPE_ASSET_REVISION__: JSON.stringify(prototypeHash.digest('hex').slice(0, 12)),
    __DENTITION_ASSET_REVISION__: JSON.stringify(dentitionHash.digest('hex').slice(0, 12)),
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        prototype: fileURLToPath(new URL('./prototype/index.html', import.meta.url)),
        experience: fileURLToPath(new URL('./experience/index.html', import.meta.url)),
      },
    },
  },
});
