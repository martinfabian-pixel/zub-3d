import { Box3, MathUtils, Spherical, Vector3 } from 'three';

function adjustDirection(direction, yawDegrees, pitchDegrees) {
  const spherical = new Spherical().setFromVector3(direction);
  spherical.theta += MathUtils.degToRad(yawDegrees);
  spherical.phi -= MathUtils.degToRad(pitchDegrees);
  return new Vector3().setFromSpherical(spherical).normalize().toArray();
}

function region(center, halfExtent) {
  return new Box3(center.clone().sub(halfExtent), center.clone().add(halfExtent));
}

/** Measured site coordinates and a minimum viewing distance frame the macro
 * work. On narrow viewports the timeline can back up to fit the region's
 * projected width. Both final-view timelines share all seven teaching poses.
 */
export function createStoryCameraConfig(site, base, { finalView = 'smile', compact = false } = {}) {
  const settings = compact ? { ...base.storyCamera, ...base.storyCamera.compact } : base.storyCamera;
  const lesion = new Vector3().fromArray(site.lesion.centerWorldCm);
  const gap = new Vector3().fromArray(site.tightestGapFocusWorldCm);
  const entry = new Vector3().fromArray(site.brush.centerline[0].position);
  const buccal = new Vector3().fromArray(site.basisWorld.buccal);
  const occlusal = new Vector3().fromArray(site.basisWorld.occlusal);
  const distal = new Vector3().fromArray(site.basisWorld['36DistalToward37']);
  const macro = new Vector3().fromArray(site.lesion.macroCamera.directionFromLesionToCameraWorld).normalize();
  const spaceDirection = buccal.clone().addScaledVector(occlusal, settings.spaceOcclusalAngle).addScaledVector(distal, 0.19).normalize().toArray();

  // These volumes live at the actual contact and insertion side. No tooth
  // or instrument can be displaced to satisfy the photography.
  const space = gap.clone().lerp(lesion, 0.45).addScaledVector(occlusal, settings.spaceOcclusalShiftCm);
  const plaque = lesion.clone().addScaledVector(occlusal, -0.035);
  const cleaning = lesion.clone().lerp(entry, settings.cleaningEntryFraction);
  const result = lesion.clone().addScaledVector(occlusal, -settings.resultApicalShiftCm);
  const landmarks = {
    space: region(space, new Vector3(0.35, 0.35, 0.49)),
    plaque: region(plaque, new Vector3(0.13, 0.19, 0.32)),
    detail: region(lesion, new Vector3(0.10, 0.14, 0.25)),
    cleaning: region(cleaning, new Vector3(0.33, 0.21, 0.37)),
    result: region(result, new Vector3(0.11, 0.17, 0.27)),
  };
  const brushDirection = adjustDirection(macro, -5, 8);
  const resultDirection = adjustDirection(macro, -4, -1);
  const specs = [
    ['hero', 0.045, 'hero', base.camera.directions.hero],
    ['neighbors', 0.145, 'neighbors', settings.neighborDirection],
    ['space', 0.21, 'space', spaceDirection, settings.spaceDistanceCm],
    ['plaque', 0.33, 'plaque', adjustDirection(macro, -4, 4), settings.plaqueDistanceCm],
    ['lesion', 0.47, 'detail', adjustDirection(macro, settings.lesionYawDegrees, 0), settings.detailDistanceCm],
    ['brush', 0.515, 'cleaning', brushDirection, settings.cleaningDistanceCm],
    ['withdrawn', 0.72, 'cleaning', brushDirection, settings.cleaningDistanceCm],
    ['result', 0.76, 'result', resultDirection, settings.resultDistanceCm],
    ['result-hold', 0.80, 'result', resultDirection, settings.resultDistanceCm],
    ['neighbors-return', 0.835, 'neighbors', settings.neighborDirection],
    ['arch', 0.895, 'arch', base.camera.directions.arch],
    ['full', 0.96, finalView === 'anatomy' ? 'full' : 'smile',
      finalView === 'anatomy' ? base.camera.directions.full : settings.smileDirection],
  ];
  const keyframes = specs.map(([key, at, landmark, direction, distance]) => ({ key, at, landmark, direction, distance }));
  if(finalView === 'smile') {
    const final=keyframes.at(-1);
    final.padding=base.smileFraming.desktopPadding;
    final.portraitPadding=base.smileFraming.portraitPadding;
  }
  return { landmarks, camera: { ...base.camera, keyframes } };
}
