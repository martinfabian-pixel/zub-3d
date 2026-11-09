import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createHeroSpin } from '../src/experience/hero-spin.js';

const context = { progress: 0, reducedMotion: false, interacting: false, exploring: false, modified: false };
const spin = createHeroSpin();
for (let now = 1000; now <= 2600; now += 20) spin.update(now, context);
assert.ok(spin.angle > .7 && spin.angle < 2, 'The tooth starts a visible rotation');
const pose = { position: new Vector3(2, 1, 3), target: new Vector3(1, .5, -1) };
const initialRadius = pose.position.distanceTo(pose.target);
const target = pose.target.clone();
spin.apply(pose);
assert.ok(Math.abs(pose.position.distanceTo(pose.target) - initialRadius) < 1e-9);
assert.ok(pose.target.equals(target), 'The orbit preserves its focus');
spin.update(2620, { ...context, interacting: true });
const paused = spin.angle;
spin.update(2920, { ...context, modified: true });
assert.equal(spin.angle, paused, 'Manual interaction stops automatic motion');
spin.update(2940, { ...context, progress: .02, modified: true });
for (let now = 2960; now <= 3600; now += 20) spin.update(now, { ...context, progress: .02 });
assert.equal(spin.angle, 0, 'Scrolling returns to the authored pose');
assert.equal(spin.state, 'done');
spin.update(3620, context);
assert.equal(spin.state, 'done', 'Revisiting the hero does not restart the orbit');

const handover = createHeroSpin();
for (let now = 1000; now <= 5900; now += 20) handover.update(now, context);
const beforeScroll = { position: new Vector3(2, 1, 3), target: new Vector3(1, .5, -1) };
handover.apply(beforeScroll);
handover.update(5920, { ...context, progress: .04 });
const afterScroll = { position: new Vector3(2, 1, 3), target: new Vector3(1, .5, -1) };
handover.apply(afterScroll);
assert.ok(beforeScroll.position.distanceTo(afterScroll.position) < .04, 'The handover starts without a camera jump');
handover.update(5940, { ...context, progress: .04, interacting: true });
const pausedReturn = handover.angle;
handover.update(5960, { ...context, progress: .04, interacting: true });
assert.equal(handover.angle, pausedReturn, 'A touch interrupts the handover without fighting the user');

const resumedTab = createHeroSpin();
resumedTab.update(1000, context);
resumedTab.update(1020, context);
const beforePause = resumedTab.angle;
resumedTab.update(90000, context);
assert.ok(Math.abs(resumedTab.angle - beforePause) < .01, 'Returning to a hidden tab does not jump');

const reduced = createHeroSpin();
assert.equal(reduced.update(1000, { ...context, reducedMotion: true }), false);
assert.equal(reduced.angle, 0);
const restored = createHeroSpin();
assert.equal(restored.update(1000, { ...context, progress: .5 }), false);
assert.equal(restored.angle, 0, 'Restored scroll positions skip the opening orbit');

const finish = createHeroSpin({ durationMs: 1000 });
for (let now = 1000; now <= 2200; now += 20) finish.update(now, context);
assert.equal(finish.state, 'done');
assert.equal(finish.angle, 0, 'A completed turn ends at the original orientation');
console.log('Hero spin: orbit, manual interruption, story handover and reduced motion passed.');
