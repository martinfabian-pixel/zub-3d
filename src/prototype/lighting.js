import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadBinary } from './binary.js';

export async function createLighting(scene, renderer, config, profile, signal) {
  const lights = [];
  const settings = config.lighting;
  RectAreaLightUniformsLib.init();
  for (const specification of [settings.key, settings.fill, settings.overhead]) {
    const light = new THREE.RectAreaLight(specification.color, specification.intensity, ...specification.size);
    light.position.set(...specification.position);
    light.lookAt(0, 0.25, 0);
    scene.add(light);
    lights.push(light);
  }
  const key = new THREE.DirectionalLight(settings.directional.color, settings.directional.intensity);
  key.position.set(...settings.directional.position);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(config.quality[profile.compact ? 'compact' : 'desktop'].shadowMapSize);
  Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 18 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = settings.directional.shadowBias;
  key.shadow.normalBias = settings.directional.shadowNormalBias;
  key.shadow.radius = settings.directional.shadowRadius;
  scene.add(key, key.target);
  lights.push(key, key.target);

  const pmrem = new THREE.PMREMGenerator(renderer);
  let source;
  let target;
  let label = 'Poly Haven Studio Small 09 — CC0';
  try {
    const url = new URL(settings.environment, document.baseURI);
    url.searchParams.set('v', config.revision);
    source = new HDRLoader().createDataTexture(await loadBinary(url.href, signal));
    if (signal?.aborted) throw new DOMException('Viewer disposed', 'AbortError');
    target = pmrem.fromEquirectangular(source);
    scene.environmentIntensity = settings.environmentIntensity;
  } catch (error) {
    if (signal?.aborted) {
      key.shadow.dispose();
      for (const light of lights) light.removeFromParent();
      throw error;
    }
    let room;
    try { room = new RoomEnvironment(); target = pmrem.fromScene(room); }
    catch (fallbackError) { key.shadow.dispose(); for (const light of lights) light.removeFromParent(); throw fallbackError; }
    finally { room?.dispose(); }
    label = 'Three.js generated room fallback — MIT';
    scene.environmentIntensity = settings.fallbackIntensity;
  } finally {
    source?.dispose();
    pmrem.dispose();
  }
  scene.environment = target.texture;
  scene.environmentRotation.y = settings.environmentRotation;
  let disposed = false;
  return {
    label,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (scene.environment === target.texture) scene.environment = null;
      target.dispose();
      key.shadow.dispose();
      for (const light of lights) light.removeFromParent();
    },
  };
}
