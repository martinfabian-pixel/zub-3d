import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Box3, Vector3, MathUtils } from 'three';
import { experienceConfig } from '../src/experience/config.js';
import { createOpeningCameraOptions, createStoryCameraConfig } from '../src/experience/story-camera.js';
import { createTimeline } from '../src/experience/timeline.js';
import { createJourneyCamera } from '../src/experience/camera.js';
import { createCleaningPath } from '../src/experience/cleaning-path.js';
import { sampleDentalStory, sampleReducedDentalStory } from '../src/experience/dental-story.js';
import { DENTAL_CHAPTERS, STORY_TIMING, brushProgress } from '../src/experience/story-config.js';

// Real measured proximal site with small mock landmark boxes. The browser tests
// independently check actual tooth occlusion and the visible camera framing.
const site = JSON.parse(readFileSync(new URL('../public/story-assets/site.json', import.meta.url)));
const chapterAt = id => DENTAL_CHAPTERS.find(chapter => chapter.id === id).at;
const region = (center, size) => new Box3().setFromCenterAndSize(new Vector3(...center), new Vector3(...size));
const landmarks = {
  hero: region([2.86, -.68, -.63], [1.4, 2.1, 1.4]),
  neighbors: region([2.7, -.68, -1], [2.5, 2.1, 2.3]),
  arch: region([0, -1, 0], [6.5, 2.5, 4.5]),
  full: region([0, 0, 0], [6.5, 4.5, 4.5]),
  flight: region([0, 0, 0], [6.5, 4.5, 4.5]),
  smile: region([0, 0, 0], [6.5, 2, 4]),
};

