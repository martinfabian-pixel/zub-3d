import assert from 'node:assert/strict';
import { createOpeningFlight, OPENING_TURN_END } from '../src/experience/opening-flight.js';
import { sampleDentalStory, sampleOpeningDentalStory } from '../src/experience/dental-story.js';
import { floatingAmount } from '../src/experience/floating-teeth.js';
import { STORY_TIMING } from '../src/experience/story-config.js';

const intro = createOpeningFlight();
const seed = STORY_TIMING.openingTooth;
const [atlasStart, atlasEnd] = STORY_TIMING.atlas;
const first = intro.sample(0);
assert.deepEqual(first, { progress: seed, yaw: 0, growth: 0, phase: 'spin', done: false });
assert.equal(sampleOpeningDentalStory(first.progress).assemblyReveal, 0);

const halfway = { ...intro.sample(OPENING_TURN_END / 2) };
assert.equal(halfway.progress, seed);
assert.equal(halfway.yaw, Math.PI);
assert.ok(halfway.growth > 0 && halfway.growth < 1);
const beforeLaunch = { ...intro.sample(OPENING_TURN_END - .0001) };
const launch = intro.sample(OPENING_TURN_END);
assert.equal(launch, first, 'Samples reuse the same frame record');
assert.equal(launch.phase, 'flight');
assert.equal(launch.progress, seed);
assert.equal(launch.growth, 1);
assert.ok(1 - beforeLaunch.growth < .00001);
assert.ok(Math.abs(Math.sin(beforeLaunch.yaw) - Math.sin(launch.yaw)) < .00001);

let previous = seed, sawFlight = false, sawCrowns = false;
for (let i = 1; i < 1000; i++) {
  const shot = intro.sample(OPENING_TURN_END + (1 - OPENING_TURN_END) * i / 1000);
  assert.ok(shot.progress <= previous && previous - shot.progress < .001);
  const scene = sampleOpeningDentalStory(shot.progress);
  assert.equal(scene.openingFlight, true);
  assert.equal(scene.toothExtraction, 0);
  assert.equal(scene.locate36, 0);
  if (floatingAmount(shot.progress) > .5) {
    assert.equal(scene.assemblyCrownCoverage, 0, 'Teeth in flight retain their roots');
    sawFlight = true;
  }
  if (scene.assemblyCrownCoverage > .1) {
    assert.ok(sawFlight, 'Crowns appear only after the rooted flight');
    sawCrowns = true;
  }
  previous = shot.progress;
}
assert.ok(sawFlight && sawCrowns);
assert.ok(Math.abs(previous - atlasEnd) < .000001);
const end = intro.sample(1);
assert.deepEqual(end, { progress: atlasStart, yaw: 0, growth: 1, phase: 'done', done: true });
const assembled = sampleOpeningDentalStory(end.progress);
const skipped = sampleDentalStory(end.progress);
for (const key of ['sceneProgress', 'assemblyReveal', 'neighborsReveal', 'assemblyCrownCoverage', 'toothExtraction', 'locate36'])
  assert.equal(assembled[key], skipped[key], 'Natural seating and Skip agree on ' + key);
assert.equal(assembled.assemblyCrownCoverage, 1);

// Returning to any scroll position reproduces the same pose, including after
// a pause or a jump across an entire phase between rendered frames.
for (const amount of [.84, .32, .12, 0, .75, .41, .41, .99, 1]) {
  const reference = { ...createOpeningFlight().sample(amount) };
  assert.deepEqual(intro.sample(amount), reference);
  assert.deepEqual(intro.sample(amount), reference);
}
console.log('Scroll-held tooth, reversible rooted flight, continuous launch and crown seating passed.');
