import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { loadMotionFixture } from './tooth-motion-fixture.mjs';
import { createToothFunctionMotion, sampleToothFunction } from '../src/experience/tooth-function-motion.js';

const arch = await loadMotionFixture();
const motion = createToothFunctionMotion({ arch });
const originals = [...arch.teeth.values()].map(item => ({
  matrix: item.smilePose.matrix.toArray(), vertices: item.crown.geometry.attributes.position.array.slice(), color: item.crown.material.color.getHex(),
}));
function snapshot() {
  const result = [];
  motion.object.traverse(node => {
    if (node.isMesh) result.push({ name: node.name, matrix: node.matrixWorld.toArray(), vertices: [...node.geometry.attributes.position.array] });
  });
  return result;
}
const output = [];
for (const fdi of [21, 36]) {
  assert.ok(motion.start(fdi));
  const upper = motion.object.getObjectByName('Fixed upper crowns');
  const fixedUpper = upper.children.map(mesh => mesh.matrixWorld.toArray());
  motion.setProgress(.5);
  const middle = snapshot();
  const middleState = motion.report();
  motion.setProgress(.93);
  motion.setProgress(.25);
  motion.setProgress(.5);
  assert.deepEqual(snapshot(), middle, 'Backwards scrub reproduces every tooth matrix and apple vertex');
  let minimumGap = Infinity;
  let previous = null;
  for (let i = 0; i <= 1000; i++) {
    motion.setProgress(i / 1000);
    const state = motion.report();
    minimumGap = Math.min(minimumGap, state.minHardSurfaceGap);
    // These are extrema over ALL transformed real crown vertices. A positive
    // separating y-plane proves the upper/lower meshes cannot intersect at
    // ANY point in this translational motion, even between test samples.
    assert.ok(state.minHardSurfaceGap > .02, 'Real opposing crowns stay separated');
    assert.deepEqual(upper.children.map(mesh => mesh.matrixWorld.toArray()), fixedUpper, 'Upper teeth stay fixed');
    assert.ok(state.lowerTranslation.every(Number.isFinite));
    if (previous) assert.ok(state.lowerTranslation.every((value, axis) => Math.abs(value - previous[axis]) < .006), 'No jaw discontinuity');
    previous = state.lowerTranslation;
  }
  if (fdi === 21) {
    assert.ok(middleState.cut > .25 && middleState.cut < .8, 'Halfway pose shows a partial cut');
    assert.equal(middleState.split, 0, 'Halfway bite is still connected');
    assert.equal(motion.report().split, 1, 'Completed bite is detached');
    motion.setProgress(.3);
    assert.equal(motion.report().split, 0, 'Rewinding rejoins the same apple');
    const point = new Vector3();
    for (const progress of [.79, .83, .93, 1]) {
      motion.setProgress(progress);
      let lowerFront = -Infinity, biteRear = Infinity;
      for (const mesh of motion.object.getObjectByName('Moving lower crowns').children) {
        const positions = mesh.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) lowerFront = Math.max(lowerFront, point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).z);
      }
      motion.object.getObjectByName('Detached apple bite').traverse(mesh => {
        if (!mesh.isMesh) return;
        const positions = mesh.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) biteRear = Math.min(biteRear, point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).z);
      });
      assert.ok(biteRear - lowerFront > .05, 'Detached apple clears the actual lower labial envelope before dropping');
    }
  } else {
    assert.ok(middleState.compression > .2, 'Halfway pose visibly compresses the food');
    assert.ok(middleState.foodSupportOffset > 0 && middleState.foodSupportOffset < .12, 'Food seating samples the real occlusal triangle below its centre');
    motion.setProgress(.7);
    assert.ok(motion.report().lateral > .1, 'Molar has an observable lateral stroke');
  }
  for (const ratio of [390 / 844, 844 / 390, 16 / 9]) {
    const pose = motion.cameraPose({ aspect: ratio, compact: ratio < 1 });
    assert.ok([...pose.position.toArray(), ...pose.target.toArray()].every(Number.isFinite));
  }
  output.push({ fdi, minimumHardSurfaceGapCm: minimumGap, halfway: middleState });
}
assert.deepEqual([...arch.teeth.values()].map(item => ({
  matrix: item.smilePose.matrix.toArray(), vertices: item.crown.geometry.attributes.position.array.slice(), color: item.crown.material.color.getHex(),
})), originals, 'The atlas geometry, seating and latest enamel palette are never mutated');
assert.equal(sampleToothFunction(21, NaN).progress, 0);
motion.dispose();
console.log(JSON.stringify(output, null, 2));
console.log('Tooth function motion: real geometry clearance, fixed maxilla, reversible jaw/food, continuity and unchanged atlas passed.');
