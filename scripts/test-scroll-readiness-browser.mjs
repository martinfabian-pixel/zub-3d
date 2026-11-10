import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { flightEnd, flightStart } from '../src/experience/floating-teeth.js';
import { DENTAL_CHAPTERS } from '../src/experience/story-config.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const url = new URL(process.env.DENTAL_STORY_TEST_URL || 'http://127.0.0.1:4173/');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Use a local Vite server');
url.searchParams.set('qa', '1');

const chapter = id => DENTAL_CHAPTERS.find(step => step.id === id);
const geometry = {
  teaching: /\/dentition-assets\/dentition(?:-mobile)?\.glb$/,
  upper: /\/prototype-assets\/molar(?:-mobile)?\.glb$/,
  crowns: /\/dentition-assets\/crowns\.glb$/,
  site: /\/story-assets\/site\.json$/,
  opening: /\/dentition-assets\/crowns\.glb$|\/prototype-assets\/molar(?:-mobile)?\.glb$/,
};
const stops = {
  opening: 0,
  study: chapter('space').start - .001,
};
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

async function flightPose(page, at) {
  await nativeSeek(page, at);
  await page.waitForFunction(({ at, epsilon }) => {
    const state = window.__dentalExperience.report();
    return Math.abs(state.progress - at) < epsilon
      && Math.abs(state.renderProgress - state.storyProgress) < .00003;
  }, { at, epsilon: targetEpsilon });
  return page.evaluate(() => {
    const state = window.__dentalExperience.report();
    return state.teeth.filter(tooth => [35, 36, 37].includes(tooth.fdi))
      .flatMap(tooth => tooth.worldMatrix.slice(12, 15));
  });
}

async function openStory(page) {
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__dentalExperience?.arch, null, { timeout: 90000 });
}

async function assertLoadingOpening(page) {
  const state = await atLoadingStop(page, stops.opening, 'dentition');
  assert.equal(await page.locator('#journey-startup').isVisible(), true);
  assert.equal(await page.locator('#journey-title').isVisible(), false,
    'The loading cover conceals the first scene until it has its 28 crowns');
  assert.equal(await page.locator('#journey-canvas').isVisible(), false,
    'The isolated loader tooth never flashes in the actual chapter canvas');
  assert.equal(state.assetsReady, false);
  return state;
}

async function watchOpeningFrames(page) {
  await page.evaluate(() => {
    const app = window.__dentalExperience;
    const canvas = document.querySelector('#journey-canvas');
    const title = document.querySelector('#journey-title');
    const frames = [];
    let previousFrame = null;

    function observe(now) {
      const frameCount = canvas.dataset.frameCount;
      const visible = element => getComputedStyle(element).visibility === 'visible';
      const lessonVisible = visible(title);
      if (visible(canvas) && frameCount && (frameCount !== previousFrame || lessonVisible)) {
        previousFrame = frameCount;
        const state = app.report();
        const teeth = [...app.arch.teeth.values()];
        const position = app.rig.camera.position.toArray();
        const target = state.target;
        const frame = {
          now,
          chapter: state.story.chapterId,
          progress: state.progress,
          sceneProgress: state.opening?.progress ?? state.story.sceneProgress,
          openingPhase: state.opening?.phase,
          openingYaw: state.opening?.yaw,
          limit: state.readiness.limit,
          crowns: teeth.filter(item => item.crown?.visible).length,
          roots: teeth.filter(item => item.mesh?.visible).map(item => item.entry.fdi),
          crownMix: state.crownMix,
          yaw: Math.atan2(position[0] - target[0], position[2] - target[2]),
          toothPosition: app.arch.teeth.get(11).mesh.matrixWorld.elements.slice(12, 15),
          scroll: scrollY,
        };
        if (lessonVisible) {
          window.__openingTrace = { frames, firstLesson: frame };
          return;
        }
        frames.push(frame);
      }
      requestAnimationFrame(observe);
    }
    requestAnimationFrame(observe);
  });
}

