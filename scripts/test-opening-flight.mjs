import assert from 'node:assert/strict';
import { createOpeningFlight } from '../src/experience/opening-flight.js';
import { sampleDentalStory } from '../src/experience/dental-story.js';
import { floatingAmount } from '../src/experience/floating-teeth.js';
import { DENTAL_CHAPTERS, STORY_TIMING } from '../src/experience/story-config.js';

const intro=createOpeningFlight();
const seed=DENTAL_CHAPTERS.find(chapter=>chapter.id==='assembly').at;
const [atlasStart,atlasEnd]=STORY_TIMING.atlas;
const start=900;
const first=intro.sample(start);
assert.deepEqual(first,{progress:seed,yaw:0,growth:0,phase:'spin',done:false});
assert.equal(sampleDentalStory(first.progress).assemblyReveal,0);
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
  const scene=sampleDentalStory(shot.progress);
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
assert.equal(sampleDentalStory(end.progress).assemblyCrownCoverage,1);
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

console.log('Opening flight: single tooth rotation, rooted flight, crown seating and paused clock passed.');
