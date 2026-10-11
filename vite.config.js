import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

// Model URLs must change with their contents: Pages/CDN caches must never pair
// new optical shaders with an earlier generation of the anatomical asset.
const assetHash = createHash('sha256');
for (const path of ['models/molar.glb', 'models/molar-mobile.glb', 'environment/studio-small-09-1k.hdr']) {
  const file = new URL(`./public/${path}`, import.meta.url);
  assetHash.update(path);
  if (existsSync(file)) assetHash.update(readFileSync(file));
}

export default defineConfig({
  // Works both at /zub-3d/ on GitHub Pages and in a local preview.
  base: './',
  define: { __ASSET_REVISION__: JSON.stringify(assetHash.digest('hex').slice(0, 12)) },
  build: { target: 'es2022' },
});
