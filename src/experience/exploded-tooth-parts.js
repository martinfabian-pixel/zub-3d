import * as THREE from 'three';
import { createHealthyPulp } from './healthy-pulp.js';

const millimetres = 1000;
const down = new THREE.Vector3(0, -1, 0);
const up = new THREE.Vector3(0, 1, 0);
const smooth = (a, b, value) => THREE.MathUtils.smoothstep(value, a, b);

// The scalloped cervical line keeps the enamel on the native crown and
// exposes a rounded rim where the corresponding root mantle begins.
function cervicalHeight({ x, z }) {
  return .34 + .38 * Math.cos(x * .62) + .26 * Math.sin(z * .72 - .25);
}

function readHealthySurface(geometry) {
  const { position, normal } = geometry.attributes;
  return Array.from({ length: position.count }, (_, index) => {
    const point = new THREE.Vector3().fromBufferAttribute(position, index).multiplyScalar(millimetres);
    const direction = new THREE.Vector3().fromBufferAttribute(normal, index).normalize();
    return { point, normal: direction, height: point.y - cervicalHeight(point) };
  });
}

function surfaceBuilder() {
  const positions = [], normals = [], colors = [], indices = [];
  return {
    vertex(point, normal, color) {
      const index = positions.length / 3;
      positions.push(point.x, point.y, point.z);
      normals.push(normal.x, normal.y, normal.z);
      colors.push(color.r, color.g, color.b);
      return index;
    },
    triangle(a, b, c) { indices.push(a, b, c); },
    geometry() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setIndex(indices);
      geometry.computeBoundingBox();
      return geometry;
    },
  };
}

function makeShell(surface, index, crown) {
  const builder = surfaceBuilder();
  const points = new Map(), crossings = new Map(), edge = new Map();
  const exteriorColor = new THREE.Color(crown ? '#fff9ed' : '#cbb49b');
  const neckColor = new THREE.Color('#eee2ce');
  const interiorColor = new THREE.Color(crown ? '#e9d9be' : '#d6c0a1');
  const rimColor = new THREE.Color(crown ? '#f9f0df' : '#e3cfb0');
  const color = new THREE.Color();
  const rimDirection = crown ? down : up;

  function addShellPoint({ point, normal }) {
    const { x, y, z } = point;
    const texture = 1 + (crown ? .018 : .045) * Math.sin(x * .83 + y * .68) * Math.cos(z * 1.22 - y * .54);
    const neck = 1 - smooth(.02, crown ? .95 : 1.65, Math.abs(y - cervicalHeight(point)));
    color.copy(exteriorColor).multiplyScalar(texture * (crown ? .96 + .04 * smooth(.2, 7.5, y) : 1)).lerp(neckColor, neck);
    const outside = builder.vertex(point, normal, color);
    let inset, inward;
    if (crown) {
      // Affine inset preserves the native cusp and fissure topology. It also
      // avoids normal offsets crossing where the occlusal surface is concave.
      inset = new THREE.Vector3(x * .80, y * .78 + .10, z * .80);
      inward = new THREE.Vector3(-normal.x / .80, -normal.y / .78, -normal.z / .80).normalize();
    } else {
      const thickness = .11 + .58 * smooth(-12, .25, y);
      inset = point.clone().addScaledVector(normal, -thickness);
      inward = normal.clone().negate();
    }
    const inside = builder.vertex(inset, inward, interiorColor);
    return { point, normal, outside, inset, inward, inside };
  }

  function getPoint(id) {
    if (!points.has(id)) points.set(id, addShellPoint(surface[id]));
    return points.get(id);
  }

  function getCrossing(a, b) {
    const low = Math.min(a, b), high = Math.max(a, b);
    const key = low * surface.length + high;
    if (!crossings.has(key)) {
      const first = surface[low], last = surface[high];
      const t = first.height / (first.height - last.height);
      crossings.set(key, addShellPoint({
        point: first.point.clone().lerp(last.point, t),
        normal: first.normal.clone().lerp(last.normal, t).normalize(),
      }));
    }
    return crossings.get(key);
  }

  function getRim(point) {
    if (edge.has(point)) return edge.get(point);
    const rings = [point.outside];
    for (let i = 1; i < 5; i++) {
      const angle = i / 5 * Math.PI;
      const across = .5 - .5 * Math.cos(angle);
      const round = Math.sin(angle);
      const vertex = point.point.clone().lerp(point.inset, across).addScaledVector(rimDirection, (crown ? .27 : .22) * round);
      const normal = point.normal.clone().lerp(point.inward, across).addScaledVector(rimDirection, round).normalize();
      rings.push(builder.vertex(vertex, normal, rimColor));
    }
    rings.push(point.inside);
    edge.set(point, rings);
    return rings;
  }

  function joinRim(a, b) {
    const first = getRim(a), last = getRim(b);
    for (let i = 0; i < first.length - 1; i++) {
      builder.triangle(last[i], first[i], first[i + 1]);
      builder.triangle(last[i], first[i + 1], last[i + 1]);
    }
  }

  for (let i = 0; i < index.count; i += 3) {
    const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    const kept = ids.map(id => (surface[id].height >= 0) === crown);
    if (!kept.some(Boolean)) continue;
    const face = [];
    const clipped = new Set();
    for (let corner = 0; corner < 3; corner++) {
      const next = (corner + 1) % 3;
      if (kept[corner]) face.push(getPoint(ids[corner]));
      if (kept[corner] !== kept[next]) {
        const point = getCrossing(ids[corner], ids[next]);
        clipped.add(point);
        face.push(point);
      }
    }
    for (let corner = 1; corner < face.length - 1; corner++) {
      builder.triangle(face[0].outside, face[corner].outside, face[corner + 1].outside);
      builder.triangle(face[0].inside, face[corner + 1].inside, face[corner].inside);
    }
    if (!clipped.size) continue;
    for (let corner = 0; corner < face.length; corner++) {
      const a = face[corner], b = face[(corner + 1) % face.length];
      if (clipped.has(a) && clipped.has(b)) joinRim(a, b);
    }
  }
  return builder.geometry();
}

