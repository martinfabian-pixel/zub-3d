// Deterministic camera/scroll contract checks; synthetic landmarks, no browser/GPU.
// These don't replace visual QA of the real tooth assets and reveal choreography.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTimeline, DEFAULT_STOPS, JOURNEY_STAGES } from '../src/experience/timeline.js';
import { createJourneyCamera } from '../src/experience/camera.js';
import { createScrollDriver } from '../src/experience/scroll.js';

const arch = new THREE.Group(), upper = new THREE.Group(), lower = new THREE.Group();
arch.add(upper, lower);
const geometry = new THREE.SphereGeometry(1, 16, 10), material = new THREE.MeshBasicMaterial();
for (const jaw of [upper, lower]) for (const side of [-1, 1]) for (let i = 0; i < 7; i++) {
  const theta = (i + 0.5) * Math.PI / 14;
  const tooth = new THREE.Mesh(geometry, material);
  tooth.position.set(side * 3 * Math.sin(theta), jaw === upper ? 1.35 : -1.25, 2.4 * Math.cos(theta) - i * 0.38);
  tooth.scale.set(0.3 + i * 0.022, 0.85 + i * 0.02, 0.32 + i * 0.02);
  tooth.rotation.z = jaw === upper ? -0.08 : 0.09;
  jaw.add(tooth);
}
const hero = upper.children[12], neighbors = upper.children.slice(11, 14);
const originalTransform = hero.position.clone(), timeline = createTimeline({ landmarks: { hero: () => hero, neighbors, upper, full: arch } });
const rig = createJourneyCamera({ timeline });
assert.ok(hero.position.equals(originalTransform));

// The deferred arch uses detached bounds proxies with manually copied matrices.
// They have not been rendered, so their matrixWorld may still be identity.
const detached = new THREE.Mesh(geometry, material);
detached.matrixAutoUpdate = false;
detached.matrix.makeTranslation(9, -2, 4);
const detachedTimeline = createTimeline({ landmarks: { hero: detached, neighbors: detached, upper: detached, full: detached } });
assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(detached.matrixWorld).toArray(), [9, -2, 4]);
assert.ok(detachedTimeline.sample(1, 1).target.distanceTo(new THREE.Vector3(9, -2, 4)) < 1);

