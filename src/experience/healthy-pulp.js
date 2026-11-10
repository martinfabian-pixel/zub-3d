import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Native Dundee FDI 36 axes, expressed in millimetres here. The mesial and
// distal curves follow the existing illustrative root paths in the visible
// section. These shapes are an educational approximation of internal tissue.
const limits = { minX: -4.5, maxX: 6, minY: -13, maxY: 4.6, minZ: -.88, maxZ: .66 };
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
  const [mesial, distal] = canalCenters(y);
  const radius = (.43 - .30 * smooth(.2, 12.15, -y)) * smooth(-12.38, -11.90, y);
  return { y, mesial, distal, radius, width: 2.58 * (.85 + .15 * smooth(-.2, 2.1, y)) };
}

function distanceToPulp(x, z, { y, mesial, distal, radius, width }) {
  let body = Infinity;
  if (y > -.82) {
    body = ellipsoid(x - .14, y - 1.20, z + .11, width, 1.42, .57);
    const mesialHorn = ellipsoid(x + 1.42, y - 2.33, z + .09, .72, 1.02, .39);
    const distalHorn = ellipsoid(x - 1.60, y - 2.22, z + .10, .69, .92, .36);
    body = join(join(body, mesialHorn, .26), distalHorn, .24);
  }
  if (y > 1.1 || y < -12.4) return body;
  const depth = (z + .055) * 1.42;
  const first = Math.sqrt((x - mesial) ** 2 + depth ** 2) - radius;
  const second = Math.sqrt((x - distal) ** 2 + depth ** 2) - radius * .93;
  return join(body, Math.min(first, second), .28);
}

function makePulpGeometry(planeZ, normal) {
  const { minX, maxX, minY, maxY, minZ, maxZ } = limits;
  const nx = 75, ny = 112, nz = 19;
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
  const slopeX = normal.x / normal.z, slopeY = normal.y / normal.z;

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
    positions.push(x * .001, y * .001, (planeZ(x, y) + z) * .001);
    const d = .012, profile = tissueProfile(y);
    const gz = distanceToPulp(x, z + d, profile) - distanceToPulp(x, z - d, profile);
    const gx = distanceToPulp(x + d, z, profile) - distanceToPulp(x - d, z, profile) + gz * slopeX;
    const gy = distanceToPulp(x, z, tissueProfile(y + d)) - distanceToPulp(x, z, tissueProfile(y - d)) + gz * slopeY;
    const length = Math.hypot(gx, gy, gz) || 1;
    normals.push(gx / length, gy / length, gz / length);
    color.copy(rootColor).lerp(crownColor, smooth(-7, 2.5, y));
    const variation = 1 + .027 * Math.sin(1.8 * x + 1.3 * y) * Math.sin(2.8 * x - 1.5 * y);
    colors.push(color.r * variation, color.g * variation, color.b * variation);
    edges.set(key, id);
    return id;
  }

  function triangle(a, b, c) {
    const i = a * 3, j = b * 3, k = c * 3;
    const ux = positions[j] - positions[i], uy = positions[j + 1] - positions[i + 1], uz = positions[j + 2] - positions[i + 2];
    const vx = positions[k] - positions[i], vy = positions[k + 1] - positions[i + 1], vz = positions[k + 2] - positions[i + 2];
    const facing = (uy * vz - uz * vy) * (normals[i] + normals[j] + normals[k])
      + (uz * vx - ux * vz) * (normals[i + 1] + normals[j + 1] + normals[k + 1])
      + (ux * vy - uy * vx) * (normals[i + 2] + normals[j + 2] + normals[k + 2]);
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
        triangle(...outside.map(index => crossing(inside[0], index)));
      } else if (outside.length === 1) {
        triangle(...inside.map(index => crossing(outside[0], index)));
      } else if (inside.length === 2) {
        const a = crossing(inside[0], outside[0]), b = crossing(inside[0], outside[1]);
        const c = crossing(inside[1], outside[0]), d = crossing(inside[1], outside[1]);
        triangle(a, b, c);
        triangle(b, d, c);
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

function makeSectionMask() {
  const { minX, maxX, minY, maxY } = limits;
  const width = 128, height = 192;
  const mask = new Uint8Array(width * height);
  for (let j = 0; j < height; j++) {
    const y = minY + (maxY - minY) * (j + .5) / height;
    const profile = tissueProfile(y);
    for (let i = 0; i < width; i++) {
      const x = minX + (maxX - minX) * (i + .5) / width;
      mask[j * width + i] = Math.round(255 * (1 - smooth(-.015, .25, distanceToPulp(x, 0, profile))));
    }
  }
  const texture = new THREE.DataTexture(mask, width, height, THREE.RedFormat);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function taperedVessel(points, radius, planeZ) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) =>
    new THREE.Vector3(x * .001, y * .001, (planeZ(x, y) + z) * .001)), false, 'centripetal');
  const steps = 24, sides = 6;
  const geometry = new THREE.TubeGeometry(curve, steps, radius * .001, sides, false);
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

