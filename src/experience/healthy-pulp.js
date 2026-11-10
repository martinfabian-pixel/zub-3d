import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Schematic pulp of FDI 36, in the native tooth's axes and millimetres.
const limits = { minX: -4.5, maxX: 5.3, minY: -11.75, maxY: 5, minZ: -2.2, maxZ: 2.2 };
const tetrahedra = [
  [0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6],
  [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6],
];

function smooth(from, to, value) {
  return THREE.MathUtils.smoothstep(value, from, to);
}

function canalCenters(y) {
  const descent = Math.max(0, Math.min(1, (1.05 - y) / 13.3));
  return [
    -2.08 + .67 * (1 - smooth(0, 4.8, -y)) + 2.42 * smooth(4.8, 12.1, -y),
    1.49 + 3.69 * descent * (1.17 - .17 * descent),
  ];
}

function ellipsoid(x, y, z, rx, ry, rz) {
  return (Math.sqrt((x / rx) ** 2 + (y / ry) ** 2 + (z / rz) ** 2) - 1) * rz;
}

function join(a, b, blend) {
  const k = Math.max(blend - Math.abs(a - b), 0) / blend;
  return Math.min(a, b) - k * k * blend * .25;
}

function tissueProfile(y) {
  const [left, right] = canalCenters(y);
  const taper = smooth(2.3, 11.3, -y);
  const radius = (.94 - .79 * smooth(.1, 10.7, -y)) * smooth(-11.36, -10.76, y);
  return { y, mesial: left - 1.03 * taper, distal: right - 1.92 * taper, radius };
}

function distanceToPulp(x, z, { y, mesial, distal, radius }) {
  let chamber = Infinity;
  if (y > -2.9) {
    chamber = ellipsoid(x - .05, y - .79, z + .06, 3.10, 2.52, 1.37);
    const leftHorn = ellipsoid(x + 1.85, y - 2.15, z - .06, 1.28, 1.72, 1.01);
    const rightHorn = ellipsoid(x - 1.69, y - 2.36, z + .12, 1.31, 1.51, .99);
    chamber = join(join(chamber, leftHorn, .47), rightHorn, .44);
  }
  if (y > .70 || y < -11.36) return chamber;
  const depth = (z + .12) * 1.23;
  const left = Math.sqrt((x - mesial) ** 2 + depth ** 2) - radius;
  const right = Math.sqrt((x - distal) ** 2 + depth ** 2) - radius * .92;
  return join(chamber, Math.min(left, right), .53);
}

