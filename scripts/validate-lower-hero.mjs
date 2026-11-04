// Run from any directory: node scripts/validate-lower-hero.mjs [--report report.json]
// Read-only tests of the shipped FDI 36 GLBs, the checked-in source, and their provenance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { validateBytes } from 'gltf-validator';

const publicDir = new URL('../public/dentition-assets/', import.meta.url);
const sourceDir = new URL('../assets/source/dentition/', import.meta.url);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = async (name, base = publicDir) => JSON.parse(await readFile(new URL(name, base), 'utf8'));
const near = (a, b, eps, message) => assert.ok(Math.abs(a - b) <= eps, `${message}: ${a} vs ${b}`);

function parseGlb(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'GLB magic');
  assert.equal(bytes.readUInt32LE(4), 2, 'GLB version');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB file length');
  const n = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'GLB JSON chunk');
  assert.equal(bytes.readUInt32LE(24 + n), 0x004e4942, 'GLB BIN chunk');
  return { doc: JSON.parse(bytes.subarray(20, 20 + n)), bin: bytes.subarray(28 + n) };
}

// Hash real attribute elements, not buffer-view padding. Works for interleaved attributes.
function packedAccessor({ doc, bin }, index) {
  const a = doc.accessors[index];
  assert.ok(!a.sparse && a.bufferView !== undefined, 'Expected materialized, dense accessor');
  const v = doc.bufferViews[a.bufferView];
  const scalarBytes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
  const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  assert.ok(scalarBytes && width, 'Unsupported hero accessor type');
  const elementBytes = scalarBytes * width, stride = v.byteStride ?? elementBytes;
  const start = (a.byteOffset ?? 0) + (v.byteOffset ?? 0);
  if (stride === elementBytes) return bin.subarray(start, start + a.count * elementBytes);
  const out = Buffer.alloc(a.count * elementBytes);
  for (let i = 0; i < a.count; i++) bin.copy(out, i * elementBytes, start + i * stride, start + i * stride + elementBytes);
  return out;
}

function numericArray(glb, i) {
  const p = packedAccessor(glb, i), type = glb.doc.accessors[i].componentType;
  const ctor = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[type];
  // Buffer can begin at an unaligned address. Copy tightly packed bytes before casting.
  return new ctor(Uint8Array.from(p).buffer);
}

// Intersect triangles with an apical horizontal plane. Weld intersection vertices
// across UV seams; count actual closed cross-section contours of meaningful area.
// The crown is +Y and all local coordinates are metres. This tests two separated
// exterior root bodies, not root canal anatomy or an OpenGL material effect.
function rootSlice(p, indices, y) {
  const points = [], ids = new Map(), neighbors = [];
  function add(x, z) {
    const key = `${Math.round(x * 1e9)},${Math.round(z * 1e9)}`;
    if (!ids.has(key)) { ids.set(key, points.length); points.push([x, z]); neighbors.push(new Set()); }
    return ids.get(key);
  }
  for (let n = 0; n < indices.length; n += 3) {
    const cut = [];
    for (let k = 0; k < 3; k++) {
      const a = 3 * indices[n + k], b = 3 * indices[n + (k + 1) % 3];
      if ((p[a + 1] < y) === (p[b + 1] < y)) continue;
      const t = (y - p[a + 1]) / (p[b + 1] - p[a + 1]);
      cut.push(add(p[a] + t * (p[b] - p[a]), p[a + 2] + t * (p[b + 2] - p[a + 2])));
    }
    if (cut.length === 2 && cut[0] !== cut[1]) { neighbors[cut[0]].add(cut[1]); neighbors[cut[1]].add(cut[0]); }
  }
  const visited = new Set(), areas = [];
  for (let start = 0; start < points.length; start++) {
    if (visited.has(start) || !neighbors[start].size) continue;
    const component = [], stack = [start];
    while (stack.length) { const a = stack.pop(); if (visited.has(a)) continue; visited.add(a); component.push(a); for (const b of neighbors[a]) if (!visited.has(b)) stack.push(b); }
    assert.ok(component.every((a) => neighbors[a].size === 2), `Open/branched slice at Y=${y}`);
    let last = -1, a = start, twiceArea = 0;
    do {
      const b = [...neighbors[a]].find((n) => n !== last);
      twiceArea += points[a][0] * points[b][1] - points[a][1] * points[b][0];
      last = a; a = b;
    } while (a !== start);
    areas.push(Math.abs(twiceArea) * .5e6); // square metres to square millimetres
  }
  return { localYMetres: y, areasMm2: areas.sort((a, b) => b - a), substantialRoots: areas.filter((area) => area > .5).length };
}

