// All artistic and quality controls live here. The original viewer is independent.
export const toothConfig = {
  revision: typeof __PROTOTYPE_ASSET_REVISION__ === 'string' ? __PROTOTYPE_ASSET_REVISION__ : 'development',
  model: {
    height: 3.8,
    desktop: '../prototype-assets/molar.glb',
    compact: '../prototype-assets/molar-mobile.glb',
    expectedMeshes: 1,
  },
  renderer: { exposure: 1.08, toneMapping: 'neutral', background: '#ffffff', antialias: true },
  material: {
    enamel: { color: '#eeeae1', roughness: 0.33, ior: 1.62, normalStrength: 0.72 },
    root: { color: '#e6ddcc', roughness: 0.49, ior: 1.47, normalStrength: 0.82 },
    colorVariation: 0.014,
    roughnessVariation: 0.022,
    mapReference: { rootRoughness: 0.49, enamelRoughness: 0.29, roughnessVariation: 0.022, roughnessLimits: [0.19, 0.63] },
    occlusionStrength: 0.52,
    clearcoat: 0,
    transmission: 0,
    scattering: { fraction: 0.065, wrap: 0.18 },
    // Authored shading at an illustrative 21 mm model height, not tissue measurements.
    // The height field is bounded to ±half the corresponding amplitude.
    micro: {
      wavelengthToHeight: 0.0033, amplitudeToHeight: 0.000012, rootAmplitudeToHeight: 0.000033,
      rootAxialFrequency: 0.35, filterFootprintStart: 0.35, filterFootprintEnd: 1.0,
    },
    mesoRoughness: { wavelengthToHeight: 0.60 / 21, enamelAmplitude: 0.006, rootAmplitude: 0.010 },
    clay: { color: '#b4b2ad', roughness: 0.65 },
  },
  lighting: {
    environment: '../environment/studio-small-09-1k.hdr',
    environmentIntensity: 0.60,
    environmentRotation: 0.65,
    fallbackIntensity: 0.65,
    key: { color: '#fffcf7', intensity: 2.4, size: [4.5, 5.5], position: [-4.5, 5.5, 5] },
    fill: { color: '#ffffff', intensity: 0.65, size: [4, 6], position: [4, 2, -4] },
    overhead: { color: '#ffffff', intensity: 0.65, size: [3.5, 2.5], position: [0, 7, -1.5] },
    directional: { color: '#fffaf2', intensity: 0.75, position: [-3.8, 7, 5], shadowBias: -0.0002, shadowNormalBias: 0.025, shadowRadius: 3 },
    shadow: { opacity: 0.14, color: '#6b6256', spread: 0.08, falloff: 2.7, gap: 0.025, extentPadding: 1.5 },
  },
  camera: {
    fov: 32, near: 0.01, far: 100,
    homeDirection: [0.5, 0.72, 1], crownDirection: [0.08, 1, 0.18],
    targetOffset: [0, 0.04, 0], fitPadding: 1.16,
    minimumDistanceScale: 1.03, minimumDistanceGap: 0.08, maxDistanceFactor: 2.5,
    footerBreakpoint: 600, footerReservePx: 74, footerReserveMaxFraction: 0.12,
  },
  interaction: {
    damping: true, dampingFactor: 0.08, rotateSpeed: 0.65, zoomSpeed: 0.7,
    minPolarAngle: 0.04, maxPolarAngle: 3.10,
    keyboardAzimuthStep: 0.12, keyboardPolarStep: 0.10, keyboardZoomFactor: 0.88,
  },
  quality: {
    compactMedia: '(max-width: 600px), (pointer: coarse) and (max-width: 1100px)',
    desktop: { pixelRatioCap: 1.75, transmissionScale: 1, shadowMapSize: 2048, contactSize: 1024, anisotropy: 8, frameBudgetMs: 20 },
    compact: { pixelRatioCap: 1.5, transmissionScale: 0.65, shadowMapSize: 1024, contactSize: 512, anisotropy: 4, frameBudgetMs: 32 },
    adaptive: { enabled: true, interactionPixelRatioCap: 1.5, interactionTransmissionScale: 0.65, minimumPixelRatio: 0.85, frameBudgetMs: 30, sampleCount: 24, slowFraction: 0.65, reductionFactor: 0.82, warmupFrames: 6, restoreDelayMs: 160 },
  },
};
