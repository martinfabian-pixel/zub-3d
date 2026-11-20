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
assert.ok(halfway.yaw>0&&halfway.yaw<Math.PI/2);
assert.ok(halfway.growth>0&&halfway.growth<1,'The tooth turns gently during the zoom');
for(let t=600;t<1149;t+=25)intro.sample(start+t);
const beforeLaunch={...intro.sample(start+1149)};
const launch=intro.sample(start+1150);
assert.equal(launch,first,'Samples reuse one frame record');
assert.equal(launch.phase,'flight');
assert.equal(launch.progress,seed);
assert.ok(1-beforeLaunch.growth<.00001&&launch.growth===1,'The flight inherits the final spin framing');
const speed=2*Math.PI/3600;
assert.ok(Math.abs(launch.yaw-beforeLaunch.yaw-speed)<1e-12,
  'A ready arch begins its flight immediately with the exact loading velocity');

const duration=3650, endAt=1150+duration;
let previous=seed, sawFlight=false, sawCrowns=false, firstTen, firstNinety;
for(let t=1151;t<endAt;t++){
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
    firstTen??=t;
  }
  if(scene.assemblyCrownCoverage>=.9)firstNinety??=t;
  previous=shot.progress;
}
assert.ok(sawFlight&&sawCrowns);
assert.ok(firstNinety-firstTen>=650,'The visible 10–90% shape change has at least 650 ms of screen time');
assert.ok(Math.abs(previous-atlasEnd)<.000001);
const end=intro.sample(start+endAt);
assert.deepEqual(end,{progress:atlasStart,yaw:2*Math.PI,growth:1,phase:'done',done:true});
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

const slow=createOpeningFlight(posterYaw);
let last=posterYaw,waitingStart;
for(let t=0;t<=19150;t+=10){
  const shot=slow.sample(t,false);
  if(t===1150)waitingStart=shot.yaw;
  if(t>=1100){
    assert.ok(Math.abs(shot.yaw-last-10*speed)<1e-12,'Enlargement and the loading message never stop or reset the orbit');
    assert.equal(shot.phase,t<1150?'spin':'waiting');
    assert.equal(shot.progress,seed);
  }
  last=shot.yaw;
}
assert.ok(Math.abs(slow.sample(19150,false).yaw-waitingStart-5*2*Math.PI)<1e-12,'Five entire forward turns while crown assets are held');
const beforeHide={...slow.sample(19150,false)};
slow.pause();
assert.deepEqual(slow.sample(50000,false),beforeHide,'No orbit time accumulates in a hidden tab');

// Complete the download at many different displayed orientations, including
// either side of the zero-degree seam and of the minimum braking distance.
const releaseAngles=[0,.001,16,17.999,18,100,101,140,180,225,285,341.999,342,342.001,359.999];
for(const angle of releaseAngles){
  const staged=createOpeningFlight();
  const release=145+7200+10*angle;
  for(let t=0;t<release;t+=20)staged.sample(t,false);
  let previousYaw=staged.sample(release,false).yaw;
  const ready=staged.sample(release,true);
  assert.ok(Math.abs(ready.yaw-previousYaw)<1e-12,'Readiness uses the actual unwrapped loading angle');
  const dt=10;
  let firstFlight=ready.phase==='flight'?release:null,doneAt;
  for(let t=release+dt;t<=release+1200+duration;t+=dt){
    const shot=staged.sample(t,true);
    const angularStep=shot.yaw-previousYaw;
    assert.ok(angularStep>=-1e-12 && angularStep<=1.55*speed*dt,'The camera never reverses or whips around when assets arrive');
    if(shot.phase==='spin')assert.ok(Math.abs(angularStep-speed*dt)<1e-12,'Any alignment before launch keeps the same velocity');
    if(sampleOpeningDentalStory(shot.progress).assemblyCrownCoverage>0){
      const offset=Math.atan2(Math.sin(shot.yaw),Math.cos(shot.yaw));
      assert.ok(Math.abs(offset)<1e-10,'The loading orbit has finished before the first crown appears');
    }
    if(shot.phase==='flight'&&firstFlight===null)firstFlight=t;
    if(t===release+dt)assert.ok(Math.abs(angularStep-speed*dt)<.0005,'Speed is continuous across the loading boundary');
    previousYaw=shot.yaw;
    if(shot.done){
      assert.ok(Math.abs(Math.sin(shot.yaw))<1e-12 && Math.cos(shot.yaw)>.999999,'The front camera is settled before the smile takes over');
      assert.equal(shot.progress,atlasStart);
      doneAt=t;
      break;
    }
  }
  assert.ok(firstFlight!==null && firstFlight-release<1200,'Even an unfavorable arrival angle needs less than 1.2 s of alignment');
  assert.equal(doneAt-firstFlight,duration,'The flight and crown handover play for their full authored duration');
}

console.log('Poster handoff, uninterrupted full orbits, forward-only launch, hidden-tab pause and crown seating passed.');
