import * as THREE from 'three';

export function createScene(canvas, config, profile) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: config.renderer.antialias, powerPreference: 'high-performance' });
  renderer.setPixelRatio(profile.pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = config.renderer.toneMapping === 'aces' ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
  renderer.toneMappingExposure = config.renderer.exposure;
  renderer.transmissionResolutionScale = profile.transmissionScale;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.info.autoReset = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(config.renderer.background);
  return { renderer, scene };
}

// Own every unique GPU object once, including GLTFLoader ImageBitmaps.
export function disposeObject(root) {
  if (!root) return;
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    for (const uniform of Object.values(material.userData.ownedUniforms ?? {})) if (uniform.value?.isTexture) textures.add(uniform.value);
    material.dispose();
  }
  const images = new Set();
  for (const texture of textures) { if (texture.source?.data?.close) images.add(texture.source.data); texture.dispose(); }
  for (const image of images) image.close();
  for (const geometry of geometries) geometry.dispose();
  root.removeFromParent();
}
