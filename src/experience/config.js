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
    // The lower arch defines the registered brush site. The inspection lift
    // is applied to 36 separately and is zero again before cleaning.
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
      'teaching-molar': {desktop:[.69,.51,.84],portrait:[.51,.582,.86],shortPortrait:[.52,.59,.64]},
      'transition-tooth': {desktop:[.73,.52,.75],portrait:[.595,.55,.84],shortPortrait:[.64,.58,.64]},
      neighbors: {desktop:[.69,.54,.68],portrait:[.61,.59,.82]},
      space:     {desktop:[.68,.54,.65],portrait:[.65,.58,.66]},
      cleaning:  {desktop:[.69,.55,1.0],portrait:[.585,.615,.82]},
      arch:      {desktop:[.71,.55,.70],portrait:[.51,.58,.91]},
      full:      {desktop:[.70,.54,.74],portrait:[.51,.58,.91]},
      flight:    {desktop:[.55,.50,.76],portrait:[.50,.52,.87]},
      mapLower:  {desktop:[.67,.56,.77],portrait:[.50,.55,.93],shortPortrait:[.50,.54,.83]},
      map:       {desktop:[.68,.45,.66],portrait:[.50,.47,.96],shortPortrait:[.50,.432,.68]},
      smile:     {desktop:[.67,.51,.87],portrait:[.50,.57,.298]},
      'final-smile': {desktop:[.67,.445,.88],portrait:[.50,.455,.318],shortPortrait:[.50,.54,.318],
        portraitZoomAspect:390/844},
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
  lighting: { ...structuredClone(toothConfig.lighting), environment: 'environment/studio-small-09-1k.hdr',
    environmentIntensity: .47, fallbackIntensity: .50 },
  studio: {
    key: { color: '#fffdf9', intensity: 4.1, size: [2.9, 6.4], position: [-3.8, 3.3, 4.9] },
    fill: { color: '#eef7ff', intensity: 2.25, size: [3.05, 5.8], position: [4.8, .65, 2.8] },
    rim: { color: '#f4faff', intensity: 1.21, size: [3.4, 2.8], position: [2.5, 4.2, -2.8] },
    directional: { color: '#fffdf9', intensity: .58, position: [-3.0, 6.0, 4.4], shadowBias: -0.00012, shadowNormalBias: 0.006, shadowRadius: 3 },
    smileKey: { position: [-2.65,2.45,4.65], size: [3.6,4.4], intensity: 4.05 },
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
    spaceDistanceCm: 3.65, cleaningDistanceCm: 2.45,
    // Allow the ferrule to exit above the desktop copy, or through the
    // side of a portrait frame with room for the working head underneath.
    workingAzimuth: 29, workingElevation: -23,
    compact: {
      smileDistanceCm: 6.6,
      spaceDistanceCm: 3.65, cleaningDistanceCm: 2.72, workingAzimuth: 27, workingElevation: -15,
    },
  },
  smileMaterial: {enamelColor:'#f8f8f8',roughness:.305,occlusionStrength:.28},
  plaque: {tint:'#9b647d',warmTint:'#bb868a'},
  brush: {handleColor:'#8450c8',ferruleColor:'#654099'},
  assetsStory: {site:'story-assets/site.json'},
  presentation: { steps:DENTAL_CHAPTERS.map(ch=>{
    const tooth=ch.id==='assembly'||ch.id==='hero'||ch.id==='anatomy';
    const arch=['dentition','map','closing'].includes(ch.id);
    return {...ch,eyebrow:ch.label.toUpperCase(),mobileTitle:ch.title,mobileDescription:ch.text,
      meta:tooth?'FDI 36 · dolná ľavá · 2 korene':arch?'28 trvalých zubov · bez osmičiek':'Priestor medzi 36 a 37',
      next:'Pokračovať',subject:tooth?'Dolná ľavá prvá stolička':arch?'Horný a dolný zubný oblúk':'Medzizubný priestor 36–37'};
  }) },
};