function makeDentin(surface, index) {
  const builder = surfaceBuilder();
  const crown = new THREE.Color('#e7d3b0');
  const root = new THREE.Color('#bda17e');
  const rootScale = .69;
  const crownScale = .88;
  const color = new THREE.Color();
  const point = new THREE.Vector3(), normal = new THREE.Vector3();
  for (const item of surface) {
    const { x, y, z } = item.point;
    const crownWeight = smooth(-2, 1, y);
    const height = rootScale + (crownScale - rootScale) * crownWeight;
    const t = THREE.MathUtils.clamp((y + 2) / 3, 0, 1);
    const slope = height + 2 * (crownScale - rootScale) * y * t * (1 - t);
    point.set(x * .86, y * height, z * .83);
    normal.set(item.normal.x / .86, item.normal.y / slope, item.normal.z / .83).normalize();
    const grain = 1 + .035 * Math.sin(x * 1.65 + z * .61) * Math.cos(y * .64 - x * .42);
    color.copy(root).lerp(crown, smooth(-6, 4, y)).multiplyScalar(grain);
    builder.vertex(point, normal, color);
  }
  for (let i = 0; i < index.count; i += 3) builder.triangle(index.getX(i), index.getX(i + 1), index.getX(i + 2));
  return builder.geometry();
}

function toothPart(name, geometry, roughness, clearcoat) {
  const group = new THREE.Group();
  group.name = `exploded-${name}`;
  group.add(new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness, clearcoat, clearcoatRoughness: roughness + .05,
    specularIntensity: .68, envMapIntensity: .70,
  })));
  return group;
}

/** Shared, healthy FDI 36 contours in local millimetres. */
export function createExplodedToothParts({ host }) {
  const source = host.geometry;
  const index = source.index;
  const surface = readHealthySurface(source);
  const enamel = toothPart('enamel', makeShell(surface, index, true), .30, .21);
  const dentin = toothPart('dentin', makeDentin(surface, index), .52, .04);
  const cementum = toothPart('cementum', makeShell(surface, index, false), .61, .025);
  const pulp = new THREE.Group();
  pulp.name = 'exploded-pulp';
  const tissue = createHealthyPulp();
  tissue.object.scale.set(1.17, .69, 1.17);
  pulp.add(tissue.object);

  function dispose() {
    for (const group of [enamel, dentin, cementum]) {
      const mesh = group.children[0];
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    tissue.dispose();
  }

  return { enamel, dentin, pulp, cementum, dispose };
}