function yaw(pose) {
  const offset = pose.position.clone().sub(pose.target);
  return Math.atan2(offset.x, offset.z);
}
function angleDifference(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
function close(a, b, tolerance, message) {
  assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`);
}

for (const compact of [false, true]) {
  const aspect = compact ? 390 / 844 : 1440 / 900;
  const composed = createStoryCameraConfig(site, experienceConfig, { compact });
  const cameraOptions = composed.camera;
  const allLandmarks = { ...landmarks, ...composed.landmarks };
  const timeline = createTimeline({ landmarks: allLandmarks, cameraOptions });
  const openingOptions = createOpeningCameraOptions(experienceConfig, { compact });
  const opening = createTimeline({ landmarks, cameraOptions: openingOptions });
  const baselineOptions = { ...cameraOptions, keyframes: cameraOptions.keyframes.filter(frame => !frame.key.startsWith('brush-orbit-')) };
  const baseline = createTimeline({ landmarks: allLandmarks, cameraOptions: baselineOptions });
  const sample = progress => timeline.sample(progress, aspect);
  const atlas = sample(chapterAt('dentition'));
  const hero = sample(chapterAt('hero')), anatomy = sample(chapterAt('anatomy'));
  assert.ok(atlas.target.distanceTo(hero.target) > 2, 'The camera leaves the full arch to frame the molar in its seat');
  assert.ok(atlas.target.distanceTo(sample(0).target) < 1e-8, 'The first settled screen frames the full arch');
  assert.ok(openingOptions.keyframes.some(frame=>frame.key==='flight-arc') &&
    !cameraOptions.keyframes.some(frame=>frame.key==='flight-arc'), 'Only the introductory camera follows the flight');
  for (const [camera, progress] of [[opening, 0], [timeline, 1]]) {
    const settled = camera.sample(progress, aspect);
    assert.ok(atlas.target.distanceTo(settled.target) < 1e-8 && atlas.position.distanceTo(settled.position) < 1e-8,
      'Completing or skipping the introduction and the closing smile all use the same camera');
  }
  const locate = sample(chapterAt('assembly'));
  const {identify,identified,openWindow}=STORY_TIMING.teachingSite;
  assert.ok(yaw(locate) - yaw(atlas) > .65, 'The camera turns towards the patient’s left');
  assert.ok(sample(identify[1]).position.distanceTo(sample(identified[0]).position)<1e-8,
    'The identifying label has a stationary hold before the macro move');
  const apparentScale=pose=>pose.opticalZoom/pose.position.distanceTo(pose.target);
  const relativeScale=apparentScale(locate)/apparentScale(atlas);
  assert.ok(relativeScale>.72 && relativeScale<1.28,
    'The turn holds a wide contextual scale while the molar is identified');
  assert.ok(apparentScale(hero)>apparentScale(locate)*1.25,
    'The camera moves into the root window after the identification hold');
  assert.ok(hero.target.distanceTo(landmarks.hero.getCenter(new Vector3()))<.22,
    'The root window is aimed at the anatomical seat');
  assert.ok(Math.abs(angleDifference(yaw(anatomy), yaw(hero))) < .15,
    'The open root window and the section face the same observer');
  assert.notDeepEqual([anatomy.screenX, anatomy.screenY, anatomy.opticalZoom],
    [hero.screenX, hero.screenY, hero.opticalZoom], 'Anatomy eases into a distinct composition');
  close(sample(1).opticalZoom, compact ? .325 : .87, 1e-7, 'The final smile retains its own framing');
  const nearBoundary = 1e-6;
  for (const { start: boundary } of DENTAL_CHAPTERS.slice(1)) {
    for (const key of ['position', 'target']) {
      assert.ok(sample(boundary - nearBoundary)[key].distanceTo(sample(boundary + nearBoundary)[key]) < .002,
        `Camera ${key} stays continuous across chapter boundary ${boundary}`);
    }
  }
  const [start, side, hold, returned] = [.62, .667, .676, .72].map(brushProgress).map(sample);
  const contact=sample(chapterAt('space')).target;
  const row=site.brush.centerline.find(point=>new Vector3(...point.position).distanceTo(contact)<1e-6);
  assert.ok(row,'The camera arrives on the measured brush centerline');
  const contacts=compact?row.contactsMobile:row.contacts;
  assert.ok([36,37].every(fdi=>contacts.some(wall=>wall.fdi===fdi &&
    wall.distanceMm<=site.brush.dimensionsMm.bristleRadius)), 'The landmark has bilateral bristle contact');
  assert.ok(start.target.distanceTo(contact)<1e-8 && side.target.distanceTo(contact)<1e-8,
    'The working head and incoming surface approach share one physical focus');
  if(compact){
    const path=createCleaningPath(site), rig=createJourneyCamera({timeline});
    rig.resize(390,844);
    const at=brushProgress(.62), state=sampleDentalStory(at);
    rig.setProgress(at);
    const tip=path.tipArcMm(state.brushInsertion,state.brushAlignment);
    const project=arc=>path.sample(arc).position.project(rig.camera);
    const ferrule=project(tip-path.dimensions.ferruleBackMm);
    const front=project(tip-path.dimensions.tipMarginMm);
    const back=project(tip-path.dimensions.tipMarginMm-path.dimensions.bristledLengthMm);
    for(const p of [ferrule,front,back]) {
      assert.ok(Math.abs(p.x)<.96 && Math.abs(p.y)<.76,'The mobile camera includes the ferrule nose and both ends of the working head');
    }
    assert.ok(Math.hypot((back.x-front.x)*195,(back.y-front.y)*422)>65,
      'The working head remains readable at 390 CSS pixels');
    rig.dispose();
  }

  const settings=compact?experienceConfig.storyCamera.compact:experienceConfig.storyCamera;
  const expectedYaw = MathUtils.degToRad(settings.brushSweepYawDegrees);
  close(angleDifference(yaw(side), yaw(start)), expectedYaw, 1e-7, 'Camera follows the authored side angle');
  close(angleDifference(yaw(hold), yaw(side)), 0, 1e-7, 'Side view holds steady');
  close(angleDifference(yaw(returned), yaw(start)), 0, 1e-7, 'Camera returns to its brush view');
  const [resultStart, resultEnd] = STORY_TIMING.result;
  for (const progress of [0, .12, .34, .475, .69, ...[.515, .62, .72].map(brushProgress), (resultStart + resultEnd) / 2, 1]) {
    const pose = sample(progress), original = baseline.sample(progress, aspect);
    assert.ok(pose.position.distanceTo(original.position) < 1e-7, `Unchanged pose at ${progress}`);
    assert.ok(pose.target.distanceTo(original.target) < 1e-7, `Unchanged target at ${progress}`);
  }

  // C1 interpolation at every new knot, with deterministic absolute sampling.
  for (const knot of [identify[1],identified[0],...openWindow,.624,...[.62, .667, .676, .72].map(brushProgress)]) {
    const epsilon = 1e-6, before = sample(knot - epsilon), at = sample(knot), after = sample(knot + epsilon);
    for (const key of ['position', 'target']) {
      const left = at[key].clone().sub(before[key]).divideScalar(epsilon);
      const right = after[key].clone().sub(at[key]).divideScalar(epsilon);
      assert.ok(left.distanceTo(right) < .15, `${key} stays smooth at ${knot}`);
    }
    close(sample(knot).opticalZoom, at.opticalZoom, 1e-12, 'Repeated samples match');
  }
  const sequence = [.62, .635, .65, .667, .676, .69, .705, .72].map(brushProgress);
  const forward = sequence.map(sample), reverse = sequence.toReversed().map(sample).reverse();
  for (let i = 0; i < forward.length; i++) {
    assert.ok(forward[i].position.distanceTo(reverse[i].position) < 1e-12, 'Reverse reproduces camera position');
    assert.ok(forward[i].target.distanceTo(reverse[i].target) < 1e-12, 'Reverse reproduces camera target');
  }
  for (const progress of [.49, .62, .66, .71].map(brushProgress)) {
    const reduced = sampleReducedDentalStory(progress);
    assert.equal(reduced.sceneProgress, brushProgress(.62));
    close(angleDifference(yaw(sample(reduced.sceneProgress)), yaw(start)), 0, 1e-7, 'Reduced motion stays at the brush hold');
  }
  for (const progress of [resultStart, (resultStart + resultEnd) / 2, resultEnd - .001]) {
    const reduced = sampleReducedDentalStory(progress);
    assert.equal(reduced.sceneProgress, (resultStart + resultEnd) / 2);
    const unchanged = baseline.sample(reduced.sceneProgress, aspect);
    assert.ok(sample(reduced.sceneProgress).position.distanceTo(unchanged.position) < 1e-7, 'Reduced motion result remains unchanged');
  }
  assert.equal(sampleReducedDentalStory(resultEnd).sceneProgress, 1, 'Reduced motion uses a settled final smile');
}
console.log('Camera sweep: authored angle, C1 continuity, reverse and reduced-motion holds passed on desktop and portrait.');
