import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareMaterial } from './materials.js';
import { disposeObject } from './scene.js';
import { loadBinary } from './binary.js';

// Replacement contract: one watertight exterior, crown +Y, source UV0, embedded
// normal and RGBA region/roughness/variation/visibility maps. No scene rewrite.
export async function loadTooth(config, profile, renderer, onProgress, clay, signal) {
  const url = new URL(profile.compact ? config.model.compact : config.model.desktop, document.baseURI);
  url.searchParams.set('v', config.revision);
  const bytes = await loadBinary(url.href, signal, onProgress);
  const loaded = await new GLTFLoader().parseAsync(bytes, new URL('.', url).href);
  const root = loaded.scene;
  try {
    if (signal?.aborted) throw new DOMException('Viewer disposed', 'AbortError');
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    const size = bounds.getSize(new THREE.Vector3());
    if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('The model has no finite tooth geometry.');
    const center = bounds.getCenter(new THREE.Vector3());
    const normalized = new THREE.Group();
    normalized.name = 'One upper left first permanent molar — FDI 26';
    normalized.scale.setScalar(config.model.height / size.y);
    root.position.sub(center);
    normalized.add(root);
    prepareMaterial(normalized, config, profile, renderer, clay);
    normalized.updateMatrixWorld(true);
    let triangles = 0;
    let meshes = 0;
    normalized.traverse((object) => { if (object.isMesh) { meshes++; triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3; } });
    return { object: normalized, bounds: new THREE.Box3().setFromObject(normalized), meshes, triangles, variant: url.pathname.split('/').pop() };
  } catch (error) { disposeObject(root); throw error; }
}
