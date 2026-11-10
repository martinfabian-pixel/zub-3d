// Pure narrative/clinical invariants, independent of renderer, DOM, and frame rate.
import assert from 'node:assert/strict';
import { DENTAL_CHAPTERS, DENTAL_STORY, STORY_TIMING, brushProgress } from '../src/experience/story-config.js';
import { getDentalChapter, sampleDentalStory, sampleNeighborEntrance, sampleReducedDentalStory } from '../src/experience/dental-story.js';
import { createStoryAnatomy } from '../src/experience/story-anatomy.js';

const eq = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`);
const ids = ['hero', 'assembly', 'dentition', 'anatomy', 'space', 'plaque', 'brush'];
const visual = s => [s.sceneProgress, s.neighborsReveal, s.gapFocus, s.lowerReveal, s.upperReveal,
  s.assemblyReveal, s.finaleReveal, s.assemblyCrownCoverage, s.finalCrownCoverage,
  s.plaqueDeposition, s.plaqueCoverage, s.cleaningProgress, { ...s.brushPose }];
const chapter = id => DENTAL_CHAPTERS.find(c => c.id === id);
const [neighborStart, neighborEnd] = DENTAL_STORY.neighbors;
const [flightStart, flightEnd] = STORY_TIMING.flight;
const [dissolveStart, dissolveEnd] = STORY_TIMING.assemblyCrowns;
const [returnStart, returnEnd] = STORY_TIMING.return;
const [finalDissolveStart, finalDissolveEnd] = STORY_TIMING.finalCrowns;
const [resultStart, resultEnd] = STORY_TIMING.result;
assert.deepEqual(DENTAL_CHAPTERS.map(c => c.id), ids);
assert.deepEqual(DENTAL_CHAPTERS.map(c => c.label), ['Zub', 'Skladanie', 'Chrup', 'Stavba zuba', 'Priestor', 'Povlak', 'Čistenie']);
for (const [i, c] of DENTAL_CHAPTERS.entries()) {
  assert.strictEqual(getDentalChapter(c.start), c);
  assert.strictEqual(getDentalChapter(c.at), c);
  if (i) assert.strictEqual(getDentalChapter(c.start - 1e-8), DENTAL_CHAPTERS[i - 1]);
  for (const fraction of [0, .01, .25, .75, .999999]) {
    const p = c.start + fraction * (c.end - c.start);
    const still = sampleReducedDentalStory(p);
    const staticAt = c.id === 'brush' && p >= resultStart
      ? p < resultEnd ? (resultStart + resultEnd) / 2 : 1 : c.reducedAt;
    assert.deepEqual(visual(still), visual(sampleDentalStory(staticAt)), `Stable reduced-motion ${c.id}`);
    assert.equal(still.chapterId, c.id);
    eq(still.progress, p, 'Raw navigation remains available in reduced motion');
  }
}
assert.equal(sampleDentalStory(-2).progress, 0);
assert.equal(sampleDentalStory(4).progress, 1);
assert.equal(sampleDentalStory(NaN).chapterId, 'hero');
assert.equal(getDentalChapter(1).id, 'brush');

// Inspect the actual sampled axial path independently of its keyframe table.
// A retained maximum here is a test oracle; the sampler itself has no history.
let previous = sampleDentalStory(0), maxReach = 0, forwards = 0, backwards = 0, direction = 0;
// Include each authored reversal even when the compressed working phase lands
// between evenly spaced test samples.
const samples = [...new Set([...Array.from({length:10000}, (_, i) => (i + 1) / 10000),
  ...DENTAL_STORY.brush.keys.map(([at]) => at)])].sort((a, b) => a - b);
for (const p of samples) {
  const s = sampleDentalStory(p);
  maxReach = Math.max(maxReach, s.brushPose.insertion);
  for (const k of ['neighborsReveal', 'lowerReveal', 'upperReveal', 'plaqueDeposition', 'plaqueCoverage',
    'cleaningProgress', 'brushVisibility', 'brushAlignment', 'brushInsertion', 'brushStroke',
    'assemblyReveal', 'finaleReveal', 'assemblyCrownCoverage', 'finalCrownCoverage']) {
    assert.ok(Number.isFinite(s[k]) && s[k] >= 0 && s[k] <= 1, `${k} is normalized`);
  }
  assert.ok(s.cleaningProgress >= previous.cleaningProgress);
  assert.ok(s.cleaningProgress <= maxReach + 1e-9, 'Removal front may not outrun previous physical contact');
  if (s.cleaningProgress > previous.cleaningProgress + 1e-10) {
    assert.ok(s.brushPose.visibility > .99 && s.brushPose.phase === 'stroke', 'Only actual engaged passes remove plaque');
    assert.ok(s.brushInsertion >= previous.brushInsertion, 'Partial backoffs cannot clear new area');
  }
  if (p <= brushProgress(.56)) assert.equal(s.cleaningProgress, 0);
  if (p < brushProgress(.68)) assert.ok(s.cleaningProgress < 1);
  if (p >= brushProgress(.68)) assert.equal(s.cleaningProgress, 1);
  if (p < brushProgress(.48) || p >= brushProgress(.72)) assert.equal(s.brushVisibility, 0);
  if (p <= flightStart || p >= STORY_TIMING.archRelease[1]) assert.equal(s.assemblyReveal, 0);
  if (p >= flightStart && p <= flightEnd) assert.equal(s.assemblyCrownCoverage, 0, 'Flight has no crowns');
  if (p < returnStart) assert.equal(s.finaleReveal, 0);
  if (p >= returnEnd) assert.equal(s.finaleReveal, 1, 'All teeth remain visible for the end hold');
  if (p < finalDissolveStart) assert.equal(s.finalCrownCoverage, 0);
  if (p >= finalDissolveEnd) assert.equal(s.finalCrownCoverage, 1);
  if (p > brushProgress(.56) && p <= brushProgress(.68)) {
    const delta = s.brushInsertion - previous.brushInsertion;
    const sign = Math.sign(delta);
    if (sign && sign !== direction) { if (sign > 0) forwards++; else backwards++; direction = sign; }
  }
  previous = s;
}
assert.deepEqual([forwards, backwards], [3, 2], 'Three forward passes, with two partial returns before complete withdrawal');

const assembly = sampleDentalStory((dissolveStart + dissolveEnd) / 2);
assert.ok(assembly.assemblyCrownCoverage > 0 && assembly.assemblyCrownCoverage < 1);
assert.equal(sampleDentalStory(chapter('dentition').at).assemblyCrownCoverage, 1);
const anatomy = sampleDentalStory(chapter('anatomy').at);
assert.equal(anatomy.chapter.title, 'Stavba zdravého zuba');
assert.equal(anatomy.cleaningProgress, 0);
assert.equal(anatomy.brushVisibility, 0);
assert.equal(anatomy.neighborsReveal, 0);
assert.equal(anatomy.plaqueDeposition, 0);
assert.equal(sampleNeighborEntrance(neighborStart, 0), 0, 'The local scene opens on the same single tooth');
const firstArrival = neighborStart + .1 * (neighborEnd - neighborStart);
assert.ok(sampleNeighborEntrance(firstArrival, 0) > 0 && sampleNeighborEntrance(firstArrival, 1) === 0,
  'The two neighboring teeth start their arrivals separately');
assert.equal(sampleNeighborEntrance(neighborEnd, 0), 1);
assert.equal(sampleNeighborEntrance(neighborEnd, 1), 1);
for (const order of [0, 1]) {
  const progress = [0, .1, .45, .8, 1].map(t => neighborStart + (neighborEnd - neighborStart) * t);
  const forward = progress.map(p => sampleNeighborEntrance(p, order));
  const backward = progress.slice().reverse().map(p => sampleNeighborEntrance(p, order)).reverse();
  assert.deepEqual(forward, backward, 'Neighbor placement has no animation history');
  assert.ok(forward.every((p, index) => index === 0 || p >= forward[index - 1]));
}
const space = sampleDentalStory(chapter('space').at);
assert.equal(space.chapterId, 'space');
assert.equal(space.neighborsReveal, 1);
assert.equal(space.gapFocus, 1);
assert.equal(space.plaqueDeposition, 0);
assert.equal(sampleDentalStory(chapter('brush').start).chapterId, 'brush');
const clean = sampleDentalStory((resultStart + resultEnd) / 2);
assert.equal(clean.plaqueCoverage, 0, 'Depicted reachable subset has been swept');
assert.equal(clean.plaqueDeposition, 1, 'Unreached spatial patches can remain; do not globally fade plaque');
const reducedPlaque = sampleReducedDentalStory(chapter('plaque').start), reducedAnatomy = sampleReducedDentalStory(chapter('anatomy').start);
assert.equal(reducedPlaque.plaqueDeposition, 1);
assert.equal(reducedAnatomy.sceneProgress, chapter('anatomy').reducedAt); assert.equal(reducedAnatomy.cleaningProgress, 0);
const reducedBrush = sampleReducedDentalStory(chapter('brush').start);
assert.equal(reducedBrush.brushVisibility, 1); assert.ok(reducedBrush.brushInsertion > .6);
assert.ok(reducedBrush.cleaningProgress > 0 && reducedBrush.cleaningProgress < 1);
assert.equal(sampleReducedDentalStory(1).finalCrownCoverage, 1);

// Reuse one output in deliberately discontinuous and reverse order. This catches
// retained brush poses/removal after a seek, including mode changes mid-story.
const fresh = Array.from({length: 501}, (_, i) => sampleDentalStory(i / 500));
const reusable = {}, pose = sampleDentalStory(1, reusable).brushPose;
for (const i of [...fresh.keys()].reverse().concat([8, 499, 120, 351, 310, 20, 340, 0])) {
  sampleReducedDentalStory((i + 137) % 501 / 500, reusable);
  assert.strictEqual(sampleDentalStory(i / 500, reusable), reusable);
  assert.strictEqual(reusable.brushPose, pose);
  assert.deepEqual(reusable, fresh[i], 'One absolute story position always reconstructs the same scene');
}

const anatomyController = createStoryAnatomy();
const atLayer = (progress, now = 0, reducedMotion = false) =>
  ({ ...anatomyController.update({ progress, now, reducedMotion }) });
const layers = [
  [STORY_TIMING.anatomy.enamel[0], 'whole', 0],
  [STORY_TIMING.anatomy.enamel[1], 'enamel', 1],
  [STORY_TIMING.anatomy.dentin[1], 'dentin', 2],
  [STORY_TIMING.anatomy.pulp[1], 'pulp', 3],
];
const forwardLayers = layers.map(([at, layer, amount]) => {
  const state = atLayer(at);
  assert.equal(state.layer, layer);
  assert.equal(state.amount, amount);
  assert.equal(state.cut > 0, amount > 0);
  return state;
});
assert.deepEqual(layers.toReversed().map(([at]) => atLayer(at)).reverse(), forwardLayers,
  'The anatomy section is identical in reverse');
const closingAt = (STORY_TIMING.anatomy.close[0] + STORY_TIMING.anatomy.close[1]) / 2;
assert.ok(atLayer(closingAt).cut > 0 && atLayer(closingAt).cut < 1, 'The cut closes before the contact demonstration');
assert.equal(atLayer(STORY_TIMING.anatomy.close[1]).cut, 0);
atLayer(chapter('anatomy').at);
anatomyController.select('enamel', 100);
const midBlend = atLayer(chapter('anatomy').at, 330);
assert.ok(midBlend.moving && midBlend.manual && midBlend.amount > 1 && midBlend.amount < 3);
assert.equal(atLayer(chapter('anatomy').at, 800).amount, 1);
anatomyController.follow(801);
assert.equal(atLayer(chapter('anatomy').at, 801, true).amount, 3);
assert.equal(atLayer(chapter('space').at, 802).manual, false);

console.log('Dental story: seven chapters, independent opening and closing smiles, anatomy layers and reverse/jump checks passed.');
