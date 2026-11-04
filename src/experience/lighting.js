import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadBinary } from '../prototype/binary.js';

/** One soft studio rig. Scale/aim follows the inspected region, not the teeth. */
export async function createLighting(scene, renderer, config, profile, signal) {
  RectAreaLightUniformsLib.init();
  const settings = config.studio;
  const areas = [settings.key, settings.fill, settings.rim].map((s) => {
    const light = new THREE.RectAreaLight(s.color, s.intensity, ...s.size);
    scene.add(light);
    return { light, specification: s };
  });
  const direct = new THREE.DirectionalLight(settings.directional.color, settings.directional.intensity);
  direct.castShadow = true;
  direct.shadow.mapSize.setScalar(profile.shadowMapSize);
  Object.assign(direct.shadow, {
    bias: settings.directional.shadowBias,
    normalBias: settings.directional.shadowNormalBias,
    radius: settings.directional.shadowRadius,
  });
  scene.add(direct, direct.target);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let target, source, label = 'Poly Haven Studio Small 09 — CC0', disposed = false;
  const offset = new THREE.Vector3();

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (scene.environment === target?.texture) scene.environment = null;
    target?.dispose(); direct.shadow.dispose();
    direct.removeFromParent(); direct.target.removeFromParent();
    for (const { light } of areas) light.removeFromParent();
  }
  try {
    try {
      const url = new URL(config.lighting.environment, config.assetBaseURL ?? document.baseURI);
      source = new HDRLoader().createDataTexture(await loadBinary(url.href, signal));
      if (signal?.aborted) throw new DOMException('Journey disposed', 'AbortError');
      target = pmrem.fromEquirectangular(source);
      scene.environmentIntensity = config.lighting.environmentIntensity;
    } catch (error) {
      if (signal?.aborted) throw error;
      const room = new RoomEnvironment();
      try { target = pmrem.fromScene(room); } finally { room.dispose(); }
      label = 'Generated Three.js studio fallback — MIT';
      scene.environmentIntensity = config.lighting.fallbackIntensity;
    }
    scene.environment = target.texture;
    scene.environmentRotation.y = config.lighting.environmentRotation;
    return {
      label, dispose,
      update(center, radius) {
        const scale = Math.max(0.5, radius / settings.referenceRadius);
        for (const { light, specification } of areas) {
          light.position.copy(center).add(offset.fromArray(specification.position).multiplyScalar(scale));
          light.width = specification.size[0] * scale;
          light.height = specification.size[1] * scale;
          light.lookAt(center);
        }
        direct.position.copy(center).add(offset.fromArray(settings.directional.position).multiplyScalar(scale));
        direct.target.position.copy(center);
        const extent = radius * 1.5;
        Object.assign(direct.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 0.1, far: 25 * scale });
        direct.shadow.camera.updateProjectionMatrix();
      },
    };
  } catch (error) { dispose(); throw error; }
  finally { source?.dispose(); pmrem.dispose(); }
}
