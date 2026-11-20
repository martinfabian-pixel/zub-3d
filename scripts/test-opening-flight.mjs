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
for(let t=1151;t<3900;t++){
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
const end=intro.sample(start+3900);
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

// The first real frame inherits the exact rendered poster cell. An angle
// on either side of 2π describes the same motion for the rest of the turn.
const posterYaw=Math.PI/12;
const fromPoster=createOpeningFlight(posterYaw);
const wrapped=createOpeningFlight(posterYaw-2*Math.PI);
assert.equal(fromPoster.sample(0,false).yaw,posterYaw);
wrapped.sample(0,false);
for(let t=10;t<=1150;t+=10){
  const actual=fromPoster.sample(t,false),other=wrapped.sample(t,false);
  assert.ok(Math.abs(Math.cos(actual.yaw)-Math.cos(other.yaw))<1e-10);
  assert.ok(Math.abs(Math.sin(actual.yaw)-Math.sin(other.yaw))<1e-10);
  if(t===110)assert.ok(actual.growth<.00001,'The framing holds throughout the 110 ms handoff');
}

// Release the download while the camera moves outward, at its turning point,
// and on its way back. In each case launch carries both position and speed.
for(const waitingTime of [1150,2200,3350]){
  const staged=createOpeningFlight(posterYaw),stillWaiting=createOpeningFlight(posterYaw);
  const launchTime=1150+waitingTime;
  let min=Infinity,max=-Infinity;
  for(let t=0;t<launchTime;t+=10){
    const shot=staged.sample(t,false);
    stillWaiting.sample(t,false);
    if(t>=1150){
      assert.equal(shot.phase,'waiting');assert.equal(shot.growth,1);
      assert.equal(shot.progress,seed,'Only the single rooted molar is visible');
      min=Math.min(min,shot.yaw);max=Math.max(max,shot.yaw);
    }
  }
  assert.ok(max-min>.15&&max<.46,'Long loads keep exploring a bounded three-quarter view');
  const moving=staged.sample(launchTime,true);
  assert.equal(moving.phase,'flight');assert.equal(moving.progress,seed);
  assert.equal(moving.yaw,stillWaiting.sample(launchTime,false).yaw);
  let lastYaw=moving.yaw;
  for(let dt=16;dt<2750;dt+=16){
    const shot=staged.sample(launchTime+dt,true);
    if(dt===16)assert.ok(Math.abs(shot.yaw-stillWaiting.sample(launchTime+dt,false).yaw)<.0001);
    assert.ok(Math.abs(shot.yaw-lastYaw)<.025,'No sudden camera turn when the arch arrives');
    if(dt>=850)assert.equal(shot.yaw,0,'The rest of the flight uses its original camera');
    assert.equal(shot.done,false);
    lastYaw=shot.yaw;
  }
  assert.deepEqual(staged.sample(launchTime+2750,true),end);
}

console.log('Poster pose handoff, continuous loading orbit, timed rooted flight and crown seating passed.');
