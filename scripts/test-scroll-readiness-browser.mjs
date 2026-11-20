import { assertFirstDraw, observeStartup } from './startup-frame-probe.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { flightEnd, flightStart } from '../src/experience/floating-teeth.js';
import { DENTAL_CHAPTERS, STORY_TIMING } from '../src/experience/story-config.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const url = new URL(process.env.DENTAL_STORY_TEST_URL || 'http://127.0.0.1:4173/');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Use a local Vite server');
url.searchParams.set('qa', '1');

const chapter = id => DENTAL_CHAPTERS.find(step => step.id === id);
const geometry = {
  hero: /\/dentition-assets\/hero-36(?:-mobile)?\.glb$/,
  teaching: /\/dentition-assets\/dentition(?:-mobile)?\.glb$/,
  upper: /\/prototype-assets\/molar(?:-mobile)?\.glb$/,
  crowns: /\/dentition-assets\/crowns\.glb$/,
  site: /\/story-assets\/site\.json$/,
  opening: /\/dentition-assets\/crowns\.glb$|\/prototype-assets\/molar(?:-mobile)?\.glb$/,
};
const studyGate = chapter('space').start - .001;
const targetEpsilon = .003;

async function holdAssets(page, paths) {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const held = [];
  await page.route(url => paths.test(url.pathname), async route => {
    held.push(route.request().url());
    await gate;
    await route.continue();
  });
  return { held, release };
}

function readProgress() {
  const app = window.__dentalExperience;
  if (!app) return null;
  const journey = document.querySelector('#dental-journey');
  const stage = document.querySelector('#journey-stage').getBoundingClientRect();
  const travel = stage.height * Number.parseFloat(getComputedStyle(journey).getPropertyValue('--journey-screens'));
  const state = app.report();
  return {
    native: -journey.getBoundingClientRect().top / travel,
    scrollY: window.scrollY,
    progress: state.progress,
    render: state.renderProgress,
    chapter: state.story.chapterId,
    assetsReady: state.assetsReady,
    teeth: state.fullyVisibleTeeth,
    crownMix: state.crownMix,
    crowns: [...app.arch.teeth.values()].filter(item => item.crown?.visible).length,
    roots: [...app.arch.teeth.values()].filter(item => item.mesh?.visible).length,
    shaderErrors: state.shaderErrors,
    camera: [...state.camera, ...state.target, app.rig.camera.zoom],
  };
}

async function atChapter(page, id) {
  const { at } = chapter(id);
  await page.waitForFunction(({ at, id, epsilon }) => {
    const state = window.__dentalExperience?.report();
    return state?.story.chapterId === id
      && Math.abs(state.progress - at) < epsilon
      && Math.abs(state.renderProgress - state.storyProgress) < .00003;
  }, { at, id, epsilon: targetEpsilon }, { timeout: 30000 });
}

async function atLoadingStop(page, maximum, id) {
  await page.waitForFunction(({ maximum, id, epsilon }) => {
    const state = window.__dentalExperience?.report();
    if (!state) return false;
    const journey = document.querySelector('#dental-journey');
    const stage = document.querySelector('#journey-stage').getBoundingClientRect();
    const travel = stage.height * Number.parseFloat(getComputedStyle(journey).getPropertyValue('--journey-screens'));
    const native = -journey.getBoundingClientRect().top / travel;
    return state.story.chapterId === id
      && Math.abs(state.readiness.limit - maximum) < epsilon
      && Math.abs(state.progress - maximum) < epsilon
      && Math.abs(state.progress - native) < epsilon
      && Math.abs(state.renderProgress - state.storyProgress) < .00003;
  }, { maximum, id, epsilon: targetEpsilon }, { timeout: 20000 });
  return page.evaluate(readProgress);
}

async function nativeSeek(page, progress) {
  await page.evaluate(progress => {
    const journey = document.querySelector('#dental-journey');
    const stage = document.querySelector('#journey-stage').getBoundingClientRect();
    const fullTravel = stage.height * Number.parseFloat(getComputedStyle(journey).getPropertyValue('--journey-screens'));
    window.scrollTo({ top: window.scrollY + journey.getBoundingClientRect().top + progress * fullTravel, behavior: 'instant' });
  }, progress);
  await page.waitForTimeout(190);
}

async function overshoot(page) {
  for (const target of [.69, .88, .997]) await nativeSeek(page, target);
}

