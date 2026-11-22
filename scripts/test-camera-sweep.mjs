import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Box3, BufferGeometry, Float32BufferAttribute, Matrix4, Mesh, Vector3, MathUtils } from 'three';
import { experienceConfig } from '../src/experience/config.js';
import { createOpeningCameraOptions, createStoryCameraConfig } from '../src/experience/story-camera.js';
import { createTimeline } from '../src/experience/timeline.js';
import { createJourneyCamera } from '../src/experience/camera.js';
import { createSmileLayout } from '../src/experience/smile-layout.js';
import { createOcclusalMap } from '../src/experience/occlusal-map.js';
import { createCleaningPath } from '../src/experience/cleaning-path.js';
import { sampleDentalStory, sampleOpeningDentalStory, sampleReducedDentalStory } from '../src/experience/dental-story.js';
import { DENTAL_CHAPTERS, DENTAL_STORY, STORY_TIMING, brushProgress } from '../src/experience/story-config.js';

// Real measured proximal site with small mock landmark boxes. The browser tests
// independently check actual tooth occlusion and the visible camera framing.
const site = JSON.parse(readFileSync(new URL('../public/story-assets/site.json', import.meta.url)));
const chapterAt = id => DENTAL_CHAPTERS.find(chapter => chapter.id === id).at;
const region = (center, size) => new Box3().setFromCenterAndSize(new Vector3(...center), new Vector3(...size));

// Exercise the same crown seats and pivots as the renderer, using the
// project GLB's actual position accessors (the camera needs no textures).
const crowns = readFileSync(new URL('../public/dentition-assets/crowns.glb', import.meta.url));
const jsonSize = crowns.readUInt32LE(12), doc = JSON.parse(crowns.subarray(20,20+jsonSize));
const manifest = JSON.parse(readFileSync(new URL('../public/dentition-assets/manifest.json',import.meta.url)));
const teeth = new Map();
for (const tooth of manifest.teeth) {
  const mesh = doc.meshes.find(mesh=>mesh.name===tooth.node);
  const pos = doc.accessors[mesh.primitives[0].attributes.POSITION], view = doc.bufferViews[pos.bufferView];
  assert.equal(pos.componentType,5126);
  assert.ok(!view.byteStride);
  const offset = crowns.byteOffset + 28 + jsonSize + (view.byteOffset??0) + (pos.byteOffset??0);
  const geometry = new BufferGeometry().setAttribute('position',new Float32BufferAttribute(new Float32Array(crowns.buffer,offset,3*pos.count),3));
  if(tooth.reflected)geometry.scale(-1,1,1);
  geometry.computeBoundingBox();
  teeth.set(tooth.fdi,{upper:tooth.fdi<30,crown:new Mesh(geometry),matrix:new Matrix4().fromArray(tooth.matrix)});
}
const layout = createSmileLayout(teeth);
const map = createOcclusalMap(teeth,layout);
const poseProgress = (STORY_TIMING.map.lower[1]+STORY_TIMING.map.upper[0])/2;
const middle = sampleDentalStory(poseProgress);
map.sample(middle.mapLower,middle.mapUpper);
const lowerPartial=map.lower.clone(),upperPartial=map.upper.clone();
map.sample(0,0);
assert.ok(map.upper.equals(new Matrix4())&&map.lower.equals(new Matrix4()),'A closed map precisely restores both smile seats');
map.sample(middle.mapLower,middle.mapUpper);
assert.ok(map.lower.equals(lowerPartial)&&map.upper.equals(upperPartial),'Re-entering reproduces the two intermediate jaw poses');
map.sample(1,1);
const landmarks = {
  hero: region([2.86, -.68, -.63], [1.4, 2.1, 1.4]),
  neighbors: region([2.7, -.68, -1], [2.5, 2.1, 2.3]),
  arch: region([0, -1, 0], [6.5, 2.5, 4.5]),
  full: region([0, 0, 0], [6.5, 4.5, 4.5]),
  flight: region([0, 0, 0], [6.5, 4.5, 4.5]),
  smile: region([0, 0, 0], [6.5, 2, 4]),
  map: map.bounds, mapLower: map.lowerBounds,
};

