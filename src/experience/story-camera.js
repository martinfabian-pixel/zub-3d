import { Box3, MathUtils, Vector3 } from 'three';
import { DENTAL_CHAPTERS, DENTAL_STORY, STORY_TIMING } from './story-config.js';
import { sampleToothExtraction } from './dental-story.js';
import { flightProgress } from './floating-teeth.js';

const spaceAt = DENTAL_CHAPTERS.find(chapter => chapter.id === 'space').at;
const molarOffset = new Vector3(...DENTAL_STORY.extractionOffset);

function followTeachingMolar(target, progress) {
  target.addScaledVector(molarOffset, sampleToothExtraction(progress));
}

function region(center, halfExtent) {
  return new Box3(center.clone().sub(halfExtent), center.clone().add(halfExtent));
}

function toothFrames(base, keys, range) {
  const direction=base.camera.directions.hero;
  const padding=base.camera.padding?.hero, portraitPadding=base.camera.portraitPadding?.hero;
  return keys.map((key,index)=>({key,at:range[index],landmark:'hero',direction,padding,portraitPadding}));
}

function flightFrames() {
  return [
    ['flight-lift', .820, [.59,.16,1], 8.9],
    ['flight-entry', .844, [.52,.20,1], 10.8],
    ['flight-pass', .884, [.21,.13,1], 12.3],
    ['flight-arc', .907, [.34,.14,1], 11.85],
    ['flight-approach', .931, [.36,.14,1], 10.8],
    ['flight-seat', .969, [.33,.11,1], 8.7],
  ].reverse().map(([key,at,direction,distance])=>({key,at:flightProgress(at),landmark:'flight',direction,distance}));
}

export function createIntroCameraOptions(base) {
  return { ...base.camera,keyframes:openingFrames(base,base.storyCamera,true) };
}

function archFrame(base,settings,{key,at,roots=false}) {
  return {key,at,landmark:roots?'full':'smile',
    direction:roots?base.camera.directions.full:settings.smileDirection,
    distance:roots?undefined:settings.smileDistanceCm,
    portraitFitAspect:roots?undefined:2.20};
}

function openingFrames(base,settings,roots) {
  const [atlasStart,atlasEnd]=STORY_TIMING.atlas;
  return [
    archFrame(base,settings,{key:'atlas-open',at:atlasStart,roots}),
    archFrame(base,settings,{key:'atlas-hold',at:atlasEnd,roots}),
  ];
}

function isolatedToothFrames(base,entryAt) {
  const boundary=DENTAL_CHAPTERS.find(chapter=>chapter.id==='hero').start;
  const transition=toothFrames(base,['isolated-tooth','transition-hold'],[entryAt,boundary])
    .map(frame=>({...frame,framing:'transition-tooth'}));
  return [...transition,...toothFrames(base,['hero','hero-hold'],STORY_TIMING.heroHold)];
}

function siteApproachFrames() {
  const locate={landmark:'neighbors',direction:[.98,.32,.82],distance:8.2,framing:'locate-molar'};
  const isolated={landmark:'hero',direction:[.96,.41,.40],framing:'teaching-molar'};
  return [
    {key:'find-six',at:STORY_TIMING.teachingSite.identify[1],...locate},
    {key:'hold-six',at:STORY_TIMING.teachingSite.identified[0],...locate},
    {key:'isolated-six',at:STORY_TIMING.teachingSite.lift[1],...isolated},
    // A single, held optical setup from the first full silhouette through
    // enamel, dentin and pulp. Manual orbit still pivots on the lifted molar.
    {key:'section-closed',at:STORY_TIMING.teachingSite.reseat[0],...isolated},
  ];
}

// The introduction still finishes front-on. Only subsequent story scroll
// turns the assembled arch, so its patient-left buccal faces become visible
// before the camera singles out 36 or moves closer.
function teachingOpeningFrames(base,settings,roots) {
  const site=STORY_TIMING.teachingSite;
  const full=(key,at)=>archFrame(base,settings,{key,at,roots});
  const oblique={...full('survey-left',site.smileTurn[1]),direction:[.98,.24,.82],distance:8.45,padding:1.22};
  return [full('atlas-open',0),full('atlas-hold',site.smileTurn[0]),oblique,
    {...oblique,key:'survey-hold',at:STORY_TIMING.atlas[1]}];
}

export function createOpeningCameraOptions(base,{compact=false}={}) {
  const settings=compact?{...base.storyCamera,...base.storyCamera.compact}:base.storyCamera;
  // The opening samples these stops in reverse. Hold the three-quarter
  // view through seating, then ease to the identical frontal atlas pose.
  const [front,seated]=STORY_TIMING.assemblyCrowns;
  const oblique=archFrame(base,settings,{key:'smile-turn',at:MathUtils.lerp(front,seated,.62)});
  oblique.direction=[.31,.10,1];
  return {...base.camera,keyframes:[...openingFrames(base,settings,false),oblique,
    ...flightFrames(),...isolatedToothFrames(base,STORY_TIMING.flight[1])]};
}

