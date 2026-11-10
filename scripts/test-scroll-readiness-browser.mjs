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
  roots: flightStart,
  crowns: flightEnd,
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
  await page.waitForFunction(() => window.__dentalExperience?.report().ready, null, { timeout: 90000 });
  await page.locator('#journey-startup').waitFor({ state: 'hidden', timeout: 15000 });
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
    const boot = await mobile.evaluate(readProgress);
    assert.deepEqual(boot.teeth, [36], 'The hero renders while every deferred asset is held');
    assert.equal(boot.assetsReady, false);

    // These native writes model consecutive wheel/inertia updates. Test the
    // physical document position as well as the rendered story progress.
    await overshoot(mobile);
    const rootedStop = await atLoadingStop(mobile, stops.roots, 'assembly');
    assert.ok(teaching.held.length, 'The neighbor atlas is still waiting on the network');
    teaching.release();
    await mobile.waitForTimeout(350);
    const afterTeaching = await mobile.evaluate(readProgress);
    assert.ok(Math.abs(afterTeaching.scrollY - rootedStop.scrollY) <= 2,
      'Releasing the neighbor asset does not replay discarded native scroll');
    assert.ok(upper.held.length, 'The flight gate waits for the second rooted source');
    upper.release();
    await mobile.waitForFunction(() => window.__dentalExperience.report().readiness.flight, null, { timeout: 90000 });
    await mobile.waitForTimeout(350);
    const afterUpper = await mobile.evaluate(readProgress);
    assert.ok(Math.abs(afterUpper.scrollY - rootedStop.scrollY) <= 2,
      'Releasing the full arch leaves native scroll at the loading stop');
    assert.equal(afterUpper.chapter, 'assembly');
    assert.equal(afterUpper.assetsReady, false);

    const checkpoints = [.18, .38, .60, .80, .94].map(fraction => flightStart + fraction * (flightEnd - flightStart));
    const forward = new Map();
    for (const progress of checkpoints) forward.set(progress, await flightPose(mobile, progress));
    for (let index = 1; index < checkpoints.length; index++) {
      const previous = forward.get(checkpoints[index - 1]);
      const current = forward.get(checkpoints[index]);
      assert.ok(Math.hypot(...current.map((value, axis) => value - previous[axis])) > .08,
        'Each scroll checkpoint moves at least one tooth through the flight');
    }

    await overshoot(mobile);
    const crownStop = await atLoadingStop(mobile, stops.crowns, 'assembly');
    assert.ok(crowns.held.length, 'The tooth flight runs before the final crowns are ready');
    crowns.release();
    await mobile.waitForFunction(() => window.__dentalExperience.report().readiness.crowns, null, { timeout: 90000 });
    await mobile.waitForTimeout(350);
    const afterCrowns = await mobile.evaluate(readProgress);
    assert.ok(Math.abs(afterCrowns.scrollY - crownStop.scrollY) <= 2,
      'Releasing the crowns does not replay the native scroll');
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
    console.log('390×844 Chrome: independent asset stops, no scroll replay, reversible flight checkpoints and chapter arrows.');
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
    await desktop.locator('.journey-step').nth(DENTAL_CHAPTERS.findIndex(item => item.id === 'dentition')).click();
    await atLoadingStop(desktop, stops.roots, 'assembly');
    assert.ok(delayed.held.length, 'The atlas click is waiting for a real held asset');
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
    await atChapter(desktop, 'dentition');
    const trace = await desktop.evaluate(() => window.__finishFlightTrace());
    assert.ok(trace.filter(progress => progress > flightStart && progress < flightEnd).length >= 5,
      'Resumed button navigation passes through intermediate flight poses');
    await desktop.locator('#journey-mobile-previous').click();
    await atChapter(desktop, 'assembly');
    await nativeSeek(desktop, chapter('plaque').at);
    await atChapter(desktop, 'plaque');
    await desktop.reload({ waitUntil: 'domcontentloaded' });
    await atChapter(desktop, 'plaque');
    console.log('1440×900 Chrome: an explicit next request resumes after its assets arrive, then returns via the previous arrow.');
  } finally {
    delayed.release();
    await desktop.close();
  }
} finally {
  await browser.close();
}
