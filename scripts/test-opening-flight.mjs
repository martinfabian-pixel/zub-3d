import assert from 'node:assert/strict';
import { createOpeningFlight } from '../src/experience/opening-flight.js';
import { sampleDentalStory, sampleOpeningDentalStory } from '../src/experience/dental-story.js';
import { floatingAmount } from '../src/experience/floating-teeth.js';
import { STORY_TIMING } from '../src/experience/story-config.js';

const intro=createOpeningFlight();
const seed=STORY_TIMING.openingTooth;
const [atlasStart,atlasEnd]=STORY_TIMING.atlas;
const start=900;
const first=intro.sample(start);
assert.deepEqual(first,{progress:seed,yaw:0,growth:0,phase:'spin',done:false});
assert.equal(sampleOpeningDentalStory(first.progress).assemblyReveal,0);
for(let t=25;t<575;t+=25)intro.sample(start+t);
const halfway={...intro.sample(start+575)};
assert.equal(halfway.progress,seed);
assert.equal(halfway.yaw,Math.PI);
assert.ok(halfway.growth>0&&halfway.growth<1,'The shot grows during the same revolution');
for(let t=600;t<1149;t+=25)intro.sample(start+t);
const beforeLaunch={...intro.sample(start+1149)};
const launch=intro.sample(start+1150);
assert.equal(launch,first,'Samples reuse one frame record');
assert.equal(launch.phase,'flight');
assert.equal(launch.progress,seed);
assert.ok(1-beforeLaunch.growth<.00001&&launch.growth===1,'The flight inherits the final spin framing');
assert.ok(Math.abs(Math.sin(beforeLaunch.yaw)-Math.sin(launch.yaw))<.00001,
  'The completed revolution does not rotate abruptly at launch');

let previous=seed, sawFlight=false, sawCrowns=false;
for(let t=1151;t<3150;t++){
  const shot=intro.sample(start+t);
  assert.ok(shot.progress<=previous && previous-shot.progress<.001);
  const scene=sampleOpeningDentalStory(shot.progress);
  assert.equal(scene.openingFlight,true);
  assert.equal(scene.toothExtraction,0,'The story lift never displaces the opening molar');
  assert.equal(scene.locate36,0,'Teaching identification never overlays the opening');
  if(floatingAmount(shot.progress)>.5){
    assert.equal(scene.assemblyCrownCoverage,0,'The flying teeth retain their roots');
    sawFlight=true;
  }
  if(scene.assemblyCrownCoverage>.1){
    assert.ok(sawFlight,'Crowns only appear after the flight');
    sawCrowns=true;
  }
  previous=shot.progress;
}
assert.ok(sawFlight&&sawCrowns);
assert.ok(Math.abs(previous-atlasEnd)<.000001);
const end=intro.sample(start+3150);
assert.deepEqual(end,{progress:atlasStart,yaw:0,growth:1,phase:'done',done:true});
const settledOpening=sampleOpeningDentalStory(end.progress);
const settledStory=sampleDentalStory(end.progress);
for (const key of ['sceneProgress','assemblyReveal','neighborsReveal','assemblyCrownCoverage','toothExtraction','locate36'])
  assert.equal(settledOpening[key],settledStory[key],`The opening and skipped opening settle on the same ${key}`);
assert.equal(settledOpening.assemblyCrownCoverage,1);
assert.equal(intro.sample(start+5000),end);

const sparse=createOpeningFlight();
const dense=createOpeningFlight();
for(let t=1;t<1801;t+=40)sparse.sample(t);
for(let t=1;t<1801;t+=16)dense.sample(t);
assert.deepEqual(sparse.sample(1801),dense.sample(1801),'Normal frame cadence preserves the same wall-clock pose');
const cold=createOpeningFlight();
cold.sample(1);
assert.equal(cold.sample(1201).phase,'spin','A slow first draw cannot consume the turn');
assert.ok(cold.sample(1218).yaw<.1);
const held={...sparse.sample(1901)};
sparse.pause();
assert.deepEqual(sparse.sample(10001),held,'Hiding the tab does not advance the animation');
assert.ok(sparse.sample(10101).progress<held.progress);

const staged=createOpeningFlight();
staged.sample(0,false);
staged.sample(55,false);
const handoff=staged.sample(110,false);
assert.ok(handoff.growth<.00001,'The portrait framing holds throughout the 110 ms handoff');
for(let t=135;t<=1400;t+=25)staged.sample(t,false);
const waiting={...staged.sample(1420,false)};
assert.deepEqual(waiting,{progress:seed,yaw:0,growth:1,phase:'waiting',done:false});
assert.deepEqual(staged.sample(28000,false),waiting,'Only the returned molar is shown while the arch downloads');
assert.deepEqual(staged.sample(60000,true),{...waiting,phase:'flight'},'The first ready flight frame begins at its actual launch pose');
assert.ok(staged.sample(60016,true).progress<seed,'Readiness resumes the flight without input');
for(let t=60032;t<=62000;t+=16)staged.sample(t,true);
assert.deepEqual(staged.sample(62000),end,'Staged loading and uninterrupted playback reach the same seated smile');

console.log('Automatic rotation, sharp handoff, staged flight, paused clock and crown seating passed.');
