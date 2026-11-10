import assert from 'node:assert/strict';
import { createScrollReadiness } from '../src/experience/scroll-readiness.js';

const gate = createScrollReadiness(.219);
assert.deepEqual(gate.sample(.15), { progress: .15, blocked: false });
assert.deepEqual(gate.sample(.9), { progress: .219, blocked: true });
assert.deepEqual(gate.sample(.219), { progress: .219, blocked: false });
assert.equal(gate.pendingTarget, null, 'native flings are not queued');
assert.equal(gate.advance(.799), null, 'loading never replays a native fling');
assert.deepEqual(gate.sample(.219), { progress: .219, blocked: false });
assert.deepEqual(gate.sample(.23), { progress: .23, blocked: false });

const journey = createScrollReadiness(.099);
assert.equal(journey.plan(.995), .099, 'button travel starts up to the available point');
assert.equal(journey.pendingTarget, .995);
assert.equal(journey.advance(.219), .219, 'advance the same journey to the next gate');
assert.equal(journey.pendingTarget, .995);
assert.equal(journey.advance(.099), null, 'a stale load notification cannot rewind readiness');
assert.equal(journey.limit, .219);
assert.equal(journey.advance(.799), .799);
assert.equal(journey.advance(1), .995);
assert.equal(journey.pendingTarget, null);
assert.equal(journey.advance(1), null, 'the requested stop is delivered once');

const cancellation = createScrollReadiness(.219);
assert.equal(cancellation.plan(.62), .219);
cancellation.cancel();
assert.equal(cancellation.advance(.799), null);
assert.equal(cancellation.plan(.995), .799);
assert.equal(cancellation.plan(.17), .17, 'a new destination replaces the blocked one');
assert.equal(cancellation.advance(1), null);
assert.deepEqual(cancellation.sample(-.5), { progress: 0, blocked: false });
assert.deepEqual(cancellation.sample(2), { progress: 1, blocked: false });

console.log('Scroll readiness: native overruns discarded, explicit navigation resumes through checkpoints, and cancellation preserved.');
