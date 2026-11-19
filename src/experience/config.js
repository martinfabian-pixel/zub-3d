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
    // arch approaches it during the crown-only smile compositions.
    upperOffset: [0, 0.32, 0], lowerOffset: [0, -0.48, 0],
    smileClosureCm: 0.58,
  },
  camera: {
    fov: 32, near: 0.012, far: 150,
    directions: { hero: [1, 0.65, 0.35], neighbors: [0.8, 0.8, 0.65], arch: [0.32, 1.10, 1], full: [0.58, 0.10, 1] },
    padding: { hero: 1.12, neighbors: 1.12, arch: 1.10, full: 1.10 },
    portraitPadding: { hero: 1.10, neighbors: 1.10, arch: 1.08, full: 1.08 },
    // Focus x/y are fractions of the whole stage. Optical magnification is
    // separate from orbital distance so the measured proximal sightline holds.
    framing: {
      hero:      {desktop:[.73,.52,.80],portrait:[.595,.52,.88],shortPortrait:[.67,.55,.65]},
      'locate-molar': {desktop:[.75,.63,.64],portrait:[.53,.62,.69],shortPortrait:[.55,.61,.53]},
      'root-window': {desktop:[.70,.55,.77],portrait:[.50,.59,.73],shortPortrait:[.52,.61,.58]},
      'transition-tooth': {desktop:[.73,.52,.75],portrait:[.595,.55,.84],shortPortrait:[.64,.58,.64]},
      'anatomy-tooth': {desktop:[.70,.53,.74],portrait:[.52,.615,.72],shortPortrait:[.53,.635,.58]},
      'anatomy-pulp':  {desktop:[.70,.53,.81],portrait:[.52,.615,.79],shortPortrait:[.53,.635,.64]},
      neighbors: {desktop:[.69,.54,.68],portrait:[.61,.59,.82]},
      space:     {desktop:[.68,.54,.65],portrait:[.65,.58,.66]},
      plaque:    {desktop:[.69,.54,.65],portrait:[.64,.58,.67]},
      cleaning:  {desktop:[.62,.57,1.02],portrait:[.68,.59,.69]},
      result:    {desktop:[.69,.53,.68],portrait:[.61,.57,.68]},
      arch:      {desktop:[.71,.55,.70],portrait:[.51,.58,.91]},
      full:      {desktop:[.70,.54,.74],portrait:[.51,.58,.91]},
      flight:    {desktop:[.55,.50,.76],portrait:[.50,.52,.87]},
      smile:     {desktop:[.67,.51,.87],portrait:[.50,.57,.325]},
    },
  },
  material: {
    ...structuredClone(toothConfig.material),
    enamel: { ...toothConfig.material.enamel, color: '#f2f0eb', roughness: 0.285, normalStrength: 0.83 },
    root: { ...toothConfig.material.root, color: '#e8e1d5', roughness: 0.54 },
    occlusionStrength: 0.33,
    micro: { ...toothConfig.material.micro, amplitudeToHeight: 0.000015 },
    mesoRoughness: { ...toothConfig.material.mesoRoughness, enamelAmplitude: 0.009 },
  },
  lighting: { ...structuredClone(toothConfig.lighting), environment: 'environment/studio-small-09-1k.hdr' },
  studio: {
    key: { color: '#fffefd', intensity: 2.82, size: [3.6, 5.9], position: [3.65, 4.4, 4.75] },
    fill: { color: '#f7fbff', intensity: 0.62, size: [5, 6], position: [-4, 1, 4] },
    rim: { color: '#ffffff', intensity: 0.76, size: [3.5, 2.5], position: [-1, 5, -3.5] },
    directional: { color: '#fffefd', intensity: 0.64, position: [2.7, 6.5, 4.4], shadowBias: -0.00012, shadowNormalBias: 0.006, shadowRadius: 3 },
    referenceRadius: 1.15,
  },
  quality: {
    ...structuredClone(toothConfig.quality),
    desktop: { ...structuredClone(toothConfig.quality.desktop), pixelRatioCap: 1.75, shadowMapSize: 2048 },
    compact: { ...structuredClone(toothConfig.quality.compact), pixelRatioCap: 2.0, shadowMapSize: 1024 },
    adaptive: { ...structuredClone(toothConfig.quality.adaptive), interactionPixelRatioCap: 1.35 },
  },
  interaction: {
    ...structuredClone(toothConfig.interaction),
    minimumDistanceFraction: 0.68, maximumDistanceFraction: 1.7,
    returnDurationMs: 480, dampingMs: 45, handoverScrollPx: 64, gestureRotateSpeed: 0.65,
  },
  storyCamera: {
    smileDirection: [0.040, 0.018, 1],
    smileDistanceCm: 6.6,
    spaceDistanceCm: 3.35, plaqueDistanceCm: 2.14,
    cleaningDistanceCm: 2.27, resultDistanceCm: 1.58,
    spaceOcclusalAngle: 0.77,
    resultYawDegrees: -5, resultPitchDegrees: 0,
    brushYawDegrees: 19, brushPitchDegrees: 5, brushSweepYawDegrees: -60, brushSweepPitchDegrees: 3,
    resultApicalShiftCm: 0.014,
    compact: {
      smileDistanceCm: 6.6,
      spaceDistanceCm: 3.54, plaqueDistanceCm: 2.01,
      // Leave a short length of the purple ferrule in frame to show which
      // way the fine filaments enter the contact on the narrow sensor.
      cleaningDistanceCm: 3.45, resultDistanceCm: 1.41,
      brushYawDegrees: 0, brushPitchDegrees: 0, brushSweepYawDegrees: -12, brushSweepPitchDegrees: 6,
      spaceOcclusalAngle: 0.60,
      resultApicalShiftCm: 0.012,
    },
  },
  smileMaterial: {enamelColor:'#f6f5f1',roughness:.31,occlusionStrength:.27},
  plaque: {tint:'#b88f9b',warmTint:'#cda6ac'},
  brush: {handleColor:'#8450c8',ferruleColor:'#654099'},
  assetsStory: {site:'story-assets/site.json'},
  presentation: { steps:DENTAL_CHAPTERS.map(ch=>{
    const tooth=ch.id==='assembly'||ch.id==='hero'||ch.id==='anatomy';
    const arch=ch.id==='dentition';
    return {...ch,eyebrow:ch.label.toUpperCase(),mobileTitle:ch.title,mobileDescription:ch.text,
      meta:tooth?'FDI 36 · dolná ľavá · 2 korene':arch?'28 trvalých zubov · bez osmičiek':'Priestor medzi 36 a 37',
      next:'Pokračovať',subject:tooth?'Dolná ľavá prvá stolička':arch?'Horný a dolný zubný oblúk':'Medzizubný priestor 36–37'};
  }) },
};
