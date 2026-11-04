import { DENTAL_CHAPTERS } from './story-config.js';
import { toothConfig } from '../prototype/config.js';

// The approved single-tooth viewer is imported read-only. Nothing in its
// configuration, material implementation or published assets is mutated.
export const experienceConfig = {
  ...structuredClone(toothConfig),
  revision: typeof __DENTITION_ASSET_REVISION__ === 'string' ? __DENTITION_ASSET_REVISION__ : 'development',
  storyRevision:typeof __STORY_ASSET_REVISION__==='string'?__STORY_ASSET_REVISION__:'development',
  // Authoring endpoints, not a public UI switch. Reversing these later reverses
  // the same camera/reveal architecture without reassembling another scene.
  story: { startProgress: 0, endProgress: 1 },
  assets: {
    manifest: 'dentition-assets/manifest.json',
    desktop: 'dentition-assets/dentition.glb',
    compact: 'dentition-assets/dentition-mobile.glb',
    heroDesktop: 'dentition-assets/hero-36.glb',
    heroCompact: 'dentition-assets/hero-36-mobile.glb',
    upperDesktop: 'prototype-assets/molar.glb',
    upperCompact: 'prototype-assets/molar-mobile.glb',
  },
  model: { ...structuredClone(toothConfig.model), height: 2.1, expectedMeshes: 1 },
  anatomy: {
    hero: 36,
    neighbors: [35, 36, 37],
    // The mandibular teaching site stays fixed. Only the complete upper
    // arch approaches it during the final frontal composition.
    upperOffset: [0, 0.32, 0], lowerOffset: [0, -0.48, 0],
    smileClosureCm: 0.58, smileClosureRange: [0.89, 0.96],
  },
  reveal: {
    neighbors: { start: 0.12, end: 0.33 },
    arch: { start: 0.34, end: 0.61, stagger: 0.09 },
    opposite: { start: 0.66, end: 0.85, stagger: 0.035 },
  },
  camera: {
    fov: 32, near: 0.012, far: 150,
    stops: { hero: 0.055, neighbors: 0.34, arch: 0.64, full: 0.88 },
    directions: { hero: [1, 0.65, 0.35], neighbors: [0.8, 0.8, 0.65], arch: [0.32, 1.10, 1], full: [0.58, 0.10, 1] },
    padding: { hero: 1.12, neighbors: 1.12, arch: 1.10, full: 1.10 },
    portraitPadding: { hero: 1.10, neighbors: 1.10, arch: 1.08, full: 1.08 },
  },
  material: {
    ...structuredClone(toothConfig.material),
    enamel: { ...toothConfig.material.enamel, color: '#f2f0eb', roughness: 0.31 },
    root: { ...toothConfig.material.root, color: '#e8e1d5', roughness: 0.54 },
    occlusionStrength: 0.33,
  },
  lighting: { ...structuredClone(toothConfig.lighting), environment: 'environment/studio-small-09-1k.hdr' },
  studio: {
    key: { color: '#fffefd', intensity: 2.55, size: [4, 5.25], position: [4.8, 5.2, 3.4] },
    fill: { color: '#ffffff', intensity: 0.72, size: [5, 6], position: [-4, 1, 4] },
    rim: { color: '#ffffff', intensity: 0.76, size: [3.5, 2.5], position: [-1, 5, -3.5] },
    directional: { color: '#fffefd', intensity: 0.58, position: [3.8, 7, 2], shadowBias: -0.00012, shadowNormalBias: 0.006, shadowRadius: 3 },
    referenceRadius: 1.15,
  },
  quality: {
    ...structuredClone(toothConfig.quality),
    desktop: { ...structuredClone(toothConfig.quality.desktop), pixelRatioCap: 1.5, shadowMapSize: 2048 },
    compact: { ...structuredClone(toothConfig.quality.compact), pixelRatioCap: 1.35, shadowMapSize: 1024 },
  },
  interaction: {
    ...structuredClone(toothConfig.interaction),
    minimumDistanceFraction: 0.68, maximumDistanceFraction: 1.7,
    returnDurationMs: 480, dampingMs: 45, handoverScrollPx: 64, gestureRotateSpeed: 0.65,
  },
  storyCamera: {
    neighborDirection: [0.84, 0.72, 0.48], smileDirection: [0.035, 0.045, 1],
    spaceDistanceCm: 3.35, plaqueDistanceCm: 2.40, detailDistanceCm: 1.94,
    cleaningDistanceCm: 3.35, resultDistanceCm: 2.17,
    spaceOcclusalShiftCm: 0.035, spaceOcclusalAngle: 0.77,
    lesionYawDegrees: 0, cleaningEntryFraction: 0.43, resultApicalShiftCm: 0.018,
    compact: {
      spaceDistanceCm: 3.54, plaqueDistanceCm: 2.23, detailDistanceCm: 1.69,
      cleaningDistanceCm: 3.35, resultDistanceCm: 1.89,
      spaceOcclusalShiftCm: -0.040, spaceOcclusalAngle: 0.60,
      lesionYawDegrees: 2, cleaningEntryFraction: 0.52, resultApicalShiftCm: 0.030,
    },
  },
  smileFraming: {
    desktopPadding: 1.34, portraitPadding: 1.04,
    arrival: [0.93, 0.98], featherFraction: 0.29, releaseMs: 120,
  },
  caries: {chalk:'#f8f2df',floor:'#927157',margin:'#c5ad84'},
  assetsStory: {site:'story-assets/site.json',caries:'story-assets/caries-36.json'},
  presentation: { steps:DENTAL_CHAPTERS.map((ch,i)=>({...ch,eyebrow:ch.label.toUpperCase(),mobileTitle:ch.title,mobileDescription:ch.text,meta:i===0?'FDI 36 · dolná ľavá · 2 korene':i===6?'28 trvalých zubov · bez osmičiek':'Priestor medzi 36 a 37',next:i===6?'Späť na ukážku čistenia':'Pokračovať',subject:i===0?'Dolná ľavá prvá stolička':i===6?'Starostlivosť o celý chrup':'Medzizubný priestor 36–37'})) },
};
