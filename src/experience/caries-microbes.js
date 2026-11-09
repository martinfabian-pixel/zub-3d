import * as THREE from 'three';

// A deliberately enlarged, illustrative cast: the dimensions do not imply the
// size or appearance of actual oral bacteria. The frame is anchored to FDI 36.
const CAST = [
  { x: -0.055, y: 0.080, z: 0.052, radius: 0.028, phase: 0.1, tilt: -0.13, color: 0x83ab3d },
  { x: 0.075, y: 0.060, z: 0.052, radius: 0.023, phase: 1.9, tilt: 0.16, color: 0x9abb4b },
  { x: -0.015, y: -0.065, z: 0.048, radius: 0.019, phase: 3.7, tilt: -0.08, color: 0x759d36 },
];

/**
 * Tiny original characters attached to the lesion-bearing tooth.
 * `time` is in seconds. `reveal` is a coordinated 0..1 timeline value;
 * callers should start it only after the camera has reached the close-up.
 */
export function createCariesMicrobes({ arch, site }) {
  const host = arch.teeth.get(36)?.mesh;
  if (!host) throw new Error('FDI 36 is required for the caries illustration.');
  host.updateWorldMatrix(true, false);

  const origin = new THREE.Vector3().fromArray(site.lesion.centerWorldCm);
  const normal = new THREE.Vector3().fromArray(site.lesion.basisWorld.outwardNormal).normalize();
  const up = new THREE.Vector3().fromArray(site.lesion.basisWorld.occlusalGingivalTangentOcclusalPositive).normalize();
  const right = new THREE.Vector3().crossVectors(up, normal).normalize();
  up.crossVectors(normal, right).normalize();
  const frame = new THREE.Matrix4().makeBasis(right, up, normal).setPosition(origin);
  const object = new THREE.Group();
  object.name = 'Illustrative bacteria at FDI 36 lesion';
  object.matrixAutoUpdate = false;
  object.matrix.copy(host.matrixWorld).invert().multiply(frame);
  object.visible = false;
  host.add(object);

  const sphere = new THREE.SphereGeometry(1, 18, 12);
  const armGeometry = new THREE.CylinderGeometry(0.055, 0.075, 1, 8);
  const smileGeometry = new THREE.TubeGeometry(
    new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.25, 0.02, 0),
      new THREE.Vector3(0, -0.24, 0),
      new THREE.Vector3(0.25, 0.02, 0),
    ), 12, 0.035, 6, false,
  );
  const green = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.48, metalness: 0 });
  const limb = new THREE.MeshStandardMaterial({ color: 0x789e39, roughness: 0.58 });
  const white = new THREE.MeshStandardMaterial({ color: 0xfffdf2, roughness: 0.3 });
  const pupil = new THREE.MeshStandardMaterial({ color: 0x233b25, roughness: 0.3 });
  const smile = new THREE.MeshStandardMaterial({ color: 0x40562a, roughness: 0.7 });
  const meshes = [];
  function instances(geometry, material, count) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // The meshes are tiny and move slightly; do not cull using their initial bounds.
    mesh.frustumCulled = false;
    mesh.raycast = () => {}; // Never intercept picking of the tooth underneath.
    object.add(mesh);
    meshes.push(mesh);
    return mesh;
  }
  const bodies = instances(sphere, green, CAST.length * 3); // heads and little hands
  const arms = instances(armGeometry, limb, CAST.length * 2);
  const eyes = instances(sphere, white, CAST.length * 2);
  const pupils = instances(sphere, pupil, CAST.length * 2);
  const mouths = instances(smileGeometry, smile, CAST.length);
  CAST.forEach((character, i) => {
    const color = new THREE.Color(character.color);
    bodies.setColorAt(i * 3, color);
    bodies.setColorAt(i * 3 + 1, color);
    bodies.setColorAt(i * 3 + 2, color);
  });
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;

  const position = new THREE.Vector3();
  const center = new THREE.Vector3();
  const relative = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const componentRotation = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  const axis = new THREE.Vector3(0, 0, 1);
  function put(mesh, index, x, y, z, sx, sy, sz, angle = 0) {
    relative.set(x, y, z).applyQuaternion(rotation);
    position.copy(center).add(relative);
    componentRotation.setFromAxisAngle(axis, angle).premultiply(rotation);
    scale.set(sx, sy, sz);
    matrix.compose(position, componentRotation, scale);
    mesh.setMatrixAt(index, matrix);
  }
  function update({ time = 0, reveal = 0, reducedMotion = false } = {}) {
    const v = THREE.MathUtils.clamp(reveal, 0, 1);
    object.visible = v > 0.001;
    if (!object.visible) return false;
    const entrance = v * v * (3 - 2 * v);
    CAST.forEach((c, i) => {
      const wobble = reducedMotion ? 0 : Math.sin(time * 2.1 + c.phase);
      const r = c.radius * entrance;
      center.set(c.x, c.y + wobble * 0.002, c.z);
      rotation.setFromAxisAngle(axis, c.tilt + wobble * 0.045);
      put(bodies, i * 3, 0, 0, 0, r * 1.06, r * 0.94, r * 0.72);
      for (let side = 0; side < 2; side++) {
        const sign = side ? 1 : -1;
        const idx = i * 2 + side;
        put(eyes, idx, sign * r * 0.36, r * 0.23, r * 0.63, r * 0.235, r * 0.255, r * 0.15);
        put(pupils, idx, sign * r * 0.36, r * 0.22, r * 0.765, r * 0.105, r * 0.12, r * 0.065);
        put(arms, idx, sign * r * 1.02, -r * 0.30, r * 0.05, r, r * 0.76, r, sign * 0.78);
        put(bodies, i * 3 + side + 1, sign * r * 1.29, -r * 0.55, r * 0.05, r * 0.13, r * 0.13, r * 0.13);
      }
      put(mouths, i, 0, -r * 0.23, r * 0.70, r, r, r);
    });
    meshes.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; });
    return !reducedMotion;
  }
  function dispose() {
    object.removeFromParent();
    sphere.dispose(); armGeometry.dispose(); smileGeometry.dispose();
    green.dispose(); limb.dispose(); white.dispose(); pupil.dispose(); smile.dispose();
    meshes.forEach(mesh => mesh.dispose());
  }
  return { object, update, dispose };
}

