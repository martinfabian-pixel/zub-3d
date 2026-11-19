import { readFile } from 'node:fs/promises';
import { BufferGeometry, BufferAttribute, Group, Matrix4, Mesh, MeshPhysicalMaterial } from 'three';
import { createSmileLayout } from '../src/experience/smile-layout.js';

// Load the real authored crown vertices without a browser image decoder.
export async function loadMotionFixture() {
  const data = await readFile(new URL('../public/dentition-assets/crowns.glb', import.meta.url));
  const jsonSize = data.readUInt32LE(12);
  const doc = JSON.parse(data.toString('utf8', 20, 20 + jsonSize));
  const manifest = JSON.parse(await readFile(new URL('../public/dentition-assets/manifest.json', import.meta.url)));
  function attribute(id) {
    const a = doc.accessors[id], v = doc.bufferViews[a.bufferView];
    const components = a.type === 'SCALAR' ? 1 : a.type === 'VEC2' ? 2 : 3;
    const componentBytes = a.componentType === 5123 ? 2 : 4;
    const out = components > 1 ? new Float32Array(a.count * components) : new Uint32Array(a.count);
    const offset = 28 + jsonSize + (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    for (let i = 0; i < a.count; i++) for (let j = 0; j < components; j++) {
      const k = offset + i * (v.byteStride ?? components * componentBytes) + j * componentBytes;
      out[i * components + j] = a.componentType === 5126 ? data.readFloatLE(k) : componentBytes === 2 ? data.readUInt16LE(k) : data.readUInt32LE(k);
    }
    return new BufferAttribute(out, components);
  }
  const sources = new Map();
  for (const [index, mesh] of doc.meshes.entries()) {
    const primitive = mesh.primitives[0];
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', attribute(primitive.attributes.POSITION));
    geometry.setAttribute('normal', attribute(primitive.attributes.NORMAL));
    geometry.setIndex(attribute(primitive.indices));
    sources.set(doc.nodes.find(node => node.mesh === index)?.name ?? mesh.name, geometry);
  }
  const teeth = new Map(), object = new Group();
  for (const entry of manifest.teeth) {
    let geometry = sources.get('FDI_' + entry.source).clone();
    if (entry.reflected) {
      geometry.applyMatrix4(new Matrix4().makeScale(-1, 1, 1));
      const indices = geometry.index.array;
      for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
    }
    const crown = new Mesh(geometry, new MeshPhysicalMaterial({ color: '#f4f3ef' }));
    const matrix = new Matrix4().fromArray(entry.matrix);
    const item = { entry, upper: entry.fdi < 30, matrix, crown };
    teeth.set(entry.fdi, item);
    object.add(crown);
  }
  for (const [fdi, matrix] of createSmileLayout(teeth)) teeth.get(fdi).smilePose = { matrix };
  return { teeth, object };
}