async function extractionPose(page, at) {
  await nativeSeek(page, at);
  await page.waitForFunction(({ at, epsilon }) => {
    const state = window.__dentalExperience.report();
    return Math.abs(state.progress - at) < epsilon
      && Math.abs(state.renderProgress - state.storyProgress) < .00003;
  }, { at, epsilon: targetEpsilon });
  return page.evaluate(() => {
    const state = window.__dentalExperience.report();
    return Object.fromEntries(state.teeth.filter(tooth => [31, 35, 36, 37].includes(tooth.fdi))
      .map(tooth => [tooth.fdi, { matrix: tooth.worldMatrix, reveal: tooth.reveal }]));
  });
}

async function openStory(page) {
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__dentalExperience?.arch, null, { timeout: 90000 });
}

async function waitForOpening(page) {
  await page.locator('body[data-journey-handoff="cinematic"]').waitFor({ timeout: 90000 });
  assert.equal(await page.locator('#journey-canvas').isVisible(), true);
  assert.equal(await page.locator('#journey-title').isVisible(), false);
}

async function observeOpeningFrames(page) {
  await page.evaluate(() => {
    const canvas = document.querySelector('#journey-canvas');
    const frames = window.__openingFrames = [];
    const observer = new MutationObserver(() => {
      const app = window.__dentalExperience, state = app.report();
      if (!state.opening) { observer.disconnect(); return; }
      const teeth = [...app.arch.teeth.values()];
      const incisor = app.arch.teeth.get(11)?.mesh;
      frames.push({
        shot: state.opening, camera: app.rig.camera.position.toArray(), target: state.target, zoom: app.rig.camera.zoom,
        scroll: scrollY, progress: state.progress, at: performance.now(),
        crowns: teeth.filter(item => item.crown?.visible).length, crownMix: state.crownMix,
        roots: teeth.filter(item => item.mesh?.visible).map(item => item.entry.fdi),
        incisor: incisor?.matrixWorld.elements.slice(12, 15),
      });
    });
    observer.observe(canvas, { attributes: true, attributeFilter: ['data-frame-count'] });
  });
}

async function waitForWaitingTurn(page, direction) {
  return (await page.waitForFunction(direction => {
    const shot = window.__openingFrames.at(-1);
    const prior = window.__openingFrames.at(-2);
    if (shot?.shot.phase !== 'waiting' || prior?.shot.phase !== 'waiting') return false;
    const yaw = shot.shot.yaw;
    return yaw > .16 && yaw < .31 && Math.sign(yaw - prior.shot.yaw) === direction && shot;
  }, direction, { timeout: 25000 })).jsonValue();
}

function assertWaitingHandoff(frames) {
  const waiting = frames.filter(frame => frame.shot.phase === 'waiting');
  assert.ok(waiting.length >= 3);
  assert.ok(waiting.every(frame => frame.roots.length === 1 && frame.roots[0] === 36 && frame.crowns === 0));
  assert.ok(waiting.some(frame => difference(waiting[0].camera, frame.camera) > .2),
    'The actual view continues around the molar until the arch can depart');
  const firstFlight = frames.find(frame => frame.shot.phase === 'flight');
  assert.ok(firstFlight);
  const previous = waiting.at(-1);
  const axis = frame => frame.camera.map((x, i) => x - frame.target[i]);
  const a = axis(previous), b = axis(firstFlight);
  const dot = a.reduce((sum, n, i) => sum + n * b[i], 0) / (Math.hypot(...a) * Math.hypot(...b));
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
  assert.ok(angle < .15, 'Camera skipped ' + angle + ' radians between the waiting and flight draws');
  assert.ok(Math.abs(firstFlight.zoom - previous.zoom) < .02, 'The flight begins at the displayed scale');
  console.log('Last waiting yaw / first flight yaw:', previous.shot.yaw, firstFlight.shot.yaw);
}