function yaw(pose) {
  const offset = pose.position.clone().sub(pose.target);
  return Math.atan2(offset.x, offset.z);
}
function angleDifference(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
function close(a, b, tolerance, message) {
  assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`);
}

for (const compact of [false, true]) {
  const aspect = compact ? 390 / 844 : 1440 / 900;
  const composed = createStoryCameraConfig(site, experienceConfig, { compact });
  const cameraOptions = composed.camera;
  const allLandmarks = { ...landmarks, ...composed.landmarks };
  const timeline = createTimeline({ landmarks: allLandmarks, cameraOptions });
  const openingOptions = createOpeningCameraOptions(experienceConfig, { compact });
  const opening = createTimeline({ landmarks, cameraOptions: openingOptions });
  const sample = progress => timeline.sample(progress, aspect);
  const atlas = sample(chapterAt('dentition'));
  const hero = sample(chapterAt('hero')), anatomy = sample(chapterAt('anatomy'));
  assert.ok(atlas.target.distanceTo(hero.target) > 2, 'The camera leaves the full arch to frame the lifted molar');
  assert.ok(atlas.target.distanceTo(sample(0).target) < 1e-8, 'The first settled screen frames the full arch');
  assert.ok(openingOptions.keyframes.some(frame=>frame.key==='flight-arc') &&
    !cameraOptions.keyframes.some(frame=>frame.key==='flight-arc'), 'Only the introductory camera follows the flight');
  for (const [camera, progress] of [[opening, 0], [timeline, 1]]) {
    const settled = camera.sample(progress, aspect);
    assert.ok(atlas.target.distanceTo(settled.target) < 1e-8 && atlas.position.distanceTo(settled.position) < 1e-8,
      'Completing or skipping the introduction and the closing smile all use the same camera');
  }
  const [front, seated] = STORY_TIMING.assemblyCrowns;
  const turnAt = opening.stops['flight-arc'];
  assert.ok(turnAt > seated, 'The oblique view happens while the rooted teeth are still arriving');
  let lastYaw = yaw(opening.sample(turnAt, aspect));
  assert.ok(lastYaw - yaw(atlas) > MathUtils.degToRad(12), 'The last part of the opening shows the depth of the arch');
  for (let i = 1; i <= 30; i++) {
    const angle = yaw(opening.sample(MathUtils.lerp(turnAt, seated, i / 30), aspect));
    assert.ok(angle <= lastYaw && angle >= yaw(atlas) - 1e-8, 'Settle to the atlas without overshooting');
    lastYaw = angle;
  }
  for(let i=0;i<=30;i++){
    const frame=opening.sample(MathUtils.lerp(seated,front,i/30),aspect);
    for(const key of ['position','target'])assert.ok(frame[key].distanceTo(atlas[key])<1e-8,
      'Crown handover stays on the settled atlas camera');
    for(const key of ['screenX','screenY','opticalZoom'])close(frame[key],atlas[key],1e-12,
      'The crown handover cannot introduce a lens or framing change');
  }
  const locate = sample(chapterAt('assembly'));
  const {identify,identified,lift,reseat,smileTurn,crownLocator,contactHold,followSurface}=STORY_TIMING.teachingSite;
  const surveyed=sample(crownLocator[1]);
  assert.ok(yaw(surveyed)-yaw(atlas)>.78, 'The full smile first turns to expose the molar in its arch');
  assert.equal(sampleDentalStory(crownLocator[1]).assemblyCrownCoverage,1);
  assert.equal(sampleDentalStory(crownLocator[1]).toothExtraction,0);
  assert.equal(sampleDentalStory(crownLocator[1]).locate36,1);
  assert.equal(sampleOpeningDentalStory(crownLocator[1]).locate36,0,'The opening flight has no survey overlay');
  assert.ok(surveyed.position.distanceTo(sample(STORY_TIMING.atlas[1]).position)<1e-8,
    'The registered full-crown location is held before the closer survey');
  assert.ok(yaw(locate) - yaw(atlas) > .65, 'The camera turns towards the patient’s left');
  assert.ok(sample(identify[1]).position.distanceTo(sample(identified[0]).position)<1e-8,
    'The identifying label has a stationary hold before the macro move');
  const apparentScale=pose=>pose.opticalZoom/pose.position.distanceTo(pose.target);
  const relativeScale=apparentScale(locate)/apparentScale(atlas);
  assert.ok(relativeScale>.72 && relativeScale<1.28,
    'The turn holds a wide contextual scale while the molar is identified');
  assert.ok(apparentScale(hero)>apparentScale(locate)*1.25,
    'The camera approaches after the identification hold');
  const liftedCenter = landmarks.hero.getCenter(new Vector3()).add(new Vector3(...DENTAL_STORY.extractionOffset));
  assert.ok(hero.target.distanceTo(liftedCenter)<.22, 'The lens follows the displaced tooth');
  for(const frame of [sample(lift[1]), anatomy, sample(reseat[0])]){
    for(const key of ['position','target'])assert.ok(frame[key].distanceTo(hero[key])<1e-8,
      'The longitudinal cut opens on the same molar with a stationary lens');
    for(const key of ['screenX','screenY','opticalZoom'])close(frame[key],hero[key],1e-12,'The cut retains the full-tooth composition');
  }
  const format=compact?'portrait':'desktop';
  close(atlas.opticalZoom,experienceConfig.camera.framing.smile[format][2],1e-7,'The opening keeps its established optical composition');
  close(sample(1).opticalZoom,experienceConfig.camera.framing['final-smile'][format][2],1e-7,'The closing smile uses its own responsive composition');
  const nearBoundary = 1e-6;
  for (const { start: boundary } of DENTAL_CHAPTERS.slice(1)) {
    for (const key of ['position', 'target']) {
      assert.ok(sample(boundary - nearBoundary)[key].distanceTo(sample(boundary + nearBoundary)[key]) < .002,
        `Camera ${key} stays continuous across chapter boundary ${boundary}`);
    }
  }
  const start = sample(brushProgress(.62));
  const contact=sample(chapterAt('space')).target;
  const row=site.brush.centerline.find(point=>new Vector3(...point.position).distanceTo(contact)<1e-6);
  assert.ok(row,'The camera arrives on the measured brush centerline');
  const contacts=compact?row.contactsMobile:row.contacts;
  assert.ok([36,37].every(fdi=>contacts.some(wall=>wall.fdi===fdi &&
    wall.distanceMm<=site.brush.dimensionsMm.bristleRadius)), 'The landmark has bilateral bristle contact');
  assert.ok(start.target.distanceTo(contact)<1e-8,
    'The working head and incoming surface approach share one physical focus');
  const carryingOffset=new Vector3(...DENTAL_STORY.extractionOffset).multiplyScalar(sampleDentalStory(followSurface).toothExtraction);
  const wall=new Vector3(...contacts.find(w=>w.fdi===36).nearestWorld).add(carryingOffset);
  assert.ok(sample(followSurface).target.distanceTo(wall)<1e-7, 'The camera tracks the actual distal wall of the moving molar');
  assert.ok(sample(reseat[1]).target.distanceTo(contact)<1e-8, 'The distal wall leads directly to the measured corridor as the molar seats');
  assert.ok(sample(reseat[1]).position.distanceTo(sample(chapterAt('space')).position)<1e-8,
    'The camera holds the physical corridor with both neighbors present');
  if(compact){
    const path=createCleaningPath(site), rig=createJourneyCamera({timeline});
    rig.resize(390,844);
    const at=brushProgress(.62), state=sampleDentalStory(at);
    rig.setProgress(at);
    const tip=path.tipArcMm(state.brushInsertion,state.brushAlignment);
    const project=arc=>path.sample(arc).position.project(rig.camera);
    const front=project(tip-path.dimensions.tipMarginMm);
    const back=project(tip-path.dimensions.tipMarginMm-path.dimensions.bristledLengthMm);
    for(const p of [front,back]) {
      assert.ok(Math.abs(p.x)<.96 && Math.abs(p.y)<.76,'Both ends of the working head fit the phone');
    }
    assert.ok(Math.hypot((back.x-front.x)*195,(back.y-front.y)*422)>95,
      'The bristled length occupies at least a quarter of the 390px phone width');
    rig.dispose();
  }

  const [resultStart, resultEnd] = STORY_TIMING.result;
  for (const progress of [...contactHold, chapterAt('plaque'), ...[.48,.515,.62,.68,.72].map(brushProgress), resultStart, resultEnd]) {
    const pose = sample(progress);
    assert.ok(pose.position.distanceTo(start.position) < 1e-7, `Approach, contact and result share one viewing angle at ${progress}`);
    assert.ok(pose.target.distanceTo(start.target) < 1e-7);
    for (const key of ['screenX','screenY','opticalZoom']) close(pose[key],start[key],1e-10,'Same surface point stays registered on screen');
  }

  // C1 interpolation at every new knot, with deterministic absolute sampling.
  for (const knot of [...smileTurn,identify[1],identified[0],...lift,...reseat,followSurface,...contactHold,...[.62, .667, .676, .72].map(brushProgress)]) {
    const epsilon = 1e-6, before = sample(knot - epsilon), at = sample(knot), after = sample(knot + epsilon);
    for (const key of ['position', 'target']) {
      const left = at[key].clone().sub(before[key]).divideScalar(epsilon);
      const right = after[key].clone().sub(at[key]).divideScalar(epsilon);
      assert.ok(left.distanceTo(right) < .15, `${key} stays smooth at ${knot}`);
    }
    close(sample(knot).opticalZoom, at.opticalZoom, 1e-12, 'Repeated samples match');
  }
  const sequence = [.62, .635, .65, .667, .676, .69, .705, .72].map(brushProgress);
  sequence.push(...STORY_TIMING.map.lower,...STORY_TIMING.map.hold,...STORY_TIMING.map.close,1);
  const forward = sequence.map(sample), reverse = sequence.toReversed().map(sample).reverse();
  for (let i = 0; i < forward.length; i++) {
    assert.ok(forward[i].position.distanceTo(reverse[i].position) < 1e-12, 'Reverse reproduces camera position');
    assert.ok(forward[i].target.distanceTo(reverse[i].target) < 1e-12, 'Reverse reproduces camera target');
  }
  for (const progress of [.49, .62, .66, .71].map(brushProgress)) {
    const reduced = sampleReducedDentalStory(progress);
    assert.equal(reduced.sceneProgress, brushProgress(.62));
    close(angleDifference(yaw(sample(reduced.sceneProgress)), yaw(start)), 0, 1e-7, 'Reduced motion stays at the brush hold');
  }
  for (const progress of [resultStart, (resultStart + resultEnd) / 2, resultEnd - .001]) {
    const reduced = sampleReducedDentalStory(progress);
    assert.equal(reduced.sceneProgress, (resultStart + resultEnd) / 2);
    assert.ok(sample(reduced.sceneProgress).position.distanceTo(start.position) < 1e-7, 'Reduced motion result keeps the working angle');
  }
  assert.equal(sampleReducedDentalStory(resultEnd).sceneProgress, STORY_TIMING.map.at, 'Reduced motion enters the settled map after cleaning');
  assert.equal(sampleReducedDentalStory(1).sceneProgress, 1, 'Reduced motion ends on the settled smile');
  const rig=createJourneyCamera({timeline});
  rig.resize(compact?390:1440,compact?844:900);
  rig.setProgress(STORY_TIMING.map.at);
  const projected=new Box3(), centres=new Map(), point=new Vector3();
  for(const [fdi,item] of teeth) {
    const transform=new Matrix4().multiplyMatrices(item.upper?map.upper:map.lower,layout.get(fdi));
    assert.ok(new Vector3(0,1,0).transformDirection(transform).z>.92,'The biting face of FDI '+fdi+' faces the map camera');
    const positions=item.crown.geometry.attributes.position;
    for(let i=0;i<positions.count;i++)
      projected.expandByPoint(point.fromBufferAttribute(positions,i).applyMatrix4(transform).project(rig.camera));
    centres.set(fdi,map.anchors.get(fdi).clone().applyMatrix4(transform).project(rig.camera));
  }
  assert.ok(centres.get(11).x<centres.get(21).x && centres.get(41).x<centres.get(31).x,'Patient-right incisors project on the left in both arches');
  assert.ok(centres.get(11).y>centres.get(17).y && centres.get(41).y<centres.get(47).y,'Both rows present their occlusal surfaces, with incisors at opposite outer edges');
  assert.ok(projected.min.x>-1&&projected.max.x<1&&projected.min.y>-1&&projected.max.y<1,'Every crown stays in the viewport');
  if (compact) {
    const leftGutter = (1 + projected.min.x) * 390 / 2;
    const rightGutter = (1 - projected.max.x) * 390 / 2;
    assert.ok(Math.min(leftGutter, rightGutter) >= 33,
      'Exterior FDI numbers have room for a leader, two digits and an 8px edge margin');
    assert.ok(projected.max.x-projected.min.x>1.5,'Map fills at least three quarters of phone width');
  }
  rig.dispose();
}
console.log('Camera: molar follow, registered brush/contact hold, C1 continuity, reverse and reduced motion passed on desktop and portrait.');