function makePulpGeometry() {
  const { minX, maxX, minY, maxY, minZ, maxZ } = limits;
  const nx = 75, ny = 112, nz = 22;
  const row = nx + 1, slab = row * (ny + 1);
  const dx = (maxX - minX) / nx, dy = (maxY - minY) / ny, dz = (maxZ - minZ) / nz;
  const field = new Float32Array(slab * (nz + 1));
  const profiles = Array.from({ length: ny + 1 }, (_, j) => tissueProfile(minY + j * dy));
  for (let k = 0; k <= nz; k++) {
    const z = minZ + k * dz;
    for (let j = 0; j <= ny; j++) {
      const base = k * slab + j * row;
      for (let i = 0; i <= nx; i++) field[base + i] = distanceToPulp(minX + i * dx, z, profiles[j]);
    }
  }

  // Generate the connected surface of the chamber and both canals once.
  // Adjacent tetrahedra share each crossing vertex, including at branch joins.
  const positions = [], normals = [], colors = [], indices = [];
  const edges = new Map();
  const corners = new Uint32Array(8);
  const color = new THREE.Color();
  const crownColor = new THREE.Color('#bf7983');
  const rootColor = new THREE.Color('#b36d77');
  const coral = new THREE.Color('#dd8c7b');

  function crossing(a, b) {
    if (b < a) [a, b] = [b, a];
    const key = a * field.length + b;
    if (edges.has(key)) return edges.get(key);
    const ax = a % row, bx = b % row;
    const ay = Math.floor(a % slab / row), by = Math.floor(b % slab / row);
    const az = Math.floor(a / slab), bz = Math.floor(b / slab);
    const ratio = field[a] / (field[a] - field[b]);
    const x = minX + (ax + ratio * (bx - ax)) * dx;
    const y = minY + (ay + ratio * (by - ay)) * dy;
    const z = minZ + (az + ratio * (bz - az)) * dz;
    const id = positions.length / 3;
    positions.push(x, y, z);
    const d = .012, profile = tissueProfile(y);
    const gz = distanceToPulp(x, z + d, profile) - distanceToPulp(x, z - d, profile);
    const gx = distanceToPulp(x + d, z, profile) - distanceToPulp(x - d, z, profile);
    const gy = distanceToPulp(x, z, tissueProfile(y + d)) - distanceToPulp(x, z, tissueProfile(y - d));
    const length = Math.hypot(gx, gy, gz) || 1;
    normals.push(gx / length, gy / length, gz / length);
    color.copy(rootColor).lerp(crownColor, smooth(-7, 2.5, y));
    const variation = 1 + .027 * Math.sin(1.8 * x + 1.3 * y) * Math.sin(2.8 * x - 1.5 * y);
    color.multiplyScalar(variation).lerp(coral, .46);
    colors.push(color.r, color.g, color.b);
    edges.set(key, id);
    return id;
  }

  function triangle(a, b, c, insideSample, outsideSample) {
    const i = a * 3, j = b * 3, k = c * 3;
    const ux = positions[j] - positions[i], uy = positions[j + 1] - positions[i + 1], uz = positions[j + 2] - positions[i + 2];
    const vx = positions[k] - positions[i], vy = positions[k + 1] - positions[i + 1], vz = positions[k + 2] - positions[i + 2];
    // The line between inside and outside samples always points outward
    // through the tetrahedron, even where the tissue tapers to a fine tip.
    const stepX = (outsideSample % row - insideSample % row) * dx;
    const stepY = (Math.floor(outsideSample % slab / row) - Math.floor(insideSample % slab / row)) * dy;
    const stepZ = (Math.floor(outsideSample / slab) - Math.floor(insideSample / slab)) * dz;
    const facing = (uy * vz - uz * vy) * stepX + (uz * vx - ux * vz) * stepY + (ux * vy - uy * vx) * stepZ;
    if (facing >= 0) indices.push(a, b, c);
    else indices.push(a, c, b);
  }

  const inside = [], outside = [];
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const start = z * slab + y * row + x;
    corners[0] = start;
    corners[1] = start + 1;
    corners[2] = start + row + 1;
    corners[3] = start + row;
    corners[4] = start + slab;
    corners[5] = start + slab + 1;
    corners[6] = start + slab + row + 1;
    corners[7] = start + slab + row;
    let mask = 0;
    for (let i = 0; i < 8; i++) if (field[corners[i]] < 0) mask |= 1 << i;
    if (mask === 0 || mask === 255) continue;
    for (const tetrahedron of tetrahedra) {
      inside.length = 0;
      outside.length = 0;
      for (const corner of tetrahedron) (mask & (1 << corner) ? inside : outside).push(corners[corner]);
      if (inside.length === 1) {
        triangle(...outside.map(index => crossing(inside[0], index)), inside[0], outside[0]);
      } else if (outside.length === 1) {
        triangle(...inside.map(index => crossing(outside[0], index)), inside[0], outside[0]);
      } else if (inside.length === 2) {
        const a = crossing(inside[0], outside[0]), b = crossing(inside[0], outside[1]);
        const c = crossing(inside[1], outside[0]), d = crossing(inside[1], outside[1]);
        triangle(a, b, c, inside[0], outside[0]);
        triangle(b, d, c, inside[0], outside[0]);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function taperedVessel(points, radius) {
  const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)), false, 'centripetal');
  const steps = 24, sides = 6;
  const geometry = new THREE.TubeGeometry(curve, steps, radius, sides, false);
  const positions = geometry.getAttribute('position');
  const center = new THREE.Vector3();
  for (let row = 0; row <= steps; row++) {
    const t = row / steps;
    curve.getPointAt(t, center);
    const scale = .22 + .78 * (1 - t) ** .6;
    for (let column = 0; column <= sides; column++) {
      const i = row * (sides + 1) + column;
      positions.setXYZ(i, center.x + scale * (positions.getX(i) - center.x),
        center.y + scale * (positions.getY(i) - center.y), center.z + scale * (positions.getZ(i) - center.z));
    }
  }
  return geometry;
}