function embeddedPng(glb, ref) {
  const { doc, bin } = glb, texture = doc.textures[ref.index], image = doc.images[texture.source];
  assert.equal(image.mimeType, 'image/png');
  assert.ok(!image.uri && Number.isInteger(image.bufferView), 'Texture must be embedded');
  const view = doc.bufferViews[image.bufferView], start = view.byteOffset ?? 0, png = bin.subarray(start, start + view.byteLength);
  assert.ok(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'PNG signature');
  const info = { width: png.readUInt32BE(16), height: png.readUInt32BE(20), pngColorType: png[25], bytes: png.length, sha256: sha(png) };
  if (info.width === 1 && info.height === 1) {
    assert.equal(png[24], 8); assert.equal(info.pngColorType, 2, 'Neutral normal must be one RGB texel');
    const chunks = [];
    for (let pos = 8; pos + 12 <= png.length;) { const n = png.readUInt32BE(pos); if (png.toString('ascii', pos + 4, pos + 8) === 'IDAT') chunks.push(png.subarray(pos + 8, pos + 8 + n)); pos += n + 12; }
    const scanline = inflateSync(Buffer.concat(chunks)); assert.equal(scanline.length, 4); assert.ok(scanline[0] <= 4);
    info.rgb = [...scanline.subarray(1)]; // all PNG predictors are zero for the first pixel of the first row
  }
  return info;
}