function assertOpeningFlight(frames) {
  const first = frames[0];
  assert.deepEqual(first.roots, [36]);
  assert.equal(first.shot.growth, 0);
  const spinning = frames.filter(p => p.shot.phase === 'spin' && p.roots.length === 1 && p.roots[0] === 36);
  assert.ok(spinning.length >= 3, 'A real tooth is rendered through multiple poses of the unprompted turn');
  assert.ok(spinning.some(p => difference(p.camera, first.camera) > 1), 'The camera circles the first molar');
  const held = frames.find(p => p.shot.phase === 'waiting');
  assert.ok(held && held.zoom > first.zoom * 1.08, 'The tooth grows into the authored composition before waiting');
  assertWaitingHandoff(frames);
  const flight = frames.filter(p => p.shot.phase === 'flight' && p.crowns === 0 && p.roots.length === 28
    && p.shot.progress > flightStart && p.shot.progress < flightEnd);
  assert.ok(flight.length >= 3, 'Several rendered poses show all 28 rooted teeth in flight');
  assert.ok(flight.some(p => difference(p.incisor, flight[0].incisor) > .08), 'The rooted incisor moves through space');
  assert.ok(frames.every((p, i) => !i || p.shot.progress <= frames[i - 1].shot.progress + 1e-6),
    'The flight advances towards the seats without replaying the original turn');
  assert.ok(frames.some(p => p.crownMix > 0 && p.crownMix < 1 && p.roots.length && p.crowns),
    'Rendered frames blend the seated roots into the smile crowns');
  assert.ok(frames.every(p => p.scroll === 0 && p.progress === 0), 'The opening consumes no chapter scroll');
  console.log('Hands-free opening:', spinning.length, 'solo frames,', flight.length,
    'fully rooted flight frames,', Math.round(held.at - first.at), 'ms to the waiting pose.');
}

async function waitForLesson(page) {
  await page.locator('body[data-journey-loading]').waitFor({ state: 'hidden', timeout: 30000 });
}

async function watchCinematicOnLoad(page) {
  await page.addInitScript(() => {
    window.__sawCinematicOnLoad = false;
    const observer = new MutationObserver(() => {
      if (document.body?.dataset.journeyHandoff !== 'cinematic') return;
      window.__sawCinematicOnLoad = true;
      observer.disconnect();
    });
    observer.observe(document, { subtree: true, attributes: true, attributeFilter: ['data-journey-handoff'] });
  });
}