async function openingTrace(page) {
  const result = await page.waitForFunction(() => window.__openingTrace);
  return result.jsonValue();
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

function assertOpeningFlight({ frames, firstLesson }) {
  assert.equal(firstLesson.chapter, 'dentition');
  assert.equal(firstLesson.crowns, 28);
  assert.deepEqual(firstLesson.roots, [], 'The first numbered lesson opens on the settled crown-only smile');
  assert.equal(firstLesson.scroll, 0);
  const solo = frames.filter(frame => frame.crowns === 0 && frame.roots.length === 1 && frame.roots[0] === 36);
  assert.ok(solo.length >= 3, 'Multiple actual rendered intro frames show only FDI 36');
  const initialYaw = solo[0].yaw;
  assert.ok(solo.some(({ yaw }) => Math.abs(Math.atan2(Math.sin(yaw - initialYaw), Math.cos(yaw - initialYaw))) > .7),
    'The single tooth rotates visibly in the live 3D view: ' + JSON.stringify(
      solo.map(({ now, openingPhase, openingYaw, yaw }) => ({ now, openingPhase, openingYaw, yaw }))));
  const flight = frames.filter(frame => frame.crowns === 0 && frame.roots.includes(11)
    && frame.roots.length >= 8 && frame.sceneProgress > flightStart && frame.sceneProgress < flightEnd);
  assert.ok(flight.length >= 3, 'The intro shows multiple rendered rooted flight poses before crown handover');
  assert.ok(flight.some(frame => Math.hypot(...frame.toothPosition.map((value, index) => value - flight[0].toothPosition[index])) > .08),
    'An actual rooted mesh flies through space');
  assert.ok(flight.every((frame, index) => !index || frame.sceneProgress <= flight[index - 1].sceneProgress + .00001),
    'The opening assembles the same flight in the opposite direction from chapter two');
  assert.ok(frames.some(frame => frame.crownMix > 0 && frame.crownMix < 1 && frame.roots.length && frame.crowns),
    'Rendered frames show the crown handover after rooted flight');
  assert.ok(frames.every(frame => frame.scroll === 0 && frame.progress === 0), 'The intro leaves native scroll at the top');
  assert.ok(frames.filter(frame => frame.crownMix < 1).every(frame => frame.limit === 0),
    'Scroll stays locked until the arch settles');
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  const teaching = await holdAssets(mobile, geometry.teaching);
  const upper = await holdAssets(mobile, geometry.upper);
  const crowns = await holdAssets(mobile, geometry.crowns);
  const site = await holdAssets(mobile, geometry.site);
  const errors = [];
  mobile.on('pageerror', error => errors.push(error.message));
  try {
    await openStory(mobile);
    const boot = await assertLoadingOpening(mobile);
    await overshoot(mobile);
    await assertLoadingOpening(mobile);
    assert.ok(teaching.held.length, 'The neighbor atlas is still waiting on the network');
    teaching.release();
    await mobile.waitForTimeout(350);
    const afterTeaching = await assertLoadingOpening(mobile);
    assert.ok(Math.abs(afterTeaching.scrollY - boot.scrollY) <= 2,
      'Releasing the neighbor asset does not replay discarded native scroll');
    assert.ok(upper.held.length, 'The flight gate waits for the second rooted source');
    upper.release();
    await mobile.waitForFunction(() => window.__dentalExperience.report().readiness.flight, null, { timeout: 90000 });
    await overshoot(mobile);
    const afterUpper = await assertLoadingOpening(mobile);
    assert.ok(Math.abs(afterUpper.scrollY - boot.scrollY) <= 2,
      'Rooted meshes alone do not reveal chapter one or let the scroll leave the top');

    assert.ok(crowns.held.length, 'The opening atlas is waiting for real crown data');
    await watchOpeningFrames(mobile);
    crowns.release();
    await waitForLesson(mobile);
    assertOpeningFlight(await openingTrace(mobile));
    await atChapter(mobile, 'dentition');
    const first = await mobile.evaluate(readProgress);
    assert.ok(Math.abs(first.scrollY - boot.scrollY) <= 2, 'No native overshoot is replayed on reveal');
    assert.equal(first.assetsReady, false, 'The atlas opens independently of the teaching site');
    assert.equal(first.crownMix, 1);
    assert.equal(first.crowns, 28);
    assert.equal(first.roots, 0);
    assert.equal(await mobile.locator('#journey-title').innerText(), 'Celý chrup.');
    assert.equal(await mobile.locator('#journey-step-number').innerText(), '01 / 07');

    const checkpoints = [.18, .38, .60, .80, .94].map(fraction => flightStart + fraction * (flightEnd - flightStart));
    const forward = new Map();
    for (const progress of checkpoints) forward.set(progress, await flightPose(mobile, progress));
    for (let index = 1; index < checkpoints.length; index++) {
      const previous = forward.get(checkpoints[index - 1]);
      const current = forward.get(checkpoints[index]);
      assert.ok(Math.hypot(...current.map((value, axis) => value - previous[axis])) > .08,
        'Each scroll checkpoint moves at least one tooth through the flight');
    }

    for (const progress of checkpoints.toReversed()) {
      const reverse = await flightPose(mobile, progress);
      const expected = forward.get(progress);
      assert.ok(Math.hypot(...reverse.map((value, axis) => value - expected[axis])) < .025,
        'Reverse scroll reconstructs the same authored flight at each checkpoint');
    }

    await nativeSeek(mobile, chapter('dentition').at);
    await atChapter(mobile, 'dentition');
    assert.equal((await mobile.evaluate(readProgress)).teeth.length, 28,
      'The opening smile and atlas work before the teaching site is ready');
    await mobile.locator('#journey-mobile-next').tap();
    await atChapter(mobile, 'assembly');
    const second = await mobile.evaluate(readProgress);
    assert.equal(await mobile.locator('#journey-step-number').innerText(), '02 / 07');
    assert.deepEqual(second.teeth, [36], 'The second chapter lands on the visible single tooth');
    assert.equal(second.roots, 1);
    assert.equal(second.crowns, 0);
    await mobile.locator('#journey-mobile-next').tap();
    await atChapter(mobile, 'hero');
    assert.deepEqual((await mobile.evaluate(readProgress)).teeth, [36],
      'The isolated tooth is chapter three, between the atlas and anatomical layers');
    await mobile.locator('#journey-mobile-next').tap();
    await atChapter(mobile, 'anatomy');
    await overshoot(mobile);
    const studyStop = await atLoadingStop(mobile, stops.study, 'anatomy');
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
    await assertLoadingOpening(desktop);
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
    delayed.release();
    await waitForLesson(desktop);
    await atChapter(desktop, 'dentition');
    await desktop.locator('#journey-mobile-next').click();
    await atChapter(desktop, 'assembly');
    const trace = await desktop.evaluate(() => window.__finishFlightTrace());
    assert.ok(trace.filter(progress => progress > flightStart && progress < flightEnd).length >= 5,
      'Button navigation passes through intermediate flight poses');
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

  const skippable = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
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
