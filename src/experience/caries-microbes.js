import * as THREE from 'three';

// A deliberately enlarged, illustrative cast: the dimensions do not imply the
// size or appearance of actual oral bacteria. The frame is anchored to FDI 36.
const CAST = [
  { x: -0.055, y: 0.080, z: 0.052, radius: 0.028, phase: 0.1, tilt: -0.13, color: 0x799a35 },
  { x: 0.008, y: 0.018, z: 0.052, radius: 0.023, phase: 1.9, tilt: 0.16, color: 0x8baa3c },
  { x: -0.015, y: -0.065, z: 0.048, radius: 0.019, phase: 3.7, tilt: -0.08, color: 0x709230 },
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

  const sphere = new THREE.SphereGeometry(1, 24, 18);
  // A soft, asymmetric silhouette makes the character organic rather than a
  // perfect green ball. This mesh is built once and shared by all three.
  const bodyGeometry = sphere.clone();
  const vertices = bodyGeometry.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
    const variation = 1 + 0.065 * Math.sin(4 * x + 2 * y) * Math.cos(3 * z - y)
      + 0.024 * Math.sin(8 * x - 2 * z) * Math.sin(7 * y + z);
    // Wider at the brow, narrower at the belly, with gently uneven cheeks.
    // Unlike a sphere this keeps a distinctive silhouette at small sizes.
    const width = 1 + .19 * y - .055 * y * y;
    vertices.setXYZ(i, x * variation * width, y * variation * .88,
      z * variation * (.9 + .06 * y));
  }
  bodyGeometry.computeVertexNormals();
  const limbGeometry = new THREE.CylinderGeometry(0.055, 0.075, 1, 8);
  const toothGeometry = new THREE.ConeGeometry(1, 1, 8);
  const mouthShape = new THREE.Shape();
  mouthShape.moveTo(-.47, -.18);
  mouthShape.bezierCurveTo(-.30, -.28, .26, -.32, .47, -.16);
  mouthShape.bezierCurveTo(.38, -.53, -.28, -.56, -.47, -.18);
  const mouthGeometry = new THREE.ShapeGeometry(mouthShape, 12);
  const lipGeometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.49,-.16,0), new THREE.Vector3(-.26,-.25,0),
    new THREE.Vector3(.04,-.27,0), new THREE.Vector3(.29,-.24,0),
    new THREE.Vector3(.49,-.14,0),
  ]), 20, .032, 6, false);
  const green = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.43, metalness: 0 });
  green.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMicrobePosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMicrobePosition = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vMicrobePosition;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float mottling = sin(vMicrobePosition.x * 17.0 + sin(vMicrobePosition.y * 8.0))
                       * sin(vMicrobePosition.z * 19.0 + vMicrobePosition.y * 11.0);
        float freckles = pow(max(0.0, sin(vMicrobePosition.x * 31.0 + sin(vMicrobePosition.z * 13.0))
                       * sin(vMicrobePosition.y * 33.0 + vMicrobePosition.z * 11.0)), 10.0);
        diffuseColor.rgb *= 0.96 + 0.04 * mottling - 0.07 * freckles;`);
  };
  const limb = new THREE.MeshStandardMaterial({ color: 0x71972e, roughness: 0.55 });
  const white = new THREE.MeshStandardMaterial({ color: 0xfffdf2, roughness: 0.32 });
  const iris = new THREE.MeshStandardMaterial({ color: 0x578339, roughness: 0.28 });
  const pupil = new THREE.MeshStandardMaterial({ color: 0x182719, roughness: 0.26 });
  const mouthMaterial = new THREE.MeshStandardMaterial({ color: 0x263619, roughness: 0.62 });
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
  const bodies = instances(bodyGeometry, green, CAST.length);
  const limbs = instances(limbGeometry, limb, CAST.length * 12); // arms, legs and fingers
  const hands = instances(sphere, limb, CAST.length * 4);
  const brows = instances(limbGeometry, limb, CAST.length * 2);
  const eyes = instances(sphere, white, CAST.length * 2);
  const irises = instances(sphere, iris, CAST.length * 2);
  const pupils = instances(sphere, pupil, CAST.length * 2);
  const glints = instances(sphere, white, CAST.length * 2);
  const mouths = instances(mouthGeometry, mouthMaterial, CAST.length);
  const lips = instances(lipGeometry, limb, CAST.length);
  const teeth = instances(toothGeometry, white, CAST.length * 4);
  CAST.forEach((character, i) => {
    const color = new THREE.Color(character.color);
    bodies.setColorAt(i, color);
  });
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;

  const position = new THREE.Vector3();
  const center = new THREE.Vector3();
  const relative = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const characterPose = new THREE.Euler();
  const componentRotation = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  const axis = new THREE.Vector3(0, 0, 1);
  const upAxis = new THREE.Vector3(0, 1, 0);
  const start = new THREE.Vector3(), end = new THREE.Vector3(), delta = new THREE.Vector3();
  function put(mesh, index, x, y, z, sx, sy, sz, angle = 0) {
    relative.set(x, y, z).applyQuaternion(rotation);
    position.copy(center).add(relative);
    componentRotation.setFromAxisAngle(axis, angle).premultiply(rotation);
    scale.set(sx, sy, sz);
    matrix.compose(position, componentRotation, scale);
    mesh.setMatrixAt(index, matrix);
  }
  function segment(mesh, index, ax, ay, az, bx, by, bz, radius) {
    start.set(ax, ay, az); end.set(bx, by, bz);
    delta.subVectors(end, start);
    position.copy(start).add(end).multiplyScalar(.5).applyQuaternion(rotation).add(center);
    componentRotation.setFromUnitVectors(upAxis, delta.normalize()).premultiply(rotation);
    scale.set(radius, start.distanceTo(end), radius);
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
      // Faces turn toward the authored macro viewpoint while the entire
      // character remains a 3D object on the tooth, including during orbit.
      characterPose.set(0, -.82, c.tilt + wobble * .045, 'ZYX');
      rotation.setFromEuler(characterPose);
      put(bodies, i, 0, 0, 0, r * 1.08, r * 0.94, r * 0.72);
      for (let side = 0; side < 2; side++) {
        const sign = side ? 1 : -1;
        const idx = i * 2 + side;
        put(eyes, idx, sign * r * 0.35, r * 0.25, r * 0.62, r * 0.25, r * 0.28, r * 0.17);
        put(irises, idx, sign * r * 0.35, r * 0.235, r * 0.775, r * 0.13, r * 0.15, r * 0.065);
        put(pupils, idx, sign * r * 0.35, r * 0.235, r * 0.832, r * 0.075, r * 0.09, r * 0.033);
        put(glints, idx, sign * r * 0.35 - r * 0.027, r * 0.28, r * 0.866, r * 0.025, r * 0.03, r * 0.014);
        segment(brows, idx, sign * r * .18, r * .54, r * .67, sign * r * .51, r * .57, r * .62, r * 1.1);
        const wave = wobble * 0.055;
        const elbowX = sign * r * 1.20, elbowY = -r * (0.20 + wave);
        const handX = sign * r * 1.46, handY = -r * (0.46 + wave);
        segment(limbs, i * 12 + side * 2, sign * r * 0.84, -r * 0.06, 0, elbowX, elbowY, r * .06, r);
        segment(limbs, i * 12 + side * 2 + 1, elbowX, elbowY, r * .06, handX, handY, r * .09, r * .85);
        segment(limbs, i * 12 + 4 + side, sign * r * .38, -r * .76, 0, sign * r * .50, -r * 1.18, r * .08, r * .9);
        for (let finger = 0; finger < 3; finger++) {
          segment(limbs, i * 12 + 6 + side * 3 + finger,
            handX, handY, r * .09, handX + sign * r * (.15 + finger * .035),
            handY + r * (.10 - finger * .105), r * .13, r * .45);
        }
        put(hands, i * 4 + side, handX, handY, r * .09, r * .12, r * .10, r * .10);
        put(hands, i * 4 + 2 + side, sign * r * .52, -r * 1.19, r * .1, r * .15, r * .09, r * .12);
      }
      put(mouths, i, 0, 0, r * .825, r, r, r);
      put(lips, i, 0, 0, r * .83, r, r, r);
      for (let tooth = 0; tooth < 4; tooth++) {
        put(teeth, i * 4 + tooth, (tooth - 1.5) * r * .18, -r * (.29 + (tooth % 2) * .012), r * .85,
          r * .055, r * (.10 + (tooth % 3) * .018), r * .045, Math.PI);
      }
    });
    meshes.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; });
    return !reducedMotion;
  }
  function dispose() {
    object.removeFromParent();
    sphere.dispose(); bodyGeometry.dispose(); limbGeometry.dispose(); toothGeometry.dispose(); mouthGeometry.dispose(); lipGeometry.dispose();
    green.dispose(); limb.dispose(); white.dispose(); iris.dispose(); pupil.dispose(); mouthMaterial.dispose();
    meshes.forEach(mesh => mesh.dispose());
  }
  return { object, update, dispose };
}

