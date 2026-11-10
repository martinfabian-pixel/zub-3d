// Pure narrative/clinical invariants, independent of renderer, DOM, and frame rate.
import assert from 'node:assert/strict';
import { DENTAL_CHAPTERS } from '../src/experience/story-config.js';
import { getDentalChapter, sampleDentalStory, sampleReducedDentalStory } from '../src/experience/dental-story.js';

const eq = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`);
const ids = ['hero', 'space', 'plaque', 'anatomy', 'brush', 'result', 'dentition'];
const visual = s => [s.sceneProgress, s.neighborsReveal, s.gapFocus, s.lowerReveal, s.upperReveal,
  s.plaqueDeposition, s.plaqueCoverage, s.cleaningProgress, { ...s.brushPose }];
assert.deepEqual(DENTAL_CHAPTERS.map(c => c.id), ids);
assert.deepEqual(DENTAL_CHAPTERS.map(c => c.label), ['Zub', 'Priestor', 'Povlak', 'Stavba zuba', 'Čistenie', 'Výsledok', 'Chrup']);
for (const [i, c] of DENTAL_CHAPTERS.entries()) {
  assert.strictEqual(getDentalChapter(c.start), c);
  assert.strictEqual(getDentalChapter(c.at), c);
  if (i) assert.strictEqual(getDentalChapter(c.start - 1e-8), DENTAL_CHAPTERS[i - 1]);
  for (const fraction of [0, .01, .25, .75, .999999]) {
    const p = c.start + fraction * (c.end - c.start);
    const still = sampleReducedDentalStory(p);
    assert.deepEqual(visual(still), visual(sampleDentalStory(c.reducedAt)), `Stable reduced-motion ${c.id}`);
    assert.equal(still.chapterId, c.id);
    eq(still.progress, p, 'Raw navigation remains available in reduced motion');
  }
}
assert.equal(sampleDentalStory(-2).progress, 0);
assert.equal(sampleDentalStory(4).progress, 1);
assert.equal(sampleDentalStory(NaN).chapterId, 'hero');
assert.equal(getDentalChapter(1).id, 'dentition');

// Inspect the actual sampled axial path independently of its keyframe table.
// A retained maximum here is a test oracle; the sampler itself has no history.
let previous = sampleDentalStory(0), maxReach = 0, forwards = 0, backwards = 0, direction = 0;
for (let i = 1; i <= 10000; ++i) {
  const p = i / 10000, s = sampleDentalStory(p);
  maxReach = Math.max(maxReach, s.brushPose.insertion);
  for (const k of ['neighborsReveal', 'lowerReveal', 'upperReveal', 'plaqueDeposition', 'plaqueCoverage',
    'cleaningProgress', 'brushVisibility', 'brushAlignment', 'brushInsertion', 'brushStroke']) {
    assert.ok(Number.isFinite(s[k]) && s[k] >= 0 && s[k] <= 1, `${k} is normalized`);
  }
  assert.ok(s.cleaningProgress >= previous.cleaningProgress);
  assert.ok(s.cleaningProgress <= maxReach + 1e-9, 'Removal front may not outrun previous physical contact');
  if (s.cleaningProgress > previous.cleaningProgress + 1e-10) {
    assert.ok(s.brushPose.visibility > .99 && s.brushPose.phase === 'stroke', 'Only actual engaged passes remove plaque');
    assert.ok(s.brushInsertion >= previous.brushInsertion, 'Partial backoffs cannot clear new area');
  }
  if (p <= .56) assert.equal(s.cleaningProgress, 0);
  if (p < .68) assert.ok(s.cleaningProgress < 1);
  if (p >= .68) assert.equal(s.cleaningProgress, 1);
  if (p < .48 || p >= .72) assert.equal(s.brushVisibility, 0);
  if (p <= .80) assert.equal(s.lowerReveal + s.upperReveal, 0);
  if (s.upperReveal > 0) assert.equal(s.lowerReveal, 1);
  if (p >= .96) assert.equal(s.upperReveal, 1, 'All teeth remain visible for the end hold');
  if (p > .56 && p <= .68) {
    const delta = s.brushInsertion - previous.brushInsertion;
    const sign = Math.sign(delta);
    if (sign && sign !== direction) { if (sign > 0) forwards++; else backwards++; direction = sign; }
  }
  previous = s;
}
assert.deepEqual([forwards, backwards], [3, 2], 'Three forward passes, with two partial returns before complete withdrawal');

const anatomy = sampleDentalStory(.475);
assert.equal(anatomy.chapter.title, 'Stavba zdravého zuba');
assert.equal(anatomy.cleaningProgress, 0);
assert.equal(anatomy.brushVisibility, 0);
assert.equal(sampleDentalStory(.48).chapterId, 'brush');
const clean = sampleDentalStory(.76);
assert.equal(clean.plaqueCoverage, 0, 'Depicted reachable subset has been swept');
assert.equal(clean.plaqueDeposition, 1, 'Unreached spatial patches can remain; do not globally fade plaque');
const reducedPlaque = sampleReducedDentalStory(.23), reducedAnatomy = sampleReducedDentalStory(.35);
assert.equal(reducedPlaque.plaqueDeposition, 1);
assert.equal(reducedAnatomy.sceneProgress, .475); assert.equal(reducedAnatomy.cleaningProgress, 0);
const reducedBrush = sampleReducedDentalStory(.49);
assert.equal(reducedBrush.brushVisibility, 1); assert.ok(reducedBrush.brushInsertion > .6);
assert.ok(reducedBrush.cleaningProgress > 0 && reducedBrush.cleaningProgress < 1);
assert.equal(sampleReducedDentalStory(.81).upperReveal, 1);

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
console.log('Dental story: 7 static reduced-motion chapters, 10,001 trajectory samples, healthy anatomy, spatial cleaning-front bounds and reverse/jump checks passed.');
