// One-off reproducible release review. Node runs the real brush constructor, Blender does CPU geometry only.
// Usage: node docs/proximal-reframe-review/run-audit.mjs (BLENDER_BIN or local Blender 4.5).
import { readFile, writeFile, mkdtemp, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { BufferAttribute, BufferGeometry, Matrix4, Vector3 } from 'three';
import { createCleaningPath } from '../../src/experience/cleaning-path.js';
import { createInterdentalBrush } from '../../src/experience/interdental-brush.js';
import { createMatureFilm } from '../film-review/mature-film.mjs';
import { createStoryCameraConfig } from '../../src/experience/story-camera.js';
import { experienceConfig } from '../../src/experience/config.js';
import { refineCavitySurface } from '../../src/experience/cavity-surface.js';
const here = path.dirname(fileURLToPath(import.meta.url)),
  root = path.resolve(here, '../..'),
  prv = await realpath(tmpdir()),
  tmp = await mkdtemp(path.join(prv, 'zub-independent-reframe-')),
  toJson = async (n) => JSON.parse(await readFile(path.join(root, n))),
  site = await toJson('public/story-assets/site.json'),
  guide = createCleaningPath(site),
  poses = [{ visibility: 1, alignment: 0, insertion: 0, stroke: 0 }],
  meta = { brush: guide.report(), groups: {}, runtimeSha256: {} };
for (const stroke of [0, 1])
  for (let i = 0; i <= 40; i++)
    poses.push({ visibility: 1, alignment: 1, insertion: i / 40, stroke });
meta.poses = poses;
const v = new Vector3(),
  im = new Matrix4(),
  wm = new Matrix4();

/** Decode exactly the indexed hero attributes. This does not require a renderer,
 * an image decoder, or a GPU context. Hash indices canonically as little-endian
 * uint32 so index storage width cannot hide or manufacture a topology change. */
function geometryFingerprint(geometry) {
  const hash = (array) =>
    createHash('sha256')
      .update(Buffer.from(array.buffer, array.byteOffset, array.byteLength))
      .digest('hex');
  const result = {};
  for (const [name, semantic] of Object.entries({
    position: 'POSITION',
    normal: 'NORMAL',
    tangent: 'TANGENT',
    uv: 'TEXCOORD_0',
  }))
    result[semantic] = hash(geometry.getAttribute(name).array);
  result.INDICES = hash(Uint32Array.from(geometry.index.array));
  return result;
}

function runtimeRefinement(bytes, damage) {
  const length = bytes.readUInt32LE(12);
  const header = JSON.parse(bytes.toString('utf8', 20, 20 + length));
  const primitive = header.meshes[0].primitives[0];
  const source = new BufferGeometry();
  function accessor(index) {
    const a = header.accessors[index],
      view = header.bufferViews[a.bufferView];
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const Type = { 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[
      a.componentType
    ];
    const step = Type.BYTES_PER_ELEMENT,
      stride = view.byteStride ?? width * step;
    const start = 28 + length + (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const output = new Type(a.count * width);
    for (let i = 0; i < a.count; i++)
      for (let j = 0; j < width; j++) {
        const off = start + i * stride + j * step;
        output[i * width + j] =
          a.componentType === 5126
            ? bytes.readFloatLE(off)
            : step === 2
              ? bytes.readUInt16LE(off)
              : bytes.readUInt32LE(off);
      }
    return new BufferAttribute(output, width);
  }
  for (const [name, semantic] of Object.entries({
    position: 'POSITION',
    normal: 'NORMAL',
    tangent: 'TANGENT',
    uv: 'TEXCOORD_0',
  }))
    source.setAttribute(name, accessor(primitive.attributes[semantic]));
  source.setIndex(accessor(primitive.indices));
  const before = geometryFingerprint(source);
  const result = refineCavitySurface(source, damage);
  const after = geometryFingerprint(source);
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw Error('Native hero attributes mutated');
  const evidence = {
    source: before,
    refined: geometryFingerprint(result),
    sourceUnchanged: true,
  };
  result.dispose();
  source.dispose();
  return evidence;
}

try {
  const damage = await toJson('public/story-assets/caries-36.json');
  meta.runtimeRefinement = {};
  meta.matureFilmValidation = {};
  meta.archOffsets = {
    upper: experienceConfig.anatomy.upperOffset,
    lower: experienceConfig.anatomy.lowerOffset,
  };
  meta.authoredCameraProfiles = {};
  for (const [lod, compact] of [
    ['desktop', false],
    ['mobile', true],
  ]) {
    const framing = createStoryCameraConfig(site, experienceConfig, { compact });
    meta.authoredCameraProfiles[lod] = framing.camera.keyframes
      .filter((frame) => ['lesion', 'result', 'brush'].includes(frame.key))
      .map((frame) => {
        const center = framing.landmarks[frame.landmark].getCenter(new Vector3());
        const direction = new Vector3().fromArray(frame.direction).normalize();
        return {
          name: frame.key,
          lod,
          targetWorldCm: center.toArray(),
          direction: direction.toArray(),
          distanceCm: frame.distance,
          cameraWorldCm: center
            .clone()
            .addScaledVector(direction, frame.distance)
            .toArray(),
        };
      });
  }
  const captureBytes = await readFile(path.join(here, 'browser-camera-inputs.json'));
  meta.browserCapture = JSON.parse(captureBytes);
  meta.browserCaptureSha256 = createHash('sha256').update(captureBytes).digest('hex');
  for (const rel of [
    'src/experience/cleaning-path.js',
    'src/experience/interdental-brush.js',
    'src/experience/plaque.js',
    'src/experience/caries.js',
    'src/experience/cavity-surface.js',
    'docs/film-review/mature-film.mjs',
    'src/experience/story-camera.js',
    'src/experience/config.js',
  ])
    meta.runtimeSha256[rel] = createHash('sha256')
      .update(await readFile(path.join(root, rel)))
      .digest('hex');
  for (const [lod, compact] of [
    ['desktop', false],
    ['mobile', true],
  ]) {
    const suffix = compact ? '-mobile' : '';
    meta.runtimeRefinement[lod] = runtimeRefinement(
      await readFile(path.join(root, `public/dentition-assets/hero-36${suffix}.glb`)),
      damage,
    );
    const brush = createInterdentalBrush({ path: guide, compact });
    const plaque = await createMatureFilm({ root, site, path: guide, compact });
    meta.matureFilmValidation[lod] = plaque.report();
    const by = { nylon: [], wire: [], grip: [] };
    for (const m of brush.object.children)
      by[
        m.isInstancedMesh
          ? 'nylon'
          : m.name.includes('grip') || m.name.includes('ferrule')
            ? 'grip'
            : 'wire'
      ].push(m);
    plaque.object.updateMatrixWorld(true);
    for (const m of plaque.object.children) by['film' + m.userData.hostFDI] = [m];
    for (const [kind, group] of Object.entries(by)) {
      const inst = (m) => (m.isInstancedMesh ? m.count : 1),
        nv = group.reduce((s, m) => s + m.geometry.attributes.position.count * inst(m), 0),
        ni = group.reduce((s, m) => s + m.geometry.index.count * inst(m), 0),
        steps = kind.startsWith('film') ? [poses[0]] : poses,
        pp = new Float32Array(steps.length * nv * 3),
        ff = new Uint32Array(ni);
      for (const [step, pose] of steps.entries()) {
        brush.setPose(pose);
        brush.object.updateMatrixWorld(true);
        let off = 0,
          ix = 0;
        for (const m of group) {
          for (let k = 0; k < inst(m); k++) {
            if (m.isInstancedMesh) {
              m.getMatrixAt(k, im);
              wm.multiplyMatrices(m.matrixWorld, im);
            } else wm.copy(m.matrixWorld);
            const g = m.geometry;
            for (let j = 0; j < g.attributes.position.count; j++)
              v.fromBufferAttribute(g.attributes.position, j)
                .applyMatrix4(wm)
                .multiplyScalar(10)
                .toArray(pp, 3 * (step * nv + off + j));
            if (step === 0)
              for (let j = 0; j < g.index.count; j++) ff[ix++] = off + g.index.getX(j);
            off += g.attributes.position.count;
          }
        }
      }
      const prefix = lod + '-' + kind;
      await writeFile(path.join(tmp, prefix + '.f32'), Buffer.from(pp.buffer));
      await writeFile(path.join(tmp, prefix + '.u32'), Buffer.from(ff.buffer));
      meta.groups[prefix] = { steps: steps.length, vertices: nv, triangles: ni / 3 };
    }
    brush.dispose();
    plaque.dispose();
  }
  await writeFile(path.join(tmp, 'descriptor.json'), JSON.stringify(meta));
  const bl =
    process.env.BLENDER_BIN ||
    path.resolve(root, '../professional-tools/blender-4.5.14-windows-x64/blender.exe');
  const r = spawnSync(
    bl,
    [
      '--background',
      '--factory-startup',
      '--python-exit-code',
      '2',
      '--python',
      path.join(here, 'geometry-worker.py'),
      '--',
      tmp,
    ],
    { stdio: 'inherit', windowsHide: true, timeout: 240000 },
  );
  if (r.status !== 0) throw Error(r.error?.message || `Blender failed: ${r.status}`);
} finally {
  const actual = await realpath(tmp);
  if (
    path.dirname(actual) !== prv ||
    !path.basename(actual).startsWith('zub-independent-reframe-')
  )
    throw Error('Unexpected scratch path');
  await rm(actual, { recursive: true, force: true });
}