async function validate() {
  const provenance = await readJson('hero-36-provenance.json'), manifest = await readJson('manifest.json');
  const entry = manifest.teeth.find((t) => t.fdi === 36), source = (await readJson('sources.json', sourceDir)).find((s) => s.source === 36);
  assert.equal(entry.source, 36); assert.equal(source.title, 'Mandibular First Molar');
  assert.match(source.url, /e1c919d6603846eca873154eeededdd6$/); assert.equal(source.license, 'CC-BY-4.0');
  for (const key of ['source', 'title', 'url', 'license', 'sha256', 'file']) assert.equal(provenance.source[key], source[key], `Source provenance ${key}`);
  const sourceBytes = await readFile(new URL(source.file, sourceDir)), orig = parseGlb(sourceBytes).doc;
  assert.equal(sha(sourceBytes), source.sha256, 'Native Dundee input hash');
  const sourcePrimitive = orig.meshes[0].primitives[0], sourceMaterial = orig.materials[sourcePrimitive.material ?? 0];
  assert.equal(sourceMaterial.normalTexture, undefined, 'Dundee source has no baked normal texture');
  assert.equal(sourcePrimitive.attributes.TANGENT, undefined, 'Dundee source has no tangent accessor');
  const sourceVertexCount = orig.accessors[sourcePrimitive.attributes.POSITION].count, sourceTriangleCount = orig.accessors[sourcePrimitive.indices].count / 3;
  const report = { source36: { url: source.url, license: source.license, sha256: source.sha256, vertices: sourceVertexCount, triangles: sourceTriangleCount }, assets: {} };
  let firstHashes;
  for (const name of ['hero-36.glb', 'hero-36-mobile.glb']) {
    const bytes = await readFile(new URL(name, publicDir)), glb = parseGlb(bytes), { doc } = glb, out = provenance.outputs[name];
    const validation = await validateBytes(new Uint8Array(bytes), { uri: name, maxIssues: 50 });
    assert.equal(validation.issues.numErrors, 0, JSON.stringify(validation.issues.messages));
    assert.equal(validation.issues.numWarnings, 0, JSON.stringify(validation.issues.messages));
    assert.equal(sha(bytes), out.sha256, `${name}: output SHA-256`); assert.equal(bytes.length, out.bytes);
    assert.equal(doc.scenes.length, 1); assert.equal(doc.meshes.length, 1); assert.equal(doc.nodes.length, 1);
    const node = doc.nodes[doc.scenes[0].nodes[0]]; assert.equal(node.name, 'ToothExterior'); assert.equal(node.mesh, 0);
    assert.equal(node.matrix, undefined); assert.equal(node.translation, undefined); assert.equal(node.scale, undefined); assert.equal(node.rotation, undefined);
    assert.equal(doc.meshes[0].primitives.length, 1); assert.equal(doc.materials.length, 1);
    const pr = doc.meshes[0].primitives[0], mat = doc.materials[pr.material ?? 0];
    assert.equal(pr.mode ?? 4, 4); assert.equal(mat.alphaMode ?? 'OPAQUE', 'OPAQUE'); assert.equal(mat.pbrMetallicRoughness.metallicFactor, 0);
    assert.ok(!mat.extensions?.KHR_materials_transmission); assert.equal(pr.attributes.COLOR_0, undefined);
    assert.equal(doc.images.length, 2); assert.equal(doc.textures.length, 2); assert.notEqual(mat.normalTexture.index, mat.pbrMetallicRoughness.metallicRoughnessTexture.index);
    const normal = embeddedPng(glb, mat.normalTexture), parameters = embeddedPng(glb, mat.pbrMetallicRoughness.metallicRoughnessTexture);
    assert.equal(parameters.pngColorType, 6, 'RGBA tissue parameter map'); assert.equal(parameters.width, parameters.height);
    assert.equal(parameters.width, out.texture_size); assert.equal(parameters.width, name === 'hero-36.glb' ? 2048 : 1024);
    assert.equal(normal.width, 1); assert.equal(normal.height, 1); assert.deepEqual(normal.rgb, [128, 128, 255], 'No invented normal-map detail');
    const credit = JSON.stringify(doc.asset); assert.match(credit, /University of Dundee/i); assert.match(credit, /CC[\s-]*BY[\s-]*4\.0|creativecommons\.org\/licenses\/by\/4\.0/i);
    assert.match(credit, /e1c919d6603846eca873154eeededdd6/, 'Embedded original source URL');
    const attrs = { positions: pr.attributes.POSITION, normals: pr.attributes.NORMAL, tangents: pr.attributes.TANGENT, uv: pr.attributes.TEXCOORD_0, indices: pr.indices };
    const hashes = Object.fromEntries(Object.entries(attrs).map(([k, i]) => [k, sha(packedAccessor(glb, i))]));
    if (firstHashes) assert.deepEqual(hashes, firstHashes, 'Desktop/mobile geometry must be byte-identical'); else firstHashes = hashes;
    for (const [k, i] of Object.entries(attrs)) {
      if (k !== 'indices') assert.equal(doc.accessors[i].count, sourceVertexCount, `Native ${k} vertex count`);
    }
    assert.equal(doc.accessors[pr.indices].count / 3, sourceTriangleCount); assert.equal(out.triangles, sourceTriangleCount); assert.equal(out.vertices, sourceVertexCount);
    const semantics = { positions: 'POSITION', normals: 'NORMAL', tangents: 'TANGENT', uv: 'TEXCOORD_0', indices: 'INDICES' };
    for (const [k, h] of Object.entries(hashes)) assert.equal(h, out.geometry_sha256[semantics[k]], `Provenance ${k} bytes`);
    const p = numericArray(glb, attrs.positions), n = numericArray(glb, attrs.normals), t = numericArray(glb, attrs.tangents), ix = numericArray(glb, attrs.indices);
    const bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; let maxNormalError = 0, maxTangentError = 0;
    for (let i = 0; i < sourceVertexCount; i++) {
      for (let k = 0; k < 3; k++) { const v = p[3 * i + k]; bounds[k] = Math.min(bounds[k], v); bounds[k + 3] = Math.max(bounds[k + 3], v); }
      const nn = n.subarray(3 * i, 3 * i + 3), tt = t.subarray(4 * i, 4 * i + 4);
      maxNormalError = Math.max(maxNormalError, Math.abs(Math.hypot(...nn) - 1));
      maxTangentError = Math.max(maxTangentError, Math.abs(Math.hypot(...tt.subarray(0, 3)) - 1), Math.abs(nn[0] * tt[0] + nn[1] * tt[1] + nn[2] * tt[2]), Math.abs(Math.abs(tt[3]) - 1));
    }
    assert.ok(maxNormalError < 2e-4 && maxTangentError < 2e-4, 'Finite orthonormal tangent frame');
    bounds.forEach((b, i) => near(b, entry.bounds[i], 2e-7, `FDI36 canonical local metre bound ${i}`));
    // Three distinct transverse planes through the apical root region; no material/color heuristics.
    const slices = [.2037, .2671, .3293].map((f) => rootSlice(p, ix, bounds[1] + (bounds[4] - bounds[1]) * f));
    assert.ok(slices.every((slice) => slice.substantialRoots === 2), `Expected two separated apical roots: ${JSON.stringify(slices)}`);
    report.assets[name] = { bytes: bytes.length, sha256: out.sha256, triangles: sourceTriangleCount, vertices: sourceVertexCount, khronos: { errors: 0, warnings: 0 }, geometrySha256: hashes, localBoundsMetres: bounds, maxNormalLengthError: maxNormalError, maxTangentFrameError: maxTangentError, rootCrossSections: slices, textures: { normal, parameters } };
    console.log(`${name}: ${sourceTriangleCount} triangles, two root branches on all three sections; Khronos 0 errors / 0 warnings.`);
  }
  return report;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await validate(), flag = process.argv.indexOf('--report');
  if (flag !== -1) { assert.ok(process.argv[flag + 1], '--report requires a path'); await writeFile(process.argv[flag + 1], JSON.stringify(report, null, 2) + '\n'); }
}