/** Measured site coordinates and a minimum viewing distance frame the macro
 * work. On narrow viewports the timeline can back up to fit the region's
 * projected width. Both final-view timelines share all seven teaching poses.
 */
export function createStoryCameraConfig(site, base, { finalView = 'smile', compact = false, crownsReady = true } = {}) {
  const settings = compact ? { ...base.storyCamera, ...base.storyCamera.compact } : base.storyCamera;
  const roots=finalView==='anatomy'||!crownsReady;
  const keyframes=[
    ...teachingOpeningFrames(base,settings,roots),...siteApproachFrames(),
  ];
  const camera={...base.camera,keyframes,followTarget:followTeachingMolar};
  if(!site)return {landmarks:{},camera};
  // The first actual bilateral bristle contact, looking in from the cheek.
  // Use the matching LOD measurements. This is the landmark for BOTH the
  // incoming camera and the working head, including manual cleaning.
  const contactKey=compact?'contactsMobile':'contacts';
  const bilateral=site.brush.centerline.find(row=>[36,37].every(fdi=>
    row[contactKey]?.some(wall=>wall.fdi===fdi && wall.distanceMm<=site.brush.dimensionsMm.bristleRadius)));
  if(!bilateral)throw new Error('The teaching camera requires a measured bilateral brush contact.');
  const contact=new Vector3().fromArray(bilateral.position);
  const molarWall=new Vector3().fromArray(bilateral[contactKey].find(wall=>wall.fdi===36).nearestWorld);
  const buccal = new Vector3().fromArray(site.basisWorld.buccal);
  const occlusal = new Vector3().fromArray(site.basisWorld.occlusal);
  const distal = new Vector3().fromArray(site.basisWorld['36DistalToward37']);
  // From the cheek and just distal, the two proximal walls separate in
  // projection. Lower the lens slightly to see beneath the contact point.
  const lateral=buccal.addScaledVector(distal, Math.tan(MathUtils.degToRad(settings.workingAzimuth))).normalize();
  const spaceDirection=lateral.clone().addScaledVector(occlusal, Math.tan(MathUtils.degToRad(4))).normalize().toArray();
  const brushDirection=lateral.clone().addScaledVector(occlusal, Math.tan(MathUtils.degToRad(settings.workingElevation))).normalize().toArray();
  const landmarks = {
    molarWall: region(molarWall, new Vector3(.47, .52, .52)),
    space: region(contact, new Vector3(0.35, 0.35, 0.49)),
    cleaning: region(contact, new Vector3(0.19, 0.13, 0.21)),
  };
  const specs = [
    ['follow-proximal-wall', STORY_TIMING.teachingSite.followSurface, 'molarWall', spaceDirection, 5.25],
    ['first-contact', STORY_TIMING.teachingSite.reseat[1], 'space', spaceDirection, settings.spaceDistanceCm],
    ['space', spaceAt, 'space', spaceDirection, settings.spaceDistanceCm],
    // The countershot is already settled before insertion. A matching
    // pose after withdrawal keeps film, bristle contact and wiped track
    // registered to the same screen pixels in either scroll direction.
    ['plaque', STORY_TIMING.teachingSite.contactHold[0], 'cleaning', brushDirection, settings.cleaningDistanceCm],
    ['result-hold', STORY_TIMING.return[0], 'cleaning', brushDirection, settings.cleaningDistanceCm],
    ['return-opening', .946, 'space', [.66,.23,1], 4.5],
    ['return-arch', .971, 'flight', [.16,.08,1], 8.8],
  ];
  // The macro sightlines were checked at the original working distances.
  // On a narrow full-stage display use an off-axis lens to compose them
  // rather than backing the camera away to fit the whole neighboring crowns.
  keyframes.push(...specs.map(([key, at, landmark, direction, distance]) => ({
    key, at, landmark, direction, distance,
    centerTarget: landmark === 'space' || landmark === 'cleaning' || landmark === 'molarWall',
    framing: landmark === 'molarWall' ? 'space' : undefined,
    minimumFitAspect: landmark === 'cleaning' ? .72 : undefined,
  })));
  // The final smile is a story beat, independent of the visitor's atlas mode.
  for (const [i,key] of ['final-smile','final-hold'].entries()) {
    const frame=archFrame(base,settings,{key,at:STORY_TIMING.finalHold[i],roots:!crownsReady});
    if(crownsReady)frame.framing='final-smile';
    keyframes.push(frame);
  }
  return { landmarks, camera };
}