async function assertHeroAndFlight(page, gates) {
  const { hero, teaching, upper, crowns } = gates;
  await Promise.all([
    page.waitForRequest(request => geometry.hero.test(new URL(request.url()).pathname)),
    page.goto(url.href, { waitUntil: 'domcontentloaded' }),
  ]);
  const poster = page.locator('img.startup-tooth');
  await poster.waitFor();
  assert.equal(await poster.evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.equal(await page.locator('#journey-canvas').isVisible(), false);
  assert.equal(await page.locator('#journey-title').isVisible(), false);
  const sheet = page.locator('.startup-portrait.is-turning .startup-turn-window');
  await sheet.waitFor({ timeout: 30000 });
  const cell = await sheet.evaluate(el => getComputedStyle(el).backgroundPosition);
  await page.waitForFunction(cell => {
    const el = document.querySelector('.startup-portrait.is-turning .startup-turn-window');
    return el && getComputedStyle(el).backgroundPosition !== cell;
  }, cell);
  await observeOpeningFrames(page);
  hero.release();
  await waitForOpening(page);
  await page.waitForFunction(() => window.startupMeasurement?.firstPixels);
  const metrics = await page.evaluate(() => window.startupMeasurement);
  assert.ok(metrics.firstPixels.turning, 'The moving HTML cell transfers to WebGL when the primary molar arrives');
  assert.ok(metrics.buffer[0] >= 2 * 390, 'The first live frame resolves at twice CSS width');
  assertFirstDraw(metrics);
  console.log('First paint, 390×844:', JSON.stringify(metrics.firstPixels));

  await page.waitForFunction(() => window.__openingFrames.at(-1)?.shot.phase === 'waiting', null, { timeout: 30000 });
  const held = await page.evaluate(() => window.__openingFrames.at(-1));
  assert.equal(held.shot.growth, 1);
  assert.equal(held.shot.progress, STORY_TIMING.openingTooth);
  assert.deepEqual(held.roots, [36]);
  assert.equal(held.crowns, 0);
  assert.ok(teaching.held.length && upper.held.length && crowns.held.length);
  teaching.release();
  upper.release();
  await page.waitForFunction(() => window.__dentalExperience.report().readiness.flight, null, { timeout: 90000 });
  const waiting = await waitForWaitingTurn(page, 1);
  assert.equal(waiting.shot.phase, 'waiting', 'Ready rooted meshes alone cannot start the crown handover');
  assert.ok(difference(waiting.camera, held.camera) > .2, 'Downloading the next stage leaves the molar turning');
  assert.equal(waiting.zoom, held.zoom);
  crowns.release();
  await waitForLesson(page);
  assertOpeningFlight(await page.evaluate(() => window.__openingFrames));
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const difference = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));
let openingCamera;
try {
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  const hero = await holdAssets(mobile, geometry.hero);
  const teaching = await holdAssets(mobile, geometry.teaching);
  const upper = await holdAssets(mobile, geometry.upper);
  const crowns = await holdAssets(mobile, geometry.crowns);
  const site = await holdAssets(mobile, geometry.site);
  const errors = [];
  mobile.on('pageerror', error => errors.push(error.message));
  try {
    await mobile.addInitScript(observeStartup);
    await assertHeroAndFlight(mobile, { hero, teaching, upper, crowns });
    await atChapter(mobile, 'dentition');
    const first = await mobile.evaluate(readProgress);
    assert.equal(first.scrollY, 0, 'The settled arch starts at chapter one');
    assert.equal(first.assetsReady, false, 'The atlas opens independently of the teaching site');
    assert.equal(first.crownMix, 1);
    assert.equal(first.crowns, 28);
    assert.equal(first.roots, 0);
    openingCamera = first.camera;
    assert.equal(await mobile.locator('#journey-title').innerText(), 'Celý chrup.');
    assert.equal(await mobile.locator('#journey-step-number').innerText(), '01 / 07');

    const checkpoints = [.182, .216, .248, .280, .316, .348];
    const forward = new Map();
    for (const progress of checkpoints) forward.set(progress, await extractionPose(mobile, progress));
    const firstPose = forward.get(checkpoints[0]), lastPose = forward.get(checkpoints.at(-1));
    assert.ok(lastPose[36].matrix[13]-firstPose[36].matrix[13] > .6, 'The molar lifts above its neighbors before entering the cut');
    assert.ok(firstPose[31].reveal > .8 && lastPose[31].reveal === 0, 'The rest of the arch recedes from its seats');
    for (const current of forward.values()) for (const fdi of [31, 35, 37]) {
      assert.ok(difference(firstPose[fdi].matrix, current[fdi].matrix) < .00001,
      `FDI ${fdi} stays seated during the camera approach`);
    }

    for (const progress of checkpoints.toReversed()) {
      const reverse = await extractionPose(mobile, progress);
      const expected = forward.get(progress);
      assert.ok(difference(reverse[36].matrix, expected[36].matrix) < .025,
        'Reverse scroll reconstructs the teaching-tooth position at each checkpoint');
    }

    await nativeSeek(mobile, chapter('dentition').at);
    await atChapter(mobile, 'dentition');
    assert.equal((await mobile.evaluate(readProgress)).teeth.length, 28,
      'The opening smile and atlas work before the teaching site is ready');
    await mobile.locator('#journey-mobile-next').tap();
    await atChapter(mobile, 'assembly');
    const second = await mobile.evaluate(readProgress);
    assert.equal(await mobile.locator('#journey-step-number').innerText(), '02 / 07');
    assert.equal(second.teeth.length, 28, 'The second chapter identifies the tooth in the rooted arch');
    assert.equal(second.roots, 28);
    assert.equal(second.crowns, 0);
    await mobile.locator('#journey-mobile-next').tap();
    await atChapter(mobile, 'hero');
    assert.deepEqual((await mobile.evaluate(readProgress)).teeth, [36],
      'The lifted molar is the only visible tooth in the hero composition');
    await mobile.locator('#journey-mobile-next').tap();
    await atChapter(mobile, 'anatomy');
    await overshoot(mobile);
    const studyStop = await atLoadingStop(mobile, studyGate, 'anatomy');
    assert.ok(site.held.length, 'The anatomical chapter works before the measured teaching site is ready');
    site.release();
    await mobile.waitForFunction(() => window.__dentalExperience.report().assetsReady, null, { timeout: 90000 });
    await mobile.waitForTimeout(350);
    const afterSite = await mobile.evaluate(readProgress);
    assert.ok(Math.abs(afterSite.scrollY - studyStop.scrollY) <= 2,
      'Releasing the teaching site does not replay the native scroll');
    await mobile.locator('#journey-mobile-next').tap();
    await atChapter(mobile, 'space');
    const spaced = await mobile.evaluate(readProgress);
    assert.ok([35, 36, 37].every(fdi => spaced.teeth.includes(fdi)), 'All three teaching teeth render at the contact site');
    await mobile.locator('#journey-mobile-previous').tap();
    await atChapter(mobile, 'anatomy');
    assert.equal((await mobile.evaluate(readProgress)).shaderErrors, 0);
    assert.deepEqual(errors, []);
    console.log('390×844 Chrome: single rotating tooth, rooted flight, crown handover, independent gates and reversible chapter arrows.');
  } finally {
    hero.release();
    teaching.release();
    upper.release();
    crowns.release();
    site.release();
    await mobile.close();
  }

  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const delayed = await holdAssets(desktop, geometry.opening);
  try {
    await openStory(desktop);
    await waitForOpening(desktop);
    await observeOpeningFrames(desktop);
    await overshoot(desktop);
    const waiting = await desktop.evaluate(readProgress);
    assert.equal(waiting.scrollY, 0, 'A fling while the opening is loading is discarded');
    assert.equal(waiting.roots, 1);
    assert.ok(delayed.held.length, 'Desktop opening is waiting for a real held asset');
    await desktop.evaluate(() => {
      const samples = [];
      function observe() {
        const progress = window.__dentalExperience.report().renderProgress;
        if (samples.at(-1) !== progress) samples.push(progress);
        frame = requestAnimationFrame(observe);
      }
      let frame = requestAnimationFrame(observe);
      window.__finishFlightTrace = () => {
        cancelAnimationFrame(frame);
        delete window.__finishFlightTrace;
        return samples;
      };
    });
    await waitForWaitingTurn(desktop, -1);
    delayed.release();
    await desktop.waitForFunction(() => window.__dentalExperience.report().readiness.crowns, null, { timeout: 90000 });
    await waitForLesson(desktop);
    assertWaitingHandoff(await desktop.evaluate(() => window.__openingFrames));
    await atChapter(desktop, 'dentition');
    await desktop.locator('#journey-mobile-next').click();
    await atChapter(desktop, 'assembly');
    const trace = await desktop.evaluate(() => window.__finishFlightTrace());
    const [leadStart, leadEnd] = [STORY_TIMING.atlas[1], chapter('assembly').at];
    assert.ok(trace.filter(progress => progress > leadStart && progress < leadEnd).length >= 5,
      'Button navigation passes through intermediate positions while locating 36');
    await desktop.locator('#journey-mobile-previous').click();
    await atChapter(desktop, 'dentition');
    await nativeSeek(desktop, chapter('plaque').at);
    await atChapter(desktop, 'plaque');
    await watchCinematicOnLoad(desktop);
    await desktop.reload({ waitUntil: 'domcontentloaded' });
    await atChapter(desktop, 'plaque');
    await waitForLesson(desktop);
    assert.equal(await desktop.evaluate(() => window.__sawCinematicOnLoad), false,
      'Reloading returns to the lesson without replaying the cinematic');
    console.log('1440×900 Chrome: cold-load full arch, explicit next/previous and reload retention.');
  } finally {
    delayed.release();
    await desktop.close();
  }

  const skippable = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  try {
    await openStory(skippable);
    const skip = skippable.getByRole('button', { name: 'Preskočiť úvod' });
    await skip.waitFor({ state: 'visible', timeout: 90000 });
    assert.equal(await skippable.locator('#journey-title').isVisible(), false);
    await skip.tap();
    await waitForLesson(skippable);
    await atChapter(skippable, 'dentition');
    const scene = await skippable.evaluate(readProgress);
    assert.equal(scene.crowns, 28);
    assert.equal(scene.scrollY, 0);
    assert.ok(difference(scene.camera, openingCamera) < .00001, 'Skipping and watching use the same settled camera');
    assert.equal(await skip.count(), 0, 'The skip control is removed when the lesson begins');
    await skippable.reload({ waitUntil: 'domcontentloaded' });
    await skip.waitFor({ state: 'visible', timeout: 90000 });
    await skippable.keyboard.press('Escape');
    await waitForLesson(skippable);
    await atChapter(skippable, 'dentition');
  } finally {
    await skippable.close();
  }

  const reduced = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  try {
    await watchCinematicOnLoad(reduced);
    await openStory(reduced);
    await waitForLesson(reduced);
    await atChapter(reduced, 'dentition');
    assert.equal(await reduced.evaluate(() => window.__sawCinematicOnLoad), false);
    assert.equal((await reduced.evaluate(readProgress)).crowns, 28);
    console.log('Chrome: skip, Escape after reloading at the top, and reduced motion open the settled smile.');
  } finally {
    await reduced.close();
  }
} finally {
  await browser.close();
}
