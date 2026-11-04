import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadBinary } from '../prototype/binary.js';
import { disposeObject } from './scene.js';

export function assetURL(config, path) {
  const url = new URL(path, config.assetBaseURL ?? document.baseURI);
  url.searchParams.set('v', config.revision);
  return url.href;
}

export async function loadStoryData(config,path,signal) {
  const url=new URL(assetURL(config,path));url.searchParams.set('v',config.storyRevision);
  const response=await fetch(url.href,{signal});
  if(!response.ok)throw new Error(`Story asset HTTP ${response.status}: ${path}`);
  return response.json();
}

export async function loadManifest(config, signal) {
  const response = await fetch(assetURL(config, config.assets.manifest), { signal });
  if (!response.ok) throw new Error(`Dentition manifest HTTP ${response.status}`);
  const manifest = await response.json();
  const expected = [11,12,13,14,15,16,17,21,22,23,24,25,26,27,31,32,33,34,35,36,37,41,42,43,44,45,46,47];
  if (!Array.isArray(manifest.teeth) || manifest.teeth.length !== expected.length) throw new Error('Manifest must describe 28 permanent teeth.');
  const numbers = manifest.teeth.map((t) => t.fdi).sort((a,b) => a-b);
  if (numbers.some((n,i) => n !== expected[i])) throw new Error('Manifest has duplicated, absent or unexpected FDI positions.');
  for (const tooth of manifest.teeth) {
    if (tooth.matrix?.length !== 16 || !tooth.matrix.every(Number.isFinite) || tooth.bounds?.length !== 6 || !tooth.bounds.every(Number.isFinite)) throw new Error(`Invalid fixed anatomical transform for FDI ${tooth.fdi}`);
  }
  return manifest;
}

export async function loadModel(config, path, signal, onProgress) {
  const url = assetURL(config, path);
  const bytes = await loadBinary(url, signal, onProgress);
  const loaded = await new GLTFLoader().parseAsync(bytes, new URL('.', url).href);
  if (signal?.aborted) { disposeObject(loaded.scene); throw new DOMException('Journey disposed', 'AbortError'); }
  const meshes = new Map();
  loaded.scene.updateMatrixWorld(true);
  loaded.scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    if (!mesh.geometry.attributes.normal || !mesh.geometry.attributes.uv || !mesh.material.normalMap || !mesh.material.roughnessMap) {
      disposeObject(loaded.scene);
      throw new Error(`Tooth ${mesh.name} lacks the required geometry/material maps.`);
    }
    meshes.set(mesh.name, mesh);
  });
  if (!meshes.size) { disposeObject(loaded.scene); throw new Error('No dental surfaces in the model.'); }
  return { object: loaded.scene, meshes, bytes: bytes.byteLength, path };
}