function pulpBranches() {
  const stem = (side, offset) => Array.from({ length: 16 }, (_, i) => {
    const y = .28 - 11 * i / 15;
    const { mesial, distal, radius } = tissueProfile(y);
    const x = side ? distal : mesial;
    return [x + radius * (offset + .16 * Math.sin(i * 1.27)), y, -.12 + radius * .63];
  });
  return [
    [
      [stem(0, -.14), .077], [stem(1, .18), .066],
      [[[-1.53, .27, .48], [-1.46, 1.08, .89], [-1.89, 1.72, .78], [-1.69, 2.46, .75], [-1.93, 3.19, .54]], .074],
      [[[-1.65, 1.48, .75], [-1.11, 1.63, .99], [-.62, 2.24, .85], [-.73, 2.69, .67]], .054],
      [[[-1.70, 2.41, .74], [-2.22, 2.63, .58], [-2.40, 2.93, .44]], .043],
      [[[1.56, .23, .50], [1.68, .96, .88], [1.31, 1.72, .99], [1.85, 2.34, .66], [1.70, 3.18, .52]], .076],
      [[[1.29, 1.71, .99], [.68, 1.95, .93], [.25, 2.38, .83]], .055],
      [[[1.76, 2.20, .73], [2.29, 2.25, .54], [2.52, 2.62, .35]], .044],
    ],
    [
      [stem(0, .18), .039], [stem(1, -.18), .034],
      [[[-1.21, .42, .53], [-.83, .83, 1.03], [-1.05, 1.38, 1.07], [-.64, 1.86, 1.00], [-.51, 2.25, .87]], .045],
      [[[1.22, .45, .59], [.91, .99, 1.05], [.98, 1.46, 1.01], [.53, 1.72, 1.06], [.15, 1.50, 1.12]], .044],
      [[[.97, 1.46, 1.01], [1.35, 1.92, .96], [1.28, 2.60, .70]], .033],
    ],
  ];
}

/** Volumetric soft tissue with fine illustrative vascular and neural branches. */
export function createHealthyPulp() {
  const object = new THREE.Group();
  object.name = 'Healthy FDI 36 · schematic pulp and root canals';
  const tissue = new THREE.Mesh(makePulpGeometry(), new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: .46, clearcoat: .09, clearcoatRoughness: .52,
    specularIntensity: .48, transparent: true, depthWrite: false, opacity: .96,
  }));
  tissue.name = 'Pulp tissue · continuous chamber and canals';
  tissue.renderOrder = 8;
  tissue.raycast = () => {};
  object.add(tissue);

  const [vessels, nerves] = pulpBranches();
  for (const [paths, color] of [[vessels, '#74323e'], [nerves, '#eac2ae']]) {
    const parts = paths.map(([points, radius]) => taperedVessel(points, radius));
    const geometry = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color, roughness: .73, transparent: true, depthWrite: false, opacity: .60,
    }));
    mesh.name = 'Embedded illustrative branches';
    mesh.raycast = () => {};
    mesh.renderOrder = 9;
    object.add(mesh);
  }
  function dispose() {
    for (const mesh of object.children) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    object.removeFromParent();
  }
  return { object, dispose };
}