/** The soft tissue crosses the dentin section plane and remains attached to
 * FDI 36 when the user orbits. The thin strands lie behind its shaded skin. */
export function createHealthyPulp({ planeNormal, planeDistance }) {
  const planeZ = (x, y) => (planeDistance * 1000 - planeNormal.x * x - planeNormal.y * y) / planeNormal.z;
  const object = new THREE.Group();
  object.name = 'Healthy FDI 36 · schematic pulp and root canals';
  const tissue = new THREE.Mesh(makePulpGeometry(planeZ, planeNormal), new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: .55, clearcoat: .09, clearcoatRoughness: .52,
    transparent: true, depthWrite: false, opacity: .87,
  }));
  tissue.name = 'Pulp tissue · continuous chamber and canals';
  tissue.renderOrder = 8;
  tissue.raycast = () => {};
  object.add(tissue);

  // Sample the same root paths as the tissue. The strands recede toward the
  // section plane as the outer tissue narrows, so they remain embedded.
  const rootStrand = index => Array.from({ length: 20 }, (_, i) => {
    const y = .35 - 11.95 * i / 19;
    return [canalCenters(y)[index], y, -.025 + .085 * smooth(-10, -.2, y)];
  });
  const vessels = [
    [rootStrand(0), .052], [rootStrand(1), .047],
    [[[-1.42, .36, .07], [-1.27, 1.04, .14], [-1.72, 1.68, .16], [-1.66, 2.33, .06], [-1.38, 2.85, .045]], .058],
    [[[-1.62, 1.65, .15], [-.95, 1.86, .19], [-.39, 2.03, .13], [-.22, 2.35, .065]], .039],
    [[[1.73, .41, .07], [1.46, .92, .14], [1.65, 1.56, .16], [1.42, 2.15, .12], [1.60, 2.66, .055]], .056],
    [[[1.64, 1.52, .15], [1.01, 1.57, .23], [.58, 1.75, .23], [.21, 1.69, .15]], .035],
  ];
  const nerves = [
    [[[-1.16, .38, .11], [-.86, .88, .19], [-1.07, 1.45, .24], [-.80, 1.92, .19], [-.61, 2.18, .10]], .035],
    [[[1.23, .43, .12], [.93, .88, .22], [.96, 1.28, .23], [.47, 1.53, .23], [.12, 1.48, .15]], .031],
  ];
  const strands = [[vessels, '#8a404f'], [nerves, '#eac2ae']].map(([paths, color]) => {
    const parts = paths.map(([points, radius]) => taperedVessel(points, radius, planeZ));
    const geometry = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color, roughness: .73, transparent: true, depthWrite: false, opacity: .75,
    }));
    mesh.name = 'Embedded illustrative branches';
    mesh.raycast = () => {};
    mesh.renderOrder = 7;
    object.add(mesh);
    return mesh;
  });
  const sectionMask = makeSectionMask();

  function setReveal(weight) {
    const strength = THREE.MathUtils.clamp(weight, 0, 1);
    object.visible = strength > .001;
    tissue.material.opacity = .87 * strength;
    for (const mesh of strands) mesh.material.opacity = .75 * strength;
  }
  function dispose() {
    for (const mesh of object.children) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    sectionMask.dispose();
    object.removeFromParent();
  }
  setReveal(0);
  return { object, sectionMask, setReveal, dispose };
}
