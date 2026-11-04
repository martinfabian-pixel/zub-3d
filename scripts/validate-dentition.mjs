// Validate the isolated dental atlas, the recorded seating contract and root sections.
// This is a structural regression check, not a clinical anatomy certification.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { validateBytes } from 'gltf-validator';

const folder = new URL('../public/dentition-assets/', import.meta.url);
const load = (name) => readFile(new URL(name, folder));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(await load('manifest.json'));
const provenance = JSON.parse(await load('provenance.json'));
const contact = JSON.parse(await readFile(new URL('../assets/source/dentition/final-lod-contact-audit.json', import.meta.url)));
assert.equal(hash(await load('manifest.json')),contact.manifest_sha256,'Manifest changed: repeat the pose/contact audit.');
assert.deepEqual(contact.after_joint_correction,{desktop:[],mobile:[]});
const ids = [1, 2, 3, 4].flatMap(q => [1, 2, 3, 4, 5, 6, 7].map(p => 10*q+p));
const types = ids.filter(i => Math.trunc(i/10) === 2 || Math.trunc(i/10) === 3);
const names = types.filter(i => i !== 26).map(i => `FDI_${i}`);
const expectedRoots = {21:1,22:1,23:1,24:2,25:1,26:3,27:3,31:1,32:1,33:1,34:1,35:1,36:2,37:2};
assert.equal(manifest.schemaVersion, 1);
assert.deepEqual(manifest.teeth.map(t => t.fdi).sort((a,b)=>a-b), ids);
assert.deepEqual(manifest.sources.map(s => s.source).sort((a,b)=>a-b), types);
for (const tooth of manifest.teeth) {
  const q = Math.trunc(tooth.fdi / 10), left = (q < 3 ? 20 : 30) + tooth.fdi % 10;
  assert.equal(tooth.source, left); assert.equal(tooth.node, left === 26 ? 'ToothExterior' : `FDI_${left}`);
  assert.equal(tooth.reflected, q === 1 || q === 4);
  for (const a of [tooth.matrix, tooth.sourceMatrix]) {
    assert.equal(a.length, 16); assert.ok(a.every(Number.isFinite));
    assert.ok(Math.abs(a[3])+Math.abs(a[7])+Math.abs(a[11])+Math.abs(a[15]-1) < 1e-6);
    const det = a[0]*(a[5]*a[10]-a[9]*a[6])-a[4]*(a[1]*a[10]-a[9]*a[2])+a[8]*(a[1]*a[6]-a[5]*a[2]);
    assert.equal(det < 0, tooth.reflected); assert.ok(Math.abs(det) > 1e4);
  }
  assert.equal(tooth.cervicalRing.length, 16); assert.ok(tooth.cervicalRing.flat().every(Number.isFinite));
  assert.ok(tooth.bounds.length === 6 && tooth.bounds.every(Number.isFinite));
  assert.ok(tooth.crownHeightMm > 3 && tooth.crownHeightMm < 15);
  for (let k=0; k<3; k++) assert.ok(Math.abs(tooth.matrix[12+k]-tooth.sourceMatrix[12+k]-tooth.presentationOffsetCm[k]) < 1e-8);
}
function parse(b) {
  assert.equal(b.readUInt32LE(0), 0x46546c67); const n=b.readUInt32LE(12);
  return {doc:JSON.parse(b.subarray(20,20+n)), bin:b.subarray(28+n)};
}
function values(doc,bin,i) {
  const a=doc.accessors[i],v=doc.bufferViews[a.bufferView],length={VEC3:3,SCALAR:1}[a.type];
  const type={5126:Float32Array,5125:Uint32Array,5123:Uint16Array}[a.componentType];
  assert.ok(!v.byteStride); return new type(bin.buffer,bin.byteOffset+(v.byteOffset||0)+(a.byteOffset||0),a.count*length);
}
function sectionComponents(p, f, height) {
  const parent=[]; const points=new Map();
  function point(x,z) {const key=`${Math.round(x*1e7)}:${Math.round(z*1e7)}`;if(!points.has(key)){points.set(key,parent.length);parent.push(parent.length);}return points.get(key);}
  function root(i) {while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;}
  for(let i=0;i<f.length;i+=3){
    const ep=[];
    for(let k=0;k<3;k++) {const a=3*f[i+k], b=3*f[i+(k+1)%3], ya=p[a+1],yb=p[b+1];
      if((ya<height)===(yb<height))continue;const t=(height-ya)/(yb-ya);ep.push(point(p[a]+t*(p[b]-p[a]),p[a+2]+t*(p[b+2]-p[a+2])));}
    if(ep.length===2)parent[root(ep[0])]=root(ep[1]);
  }
  return new Set(parent.map((_,i)=>root(i))).size;
}
const summaries=[];
for (const filename of ['dentition.glb','dentition-mobile.glb']) {
  const bytes=await load(filename);
  assert.equal(hash(bytes),provenance.outputs[filename].sha256);assert.equal(hash(bytes),manifest.lods[filename].sha256);
  assert.equal(hash(bytes),contact.asset_sha256[`public\\dentition-assets\\${filename}`],'Geometry changed: repeat the contact audit.');
  const validation=await validateBytes(new Uint8Array(bytes),{uri:filename,maxIssues:16});
  assert.equal(validation.issues.numErrors,0,JSON.stringify(validation.issues.messages));assert.equal(validation.issues.numWarnings,0,JSON.stringify(validation.issues.messages));
  const {doc,bin}=parse(bytes); assert.deepEqual(doc.meshes.map(m=>m.name).sort(),[...names].sort());
  assert.equal(doc.images.length,2);assert.equal(doc.materials.length,1);assert.ok(doc.images.every(i=>Number.isInteger(i.bufferView)&&!i.uri));
  const mat=doc.materials[0];assert.equal(mat.pbrMetallicRoughness.metallicFactor,0);assert.equal(mat.alphaMode||'OPAQUE','OPAQUE');assert.ok(!mat.extensions?.KHR_materials_transmission);
  assert.ok(mat.normalTexture && mat.pbrMetallicRoughness.metallicRoughnessTexture);
  let triangles=0; const sections={};
  for(const mesh of doc.meshes){ const fdi=Number(mesh.name.slice(4)),pr=mesh.primitives[0];assert.equal(mesh.primitives.length,1);assert.equal(pr.material,0);
    for(const key of ['POSITION','NORMAL','TANGENT','TEXCOORD_0'])assert.ok(Number.isInteger(pr.attributes[key]));
    const p=values(doc,bin,pr.attributes.POSITION),f=values(doc,bin,pr.indices);triangles+=f.length/3;
    const bounds=doc.accessors[pr.attributes.POSITION];const h=bounds.max[1]-bounds.min[1];
    const counts=[.12,.17,.22,.27,.32].map(fraction=>sectionComponents(p,f,bounds.min[1]+fraction*h));
    assert.equal(Math.max(...counts),expectedRoots[fdi],`${filename}/${mesh.name}: ${counts}`);sections[fdi]=counts;
  }
  assert.equal(triangles,manifest.lods[filename].triangles);summaries.push({file:filename,bytes:bytes.length,triangles,errors:0,warnings:0,apicalSectionComponents:sections});
}
const hero=manifest.sources.find(s=>s.source===26);assert.equal(hash(await load('../prototype-assets/molar.glb')),hero.sha256);
assert.equal(hero.sha256,'2d746a74e34014f3bb6f0f24a9f9b3a3b5f49316266052249970104473471190');
assert.equal(hash(await load('../prototype-assets/molar-mobile.glb')),'b947492f41f468c179506c117c6004a3704a34b674005ec3c8a888a6cffd11d2');
console.log(JSON.stringify({teeth:28,sourceTypes:14,approvedHeroUnchanged:true,lods:summaries},null,2));
