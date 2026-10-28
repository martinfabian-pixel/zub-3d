import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateBytes } from 'gltf-validator';

const root = new URL('../public/prototype-assets/', import.meta.url);
const provenance = JSON.parse(await readFile(new URL('provenance.json', root), 'utf8'));
for (const name of ['molar.glb', 'molar-mobile.glb']) {
  const bytes = await readFile(new URL(name, root));
  const report = await validateBytes(new Uint8Array(bytes), { uri: name, maxIssues: 30 });
  assert.equal(report.issues.numErrors, 0, JSON.stringify(report.issues.messages));
  assert.equal(report.issues.numWarnings, 0, JSON.stringify(report.issues.messages));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), provenance.outputs[name].sha256);
  const jsonLength = bytes.readUInt32LE(12);
  const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  assert.equal(document.meshes.length, 1);
  assert.equal(document.meshes[0].primitives.length, 1);
  const primitive = document.meshes[0].primitives[0];
  assert.equal(document.accessors[primitive.indices].count / 3, 57008);
  assert.equal(primitive.attributes.COLOR_0, undefined);
  const material = document.materials[0];
  assert.equal(material.pbrMetallicRoughness.metallicFactor, 0);
  assert.equal(material.extensions.KHR_materials_transmission, undefined);
  console.log(`${name}: ${bytes.byteLength} B; 57008 triangles; validator 0 errors / 0 warnings; SHA256 matches.`);
}
