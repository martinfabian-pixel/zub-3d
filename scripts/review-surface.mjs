// Developer A/B against the approved Git snapshot. Own headless Chrome;
// localhost only, with identical geometry, lighting, palette and camera poses.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const sharp = require(process.env.SHARP_MODULE_PATH || 'sharp');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.env.SURFACE_REVIEW_DIR || '../professional-review/refinement-2026-11-04/surface-ab');
const base = new URL(process.env.PROTOTYPE_TEST_URL || 'http://127.0.0.1:5173');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname));
const commit = process.env.TOOTH_BASELINE_COMMIT || '95202c7f978dc77a1a6048123bf6dbfd080d4388';
const frozen = (path) => execFileSync('git', ['show', `${commit}:${path}`], { cwd: root, encoding: 'utf8' });
const baselineMaterial = frozen('src/prototype/materials.js');
const baselineConfig = frozen('src/prototype/config.js');
const report = { baseline: commit, scope: 'Matched actual WebGL renders, not photographs; own desktop headless Chrome. No physical mobile device.', variants: {}, differences: {} };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const images = {};
await mkdir(output, { recursive: true });

function distribution(values) {
  values.sort((a, b) => a - b);
  return { samples: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length, p95: values[Math.floor(values.length * .95)], p99: values[Math.floor(values.length * .99)], max: values.at(-1) };
}
async function decode(image) { return sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true }); }
function difference(a, b, mask) {
  const values = [];
  let squared = 0;
  for (let pixel = 0; pixel < a.length / 3; pixel++) {
    if (!mask[pixel]) continue;
    let maximum = 0;
    for (let channel = 0; channel < 3; channel++) { const d = a[pixel * 3 + channel] - b[pixel * 3 + channel]; maximum = Math.max(maximum, Math.abs(d)); squared += d * d; }
    values.push(maximum);
  }
  return { maxChannelCodeDifference: distribution(values), rgbRmsCodeDifference: Math.sqrt(squared / (values.length * 3)) };
}
function interiorMask(raw, width, height) {
  const inside = new Uint8Array(width * height);
  for (let i = 0; i < inside.length; i++) inside[i] = Math.min(raw[i * 3], raw[i * 3 + 1], raw[i * 3 + 2]) < 244;
  const eroded = new Uint8Array(inside.length);
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    eroded[i] = inside[i] && inside[i - 1] && inside[i + 1] && inside[i - width] && inside[i + width];
  }
  return eroded;
}
async function pose(page, view) {
  await page.evaluate((name) => {
    const app = window.__toothPrototype;
    app.controls.enableDamping = false;
    app.controls.autoRotate = false;
    if (name === 'home') { document.querySelector('#prototype-reset').click(); }
    else if (name === 'crown') { app.controls.target.set(0, 1.1, 0); app.camera.position.set(.30, 5.8, .60); }
    else if (name === 'neck') { app.controls.target.set(0, .25, 0); app.camera.position.set(1.2, 1.15, 4.6); }
    else if (name === 'root') { app.controls.target.set(0, -.85, .10); app.camera.position.set(1.8, -.55, 4.1); }
    app.controls.update();
  }, view);
  await page.waitForTimeout(120);
}
async function frame(page, ratio, dx = 0) {
  const dataURL = await page.evaluate(({ ratio, dx }) => {
    const app = window.__toothPrototype;
    app.renderer.setPixelRatio(ratio);
    app.camera.position.x += dx;
    app.controls.update();
    app.renderer.render(app.scene, app.camera);
    const data = app.renderer.domElement.toDataURL('image/png');
    app.camera.position.x -= dx;
    app.controls.update();
    return data;
  }, { ratio, dx });
  return Buffer.from(dataURL.split(',')[1], 'base64');
}
try {
  for (const variant of ['approved', 'derivative-only', 'refined']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    const overrides = new Set();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (entry) => { if (entry.type() === 'error') errors.push(entry.text()); });
    if (variant === 'approved') {
      await page.route('**/src/prototype/materials.js*', async (route) => {
        overrides.add('materials');
        const response = await route.fetch();
        const transformed = await response.text();
        const modulePath = transformed.match(/from\s+["']([^"']*three[^"']*)["']/)?.[1];
        assert.ok(modulePath, 'Vite must resolve the pinned Three.js module.');
        await route.fulfill({ response, contentType: 'text/javascript', body: baselineMaterial.replace("from 'three'", `from ${JSON.stringify(modulePath)}`) });
      });
      await page.route('**/src/prototype/config.js*', (route) => { overrides.add('config'); return route.fulfill({ contentType: 'text/javascript', body: baselineConfig }); });
    } else if (variant === 'derivative-only') {
      await page.route('**/src/prototype/config.js*', async (route) => {
        overrides.add('config');
        const response = await route.fetch();
        const body = await response.text();
        await route.fulfill({ response, contentType: 'text/javascript', body: body + '\ntoothConfig.material.micro.rootAmplitudeToHeight=0.0000156; toothConfig.material.micro.rootAxialFrequency=1; toothConfig.material.mesoRoughness.enamelAmplitude=0; toothConfig.material.mesoRoughness.rootAmplitude=0;\n' });
      });
    }
    await page.goto(new URL('/prototype/?qa=1', base).href);
    await page.waitForSelector('#prototype-canvas[data-ready="true"][data-frame-count]', { timeout: 45000 });
    await page.waitForTimeout(350);
    if (variant !== 'refined') assert.ok(overrides.has('config'), 'A/B requires the Vite dev server; compiled preview cannot override source modules.');
    if (variant === 'approved') assert.ok(overrides.has('materials'), 'Approved shader source must actually be loaded.');
    images[variant] = {};
    const metrics = { errors, poses: {}, temporalReference: {}, dataset: await page.locator('canvas').evaluate((canvas) => ({ ...canvas.dataset })) };
    assert.equal(metrics.dataset.shaderErrors, '0');
    assert.equal(metrics.dataset.assetTriangles, '57008');
    for (const view of ['home', 'crown', 'neck', 'root']) {
      await pose(page, view);
      const image = await frame(page, 1);
      await mkdir(`${output}/${variant}`, { recursive: true });
      await writeFile(`${output}/${variant}/${view}.png`, image);
      const decoded = await decode(image);
      images[variant][view] = decoded;
      metrics.poses[view] = await page.evaluate(() => ({ position: window.__toothPrototype.camera.position.toArray(), target: window.__toothPrototype.controls.target.toArray() }));
      if (view === 'home' || view === 'crown' || view === 'root') {
        const errorsToReference = [];
        const mask = interiorMask(decoded.data, decoded.info.width, decoded.info.height);
        for (let sample = 0; sample < 8; sample++) {
          const dx = (sample - 3.5) * 0.00015;
          const ordinary = await decode(await frame(page, 1, dx));
          const high = await frame(page, 2, dx);
          const reference = await sharp(high).resize(decoded.info.width, decoded.info.height, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
          errorsToReference.push(difference(ordinary.data, reference, mask));
        }
        metrics.temporalReference[view] = {
          method: 'Eight matched subpixel poses against a 2x-resolution Lanczos3-downsampled WebGL reference; excludes silhouette/background. This is a sampling proxy, not a photograph or ground-truth optical measurement.',
          meanRgbRmsCodeError: errorsToReference.reduce((sum, item) => sum + item.rgbRmsCodeDifference, 0) / errorsToReference.length,
          worstP99MaxChannelCodeError: Math.max(...errorsToReference.map((item) => item.maxChannelCodeDifference.p99)),
        };
      }
    }
    report.variants[variant] = metrics;
    assert.equal(errors.length, 0, errors.join('\n'));
    await context.close();
    console.log('Rendered surface variant:', variant);
  }
  for (const variant of ['derivative-only', 'refined']) {
    report.differences[variant] = {};
    for (const view of ['home', 'crown', 'neck', 'root']) {
      const a = images.approved[view];
      report.differences[variant][view] = difference(a.data, images[variant][view].data, interiorMask(a.data, a.info.width, a.info.height));
    }
  }
  const panels = [];
  for (let row = 0; row < 4; row++) for (let column = 0; column < 2; column++) {
    const variant = column ? 'refined' : 'approved';
    const view = ['home', 'crown', 'neck', 'root'][row];
    panels.push({ input: await sharp(`${output}/${variant}/${view}.png`).resize(640, 450).toBuffer(), left: column * 640, top: row * 450 });
  }
  await sharp({ create: { width: 1280, height: 1800, channels: 3, background: '#fff' } }).composite(panels).jpeg({ quality: 94 }).toFile(`${output}/comparison.jpg`);
  report.passed = true;
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
console.log(JSON.stringify({ passed: report.passed, differences: report.differences, temporal: Object.fromEntries(Object.entries(report.variants).map(([name, value]) => [name, value.temporalReference])) }, null, 2));
