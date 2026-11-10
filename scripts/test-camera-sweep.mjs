import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Box3, Vector3, MathUtils } from 'three';
import { experienceConfig } from '../src/experience/config.js';
import { createStoryCameraConfig } from '../src/experience/story-camera.js';
import { createTimeline } from '../src/experience/timeline.js';
import { sampleReducedDentalStory } from '../src/experience/dental-story.js';

// Real measured proximal site with small mock landmark boxes. The browser tests
// independently check actual tooth occlusion and the visible camera framing.
const site = JSON.parse(readFileSync(new URL('../public/story-assets/site.json', import.meta.url)));
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
  const baselineOptions = { ...cameraOptions, keyframes: cameraOptions.keyframes.filter(frame => !frame.key.startsWith('brush-orbit-')) };
  const baseline = createTimeline({ landmarks: allLandmarks, cameraOptions: baselineOptions });
  const sample = progress => timeline.sample(progress, aspect);
  const hero = sample(.045), anatomy = sample(.17);
  close(angleDifference(yaw(anatomy), yaw(hero)), MathUtils.degToRad(-13), 1e-7,
    'Anatomy slightly turns the same hero tooth');
  assert.ok(anatomy.screenX < hero.screenX && anatomy.opticalZoom < hero.opticalZoom,
    'Anatomy eases into a distinct composition');
  close(sample(1).opticalZoom, compact ? .325 : .87, 1e-7, 'The final smile retains its own framing');
  const chapterBoundary = .10, nearBoundary = 1e-5;
  assert.ok(sample(chapterBoundary - nearBoundary).position.distanceTo(sample(chapterBoundary + nearBoundary).position) < .002,
    'The camera stays continuous across the chapter boundary');
  const start = sample(.62), side = sample(.667), hold = sample(.676), returned = sample(.72);

  const expectedYaw = MathUtils.degToRad(experienceConfig.storyCamera.brushSweepYawDegrees);
  close(angleDifference(yaw(side), yaw(start)), expectedYaw, 1e-7, 'Camera follows the authored side angle');
  close(angleDifference(yaw(hold), yaw(side)), 0, 1e-7, 'Side view holds steady');
  close(angleDifference(yaw(returned), yaw(start)), 0, 1e-7, 'Camera returns to its brush view');
  for (const progress of [0, .12, .34, .475, .515, .62, .72, .76, .8]) {
    const pose = sample(progress), original = baseline.sample(progress, aspect);
    assert.ok(pose.position.distanceTo(original.position) < 1e-7, `Unchanged pose at ${progress}`);
    assert.ok(pose.target.distanceTo(original.target) < 1e-7, `Unchanged target at ${progress}`);
  }

  // C1 interpolation at every new knot, with deterministic absolute sampling.
  for (const knot of [.62, .667, .676, .72]) {
    const epsilon = 1e-5, before = sample(knot - epsilon), at = sample(knot), after = sample(knot + epsilon);
    for (const key of ['position', 'target']) {
      const left = at[key].clone().sub(before[key]).divideScalar(epsilon);
      const right = after[key].clone().sub(at[key]).divideScalar(epsilon);
      assert.ok(left.distanceTo(right) < .15, `${key} stays smooth at ${knot}`);
    }
    close(sample(knot).opticalZoom, at.opticalZoom, 1e-12, 'Repeated samples match');
  }
  const forward = [.62, .635, .65, .667, .676, .69, .705, .72].map(progress => sample(progress));
  const reverse = [.72, .705, .69, .676, .667, .65, .635, .62].map(progress => sample(progress)).reverse();
  for (let i = 0; i < forward.length; i++) {
    assert.ok(forward[i].position.distanceTo(reverse[i].position) < 1e-12, 'Reverse reproduces camera position');
    assert.ok(forward[i].target.distanceTo(reverse[i].target) < 1e-12, 'Reverse reproduces camera target');
  }
  for (const progress of [.49, .62, .66, .71]) {
    const reduced = sampleReducedDentalStory(progress);
    assert.equal(reduced.sceneProgress, .62);
    close(angleDifference(yaw(sample(reduced.sceneProgress)), yaw(start)), 0, 1e-7, 'Reduced motion stays at the brush hold');
  }
  for (const progress of [.72, .75, .79]) {
    const reduced = sampleReducedDentalStory(progress);
    assert.equal(reduced.sceneProgress, .76);
    const unchanged = baseline.sample(reduced.sceneProgress, aspect);
    assert.ok(sample(reduced.sceneProgress).position.distanceTo(unchanged.position) < 1e-7, 'Reduced motion result remains unchanged');
  }
}
console.log('Camera sweep: authored angle, C1 continuity, reverse and reduced-motion holds passed on desktop and portrait.');