const groups = [[hero], neighbors, upper.children, [...upper.children, ...lower.children]];
const vertices = groups.map((group) => {
  const result = [];
  for (const mesh of group) for (let i = 0; i < geometry.attributes.position.count; i++) {
    result.push(mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
  }
  return result;
});
const point = new THREE.Vector3();
function frame(group) {
  let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity, inside = true;
  for (const world of vertices[group]) {
    point.copy(world).project(rig.camera);
    left = Math.min(left, point.x); right = Math.max(right, point.x);
    bottom = Math.min(bottom, point.y); top = Math.max(top, point.y);
    if (Math.abs(point.x) > 1 || Math.abs(point.y) > 1 || Math.abs(point.z) > 1) inside = false;
  }
  return { inside, occupancy: Math.max(right - left, top - bottom) / 2 };
}
const report = [];
for (const [width, height] of [[1440, 900], [390, 844], [320, 568], [844, 390]]) {
  rig.resize(width, height);
  const reusable = rig.setProgress(0), aspect = width / height;
  const coverage = {}, fullyVisibleBy = {};
  for (const [i, name] of JOURNEY_STAGES.entries()) {
    assert.equal(rig.setProgress(DEFAULT_STOPS[name]), reusable);
    const shot = frame(i);
    assert.ok(shot.inside, name + ' cropped at its keyframe');
    assert.ok(shot.occupancy > 0.65 && shot.occupancy <= 1, name + ' must fill the limiting dimension');
    coverage[name] = Number(shot.occupancy.toFixed(3));
  }
  const forward = [];
  for (let i = 0; i <= 500; i++) forward.push(rig.setProgress(i / 500).position.toArray());
  for (let i = 500; i >= 0; i--) assert.deepEqual(rig.setProgress(i / 500).position.toArray(), forward[i]);
  assert.deepEqual(forward[0], forward[35], 'Stable hero hold');
  assert.deepEqual(forward[440], forward[500], 'Stable final hold');

  for (const knot of Object.values(DEFAULT_STOPS)) {
    const velocityResidual = (epsilon) => {
      const a = timeline.sample(knot - epsilon, aspect).position;
      const b = timeline.sample(knot, aspect).position;
      const c = timeline.sample(knot + epsilon, aspect).position;
      return c.sub(b.multiplyScalar(2)).add(a).length() / epsilon;
    };
    // At a velocity kink this residual approaches a nonzero constant.
    assert.ok(velocityResidual(1e-6) < 0.14 * velocityResidual(1e-5) + 1e-8, 'Velocity discontinuity at ' + knot);
  }
  for (let i = 0; i <= 100; i++) {
    const p = i / 100;
    rig.setProgress(p);
    for (const [group, name] of JOURNEY_STAGES.entries()) {
      const visible = frame(group).inside;
      if (visible && fullyVisibleBy[name] === undefined) fullyVisibleBy[name] = p;
      if (p >= DEFAULT_STOPS[name]) assert.ok(visible, 'A reached subject left frame: ' + name + ' at ' + p);
    }
  }
  const stills = new Set();
  for (let i = 0; i <= 100; i++) stills.add(timeline.sample(i / 100, aspect, true).position.toArray().join(','));
  assert.equal(stills.size, 4, 'Reduced motion uses four static shots');
  report.push({ width, height, coverage, fullyVisibleBy });
}
const oldTarget = timeline.sample(0, 1).target.x;
hero.position.x += 0.15;
timeline.refreshLandmarks();
assert.ok(Math.abs(timeline.sample(0, 1).target.x - oldTarget - 0.15) < 1e-6);
rig.dispose();
assert.equal(rig.setProgress(1), null);
geometry.dispose(); material.dispose();

// Exercise native event coalescing/cleanup without issuing any scrolling commands.
class Events {
  handlers = new Map();
  addEventListener(type, callback) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(callback);
  }
  removeEventListener(type, callback) { this.handlers.get(type)?.delete(callback); }
  emit(type) { for (const callback of this.handlers.get(type) ?? []) callback(); }
}
const win = new Events(), doc = new Events(), media = new Events(), frames = new Map(), pulses = [];
let top = 0, nextFrame = 0;
media.matches = false; doc.defaultView = win; doc.hidden = false; win.innerHeight = 800;
win.matchMedia = () => media;
win.requestAnimationFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
win.cancelAnimationFrame = (handle) => frames.delete(handle);
win.ResizeObserver = class { observe() {} disconnect() {} };
function flush() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((f) => f()); }
const section = { ownerDocument: doc, getBoundingClientRect: () => ({ height: 4000, top }) };
const driver = createScrollDriver({ section, onProgress: (p, options) => pulses.push([p, options.reducedMotion]) });
assert.deepEqual(pulses, [[0, false]]);
top = -1600; win.emit('scroll'); win.emit('scroll');
assert.equal(frames.size, 1); flush();
assert.deepEqual(pulses.at(-1), [0.5, false]);
media.matches = true; media.emit('change'); flush();
assert.deepEqual(pulses.at(-1), [0.5, true]);
top = -5000; assert.equal(driver.getProgress(), 1);
top = 200; assert.equal(driver.getProgress(), 0);
win.emit('scroll'); driver.dispose(); assert.equal(frames.size, 0);
for (const emitter of [win, doc, media]) for (const callbacks of emitter.handlers.values()) assert.equal(callbacks.size, 0);
console.log(JSON.stringify({ passed: true, scope: 'synthetic transformed arches; camera math and native scroll lifecycle', views: report }, null, 2));
