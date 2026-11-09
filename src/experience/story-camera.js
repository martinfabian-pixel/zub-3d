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
    cleaning: region(cleaning, new Vector3(0.19, 0.13, 0.21)),
    result: region(result, new Vector3(0.11, 0.17, 0.27)),
  };
  // Turn toward the side of the working head. Looking along the wire hides
  // the filaments behind the grip. The cavity view stays on the 36 side
  // of this angle to keep the proximal opening in view.
  const brushDirection = adjustDirection(macro, settings.brushYawDegrees, settings.brushPitchDegrees);
  const brushSideDirection = adjustDirection(macro,
    settings.brushYawDegrees + (settings.brushSweepYawDegrees ?? 0),
    settings.brushPitchDegrees + (settings.brushSweepPitchDegrees ?? 0));
  const lesionDirection = adjustDirection(macro, settings.lesionYawDegrees, settings.lesionPitchDegrees);
  const specs = [
    ['hero', 0.045, 'hero', base.camera.directions.hero],
    ['neighbors', 0.145, 'neighbors', settings.neighborDirection],
    ['space', 0.21, 'space', spaceDirection, settings.spaceDistanceCm],
    // Look slightly across the contact so the deliberately disclosed,
    // brush-reachable film is visible instead of hidden behind tooth 37.
    ['plaque', 0.33, 'plaque', adjustDirection(macro, -21, 4), settings.plaqueDistanceCm],
    ['lesion', 0.47, 'detail', lesionDirection, settings.detailDistanceCm],
    ['lesion-hold', 0.48, 'detail', lesionDirection, settings.detailDistanceCm],
    ['brush', 0.515, 'cleaning', brushDirection, settings.cleaningDistanceCm],
    // The orbit starts after the first cleaning strokes. Both poses use the
    // same measured contact region and return before the result close-up.
    ['brush-orbit-start', 0.62, 'cleaning', brushDirection, settings.cleaningDistanceCm],
    ['brush-orbit-side', 0.667, 'cleaning', brushSideDirection, settings.cleaningDistanceCm],
    ['brush-orbit-hold', 0.676, 'cleaning', brushSideDirection, settings.cleaningDistanceCm],
    ['withdrawn', 0.72, 'cleaning', brushDirection, settings.cleaningDistanceCm],
    ['result', 0.76, 'result', lesionDirection, settings.resultDistanceCm],
    ['result-hold', 0.80, 'result', lesionDirection, settings.resultDistanceCm],
    ['flight-entry', 0.844, 'flight', [.52,.20,1], 10.8],
    ['flight-pass', 0.884, 'flight', [.21,.13,1], 12.3],
    ['flight-approach', 0.931, 'flight', [.09,.075,1], 10.8],
    ['full', 0.988, finalView === 'anatomy' ? 'full' : 'smile',
      finalView === 'anatomy' ? base.camera.directions.full : settings.smileDirection,
      finalView === 'anatomy' ? undefined : settings.smileDistanceCm],
  ];
  // The macro sightlines were checked at the original working distances.
  // On a narrow full-stage display use an off-axis lens to compose them
  // rather than backing the camera away to fit the whole neighboring crowns.
  const keyframes = specs.map(([key, at, landmark, direction, distance]) => ({
    key, at, landmark, direction, distance,
    minimumFitAspect: ['detail','cleaning','result'].includes(landmark) ? .72 : undefined,
    portraitFitAspect: landmark==='smile' ? 2.20 : undefined,
  }));
  return { landmarks, camera: { ...base.camera, keyframes } };
}
