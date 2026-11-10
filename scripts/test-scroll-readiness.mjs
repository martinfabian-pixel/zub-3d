import assert from 'node:assert/strict';
import { createScrollReadiness } from '../src/experience/scroll-readiness.js';
import { DENTAL_CHAPTERS } from '../src/experience/story-config.js';

const openingStop = 0;
const studyStop = DENTAL_CHAPTERS.find(chapter => chapter.id === 'space').start - .001;
const brushAt = DENTAL_CHAPTERS.at(-1).at;
const gate = createScrollReadiness(openingStop);
assert.deepEqual(gate.sample(.9), { progress: openingStop, blocked: true });
assert.deepEqual(gate.sample(openingStop), { progress: openingStop, blocked: false });
assert.equal(gate.pendingTarget, null, 'native flings are not queued');
assert.equal(gate.advance(studyStop), null, 'loading the opening smile never replays a native fling');
assert.deepEqual(gate.sample(openingStop), { progress: openingStop, blocked: false });
assert.deepEqual(gate.sample(studyStop - .01), { progress: studyStop - .01, blocked: false });

const journey = createScrollReadiness(openingStop);
assert.equal(journey.plan(brushAt), openingStop, 'button travel starts up to the available point');
assert.equal(journey.pendingTarget, brushAt);
assert.equal(journey.advance(studyStop), studyStop, 'advance the same journey to the next gate');
assert.equal(journey.pendingTarget, brushAt);
assert.equal(journey.advance(openingStop), null, 'a stale load notification cannot rewind readiness');
assert.equal(journey.limit, studyStop);
assert.equal(journey.advance(1), brushAt);
assert.equal(journey.pendingTarget, null);
assert.equal(journey.advance(1), null, 'the requested stop is delivered once');

const cancellation = createScrollReadiness(openingStop);
assert.equal(cancellation.plan(brushAt), openingStop);
cancellation.cancel();
assert.equal(cancellation.advance(studyStop), null);
assert.equal(cancellation.plan(1), studyStop);
assert.equal(cancellation.plan(.17), .17, 'a new destination replaces the blocked one');
assert.equal(cancellation.advance(1), null);
assert.deepEqual(cancellation.sample(-.5), { progress: 0, blocked: false });
assert.deepEqual(cancellation.sample(2), { progress: 1, blocked: false });

console.log('Scroll readiness: native overruns discarded, explicit navigation resumes through checkpoints, and cancellation preserved.');
