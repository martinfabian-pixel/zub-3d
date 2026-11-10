import assert from 'node:assert/strict';
import { createManualCleaning } from '../src/experience/manual-cleaning.js';

const brush=createManualCleaning(),s=brush.state;
assert.equal(s.phase,'ready');
assert.equal(s.pose.alignment,0);
assert.equal(s.pose.insertion,0);
assert.equal(s.cleaningProgress,0);
assert.equal(brush.dragBy(1),false,'Touch or movement without a grip does not clean');
brush.beginDrag();brush.endDrag();
for(let i=0;i<120;i++)brush.update(1/60);
assert.equal(s.cleaningProgress,0,'A stationary touch does not remove plaque');

function move(target) {
  brush.beginDrag();
  brush.dragBy(target-s.target);
  for(let i=0;i<120&&s.phase!=='result';i++) {
    brush.update(1/60);
    assert.ok(s.pose.insertion>=0&&s.pose.insertion<=1,'Tip remains in its certified travel');
    assert.ok(s.pose.alignment>=0&&s.pose.alignment<=1);
    assert.ok(s.cleaningProgress<=Math.max(0,(s.furthestInsertion-.1)/.9)+1e-9,
      'Plaque cannot be removed beyond the actual swept reach');
  }
  brush.endDrag();
}
move(.35);
assert.equal(s.phase,'insert');
assert.ok(s.cleaningProgress>0&&s.cleaningProgress<1);
const partial=s.cleaningProgress;
move(.1);
assert.ok(s.cleaningProgress>=partial,'Cleaned support is retained when withdrawing');
assert.ok(s.cleaningProgress<1,'Shallow movement cannot clean unreached film');
brush.reset();
move(1);
assert.equal(s.phase,'clean','A single insertion is not a completed cleaning');
assert.ok(s.cleaningProgress>0&&s.cleaningProgress<1);
move(.2);move(1);move(.2);
assert.equal(s.phase,'result','Repeated physical passes complete the illustration');
assert.equal(s.cleaningProgress,1);
assert.equal(brush.beginDrag(),false,'Completed example is stable until reset');
brush.reset();move(.985);move(.2);move(.985);move(.2);
assert.equal(s.phase,'result');
assert.ok(s.cleaningProgress<1,'Partial insertion must not claim complete removal');
assert.ok(s.cleaningProgress<=Math.max(0,(s.furthestInsertion-.1)/.9)+1e-9,
  'The result cannot erase plaque outside the measured reach');
brush.reset();
assert.equal(s.phase,'ready');assert.equal(s.cleaningProgress,0);assert.equal(s.position,0);
brush.beginDrag();brush.dragBy(100);for(let i=0;i<100;i++)brush.update(1/60);
assert.equal(s.target,1);assert.equal(s.pose.insertion,1,'Large drags are clamped');
brush.dragBy(-100);for(let i=0;i<100;i++)brush.update(1/60);
assert.equal(s.target,0);assert.equal(s.pose.insertion,0,'Withdrawal cannot overshoot');
console.log('Manual cleaning: bounded approach, physical reach, strokes, reset and no-touch cleanup passed.');
