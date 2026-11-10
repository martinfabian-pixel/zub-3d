import { Box3, MathUtils, Spherical, Vector3 } from 'three';
import { DENTAL_CHAPTERS, STORY_TIMING, brushProgress } from './story-config.js';
import { flightProgress } from './floating-teeth.js';

const spaceAt = DENTAL_CHAPTERS.find(chapter => chapter.id === 'space').at;
const plaqueAt = DENTAL_CHAPTERS.find(chapter => chapter.id === 'plaque').at;

function adjustDirection(direction, yawDegrees, pitchDegrees) {
  const spherical = new Spherical().setFromVector3(direction);
  spherical.theta += MathUtils.degToRad(yawDegrees);
  spherical.phi -= MathUtils.degToRad(pitchDegrees);
  return new Vector3().setFromSpherical(spherical).normalize().toArray();
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
    ['flight-arc', .907, [.145,.10,1], 11.85],
    ['flight-approach', .931, [.09,.075,1], 10.8],
    ['flight-seat', .969, [.057,.032,1], 8.7],
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

function isolatedToothFrames(base) {
  const boundary=DENTAL_CHAPTERS.find(chapter=>chapter.id==='hero').start;
  const transition=toothFrames(base,['flight-tooth','transition-hold'],[STORY_TIMING.flight[1],boundary])
    .map(frame=>({...frame,framing:'transition-tooth'}));
  return [...transition,...toothFrames(base,['hero','hero-hold'],STORY_TIMING.heroHold)];
}

function anatomyFrames() {
  // Along the broad buccal face of FDI 36. The opening and the first two
  // anatomical layers share an angle so the view cannot outrun the cut.
  const direction=[.90,.22,.43];
  const body={landmark:'hero',framing:'anatomy-tooth',direction};
  const pulp={landmark:'hero',framing:'anatomy-pulp',direction,targetOffset:[0,.055,0]};
  return [
    {key:'anatomy-tooth',at:.466,...body},
    {key:'enamel-hold',at:.505,...body},
    {key:'anatomy-pulp',at:.554,...pulp},
    {key:'pulp-hold',at:.562,...pulp},
    {key:'anatomy-close',at:.590,...body},
    {key:'closed-tooth',at:.594,...body},
  ];
}

/** Measured site coordinates and a minimum viewing distance frame the macro
 * work. On narrow viewports the timeline can back up to fit the region's
 * projected width. Both final-view timelines share all seven teaching poses.
 */
export function createStoryCameraConfig(site, base, { finalView = 'smile', compact = false, crownsReady = true } = {}) {
  const settings = compact ? { ...base.storyCamera, ...base.storyCamera.compact } : base.storyCamera;
  const roots=finalView==='anatomy'||!crownsReady;
  const keyframes=[
    ...openingFrames(base,settings,roots),...flightFrames(),...isolatedToothFrames(base),
    ...anatomyFrames(),
  ];
  if(!site)return {landmarks:{},camera:{...base.camera,keyframes}};
  const surface = new Vector3().fromArray(site.teachingSurfaceWorldCm);
  const gap = new Vector3().fromArray(site.tightestGapFocusWorldCm);
  const entry = new Vector3().fromArray(site.brush.centerline[0].position);
  const buccal = new Vector3().fromArray(site.basisWorld.buccal);
  const occlusal = new Vector3().fromArray(site.basisWorld.occlusal);
  const distal = new Vector3().fromArray(site.basisWorld['36DistalToward37']);
  const macro = buccal.clone().addScaledVector(occlusal, .2).addScaledVector(distal, .6).normalize();
  const spaceDirection = buccal.clone().addScaledVector(occlusal, settings.spaceOcclusalAngle).addScaledVector(distal, 0.19).normalize().toArray();

  // These volumes live at the actual contact and insertion side. No tooth
  // or instrument can be displaced to satisfy the photography.
  const space = gap.clone().lerp(surface, 0.45).addScaledVector(occlusal, settings.spaceOcclusalShiftCm);
  const plaque = surface.clone().addScaledVector(occlusal, -0.035);
  const cleaning = surface.clone().lerp(entry, settings.cleaningEntryFraction);
  const result = surface.clone().addScaledVector(occlusal, -settings.resultApicalShiftCm);
  const landmarks = {
    space: region(space, new Vector3(0.35, 0.35, 0.49)),
    plaque: region(plaque, new Vector3(0.13, 0.19, 0.32)),
    cleaning: region(cleaning, new Vector3(0.19, 0.13, 0.21)),
    result: region(result, new Vector3(0.11, 0.17, 0.27)),
  };
  // Turn toward the side of the working head. Looking along the wire hides
  // the filaments behind the grip. Frame the healthy contact from the same
  // side before and after the brushing sequence.
  const brushDirection = adjustDirection(macro, settings.brushYawDegrees, settings.brushPitchDegrees);
  const brushSideDirection = adjustDirection(macro,
    settings.brushYawDegrees + (settings.brushSweepYawDegrees ?? 0),
    settings.brushPitchDegrees + (settings.brushSweepPitchDegrees ?? 0));
  const resultDirection = adjustDirection(macro, settings.resultYawDegrees, settings.resultPitchDegrees);
  const specs = [
    ['neighbors', .624, 'neighbors', settings.neighborDirection],
    ['space', spaceAt, 'space', spaceDirection, settings.spaceDistanceCm],
    // Look slightly across the contact so the deliberately disclosed,
    // brush-reachable film is visible instead of hidden behind tooth 37.
    ['plaque', plaqueAt, 'plaque', adjustDirection(macro, -21, 4), settings.plaqueDistanceCm],
    ['brush', brushProgress(.515), 'cleaning', brushDirection, settings.cleaningDistanceCm],
    // The orbit starts after the first cleaning strokes. Both poses use the
    // same measured contact region and return before the result close-up.
    ['brush-orbit-start', brushProgress(.62), 'cleaning', brushDirection, settings.cleaningDistanceCm],
    ['brush-orbit-side', brushProgress(.667), 'cleaning', brushSideDirection, settings.cleaningDistanceCm],
    ['brush-orbit-hold', brushProgress(.676), 'cleaning', brushSideDirection, settings.cleaningDistanceCm],
    ['withdrawn', brushProgress(.72), 'cleaning', brushDirection, settings.cleaningDistanceCm],
    ['result', STORY_TIMING.resultAt, 'result', resultDirection, settings.resultDistanceCm],
    ['result-hold', STORY_TIMING.return[0], 'result', resultDirection, settings.resultDistanceCm],
    ['return-opening', .946, 'space', [.66,.23,1], 4.5],
    ['return-arch', .971, 'flight', [.16,.08,1], 8.8],
  ];
  // The macro sightlines were checked at the original working distances.
  // On a narrow full-stage display use an off-axis lens to compose them
  // rather than backing the camera away to fit the whole neighboring crowns.
  keyframes.push(...specs.map(([key, at, landmark, direction, distance]) => ({
    key, at, landmark, direction, distance,
    minimumFitAspect: ['cleaning','result'].includes(landmark) ? .72 : undefined,
  })));
  // The final smile is a story beat, independent of the visitor's atlas mode.
  keyframes.push(
    archFrame(base,settings,{key:'final-smile',at:STORY_TIMING.finalHold[0],roots:!crownsReady}),
    archFrame(base,settings,{key:'final-hold',at:STORY_TIMING.finalHold[1],roots:!crownsReady}),
  );
  return { landmarks, camera: { ...base.camera, keyframes } };
}
