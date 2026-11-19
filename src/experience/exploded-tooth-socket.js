import * as THREE from 'three';

const width = 15.4;
const depth = 7.6;
const base = -3.9;
const across = 72;
const backward = 20;
const smooth = (min, max, value) => THREE.MathUtils.smoothstep(value, min, max);

function randomFrom(seed) {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function texture(bytes, w, h, color = false) {
  const map = new THREE.DataTexture(bytes, w, h, THREE.RGBAFormat);
  map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.needsUpdate = true;
  return map;
}

/** Bake a fine trabecular cut surface with varied, rounded pore contours. */
function boneMaps() {
  const w = 384, h = 208;
  const rng = randomFrom(0x3677);
  const pores = new Float32Array(w * h);
  const rims = new Float32Array(w * h);
  function spot(cx, cy, rx, ry, angle, shade) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const extent = Math.ceil(Math.max(rx, ry) * 1.27);
    for (let y = Math.max(0, Math.floor(cy - extent)); y < Math.min(h, cy + extent); y++) {
      for (let x = Math.max(0, Math.floor(cx - extent)); x < Math.min(w, cx + extent); x++) {
        const dx = x - cx, dy = y - cy;
        const tx = (dx * c - dy * s) / rx, ty = (dx * s + dy * c) / ry;
        const radius = Math.hypot(tx, ty);
        const jitter = Math.sin(tx * 5.7 + angle) * Math.cos(ty * 6.4) * .095;
        const edge = radius + jitter;
        const i = y * w + x;
        pores[i] = Math.max(pores[i], (1 - smooth(.53, 1.0, edge)) * shade);
        rims[i] = Math.max(rims[i], smooth(.76, 1.02, edge) * (1 - smooth(1.02, 1.25, edge)) * shade);
      }
    }
  }

  for (let row = 0; row < 13; row++) {
    for (let col = 0; col < 22; col++) {
      const x = (col + .16 + rng() * .68) * w / 22;
      const y = (row + .13 + rng() * .74) * h / 13;
      const radius = 1.9 + 4.9 * rng() ** 1.45;
      spot(x, y, radius * (1.07 + rng() * .5), radius, rng() * Math.PI, .55 + rng() * .4);
      if (rng() > .36) spot(x + 6 - rng() * 12, y + 6 - rng() * 12, 1.45, 1.6 + rng() * 1.1, rng() * 3, .34 + rng() * .37);
    }
  }

  const color = new Uint8Array(w * h * 4);
  const height = new Uint8Array(w * h * 4);
  for (let i = 0; i < pores.length; i++) {
    const x = i % w, y = Math.floor(i / w), p = pores[i], rim = rims[i];
    const fleck = (rng() - .5) * 8;
    const drift = 4 * Math.sin(x * .056 + y * .031) * Math.sin(y * .081 - x * .016);
    const shade = 1 - .53 * p;
    const j = i * 4;
    color[j] = (226 + fleck + drift + rim * 11) * shade;
    color[j + 1] = (204 + fleck + drift + rim * 11) * (shade - .049 * p);
    color[j + 2] = (175 + fleck + drift + rim * 11) * (shade - .079 * p);
    color[j + 3] = 255;
    const level = 173 - p * 137 + rim * 16 + fleck;
    height[j] = height[j + 1] = height[j + 2] = level;
    height[j + 3] = 255;
  }
  return { color: texture(color, w, h, true), bump: texture(height, w, h) };
}

function gumTexture() {
  const size = 128;
  const values = new Uint8Array(size * size * 4);
  const rng = randomFrom(0x531a);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const value = 128 + 7 * Math.sin(x * .23 + 1.8 * Math.sin(y * .16))
        + 4 * Math.sin(x * .57 - y * .29) + 6 * (rng() - .5);
      const i = (y * size + x) * 4;
      values[i] = values[i + 1] = values[i + 2] = value;
      values[i + 3] = 255;
    }
  }
  return texture(values, size, size);
}

function trough(x, back) {
  // The two recesses are deepest at the cut face. Their upper contours are
  // broader than their rounded apical tips, with a septum between them.
  const near = 1 - smooth(.14, .78, back);
  const mesial = 1 - smooth(.12, 1.95, Math.abs(x + 2.42 + back * .25));
  const distal = 1 - smooth(.10, 1.84, Math.abs(x - 2.61 + back * .18));
  return near * Math.max(mesial, distal * .91);
}

function outerPosition(u, back) {
  const nx = u * 2 - 1;
  const nz = 1 - 2 * back;
  const x = nx * width * .5 * (1 - .032 * nz ** 8);
  const z = nz * (depth * .5 - .23 * nx ** 12);
  return [x, z];
}

function crest(x, back) {
  const dip = trough(x, back);
  const ridge = 2.63 + .39 * Math.cos(x * .27) + .21 * Math.sin(x * .8)
    - .36 * Math.abs(x / (width * .5)) ** 5;
  return ridge - 5.28 * dip;
}

function gumThickness(x, back) {
  const dip = trough(x, back);
  return .12 + (1 - smooth(.22, .89, dip)) * (.65 + .12 * Math.sin(x * .47 + back * 4));
}

function floor(u, back) {
  return base + .17 * (u * 2 - 1) ** 10 + .14 * (1 - 2 * back) ** 8;
}

function grid(columns, rows, sample, invert = false) {
  const positions = [], uvs = [], colors = [], indices = [];
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      const u = column / columns, v = row / rows;
      const { point, uv = [u, v], color } = sample(u, v);
      positions.push(...point);
      uvs.push(...uv);
      if (color) colors.push(color.r, color.g, color.b);
      if (row && column) {
        const b = row * (columns + 1) + column;
        const a = b - columns - 2;
        if (invert) indices.push(a, b - 1, a + 1, a + 1, b - 1, b);
        else indices.push(a, a + 1, b - 1, a + 1, b, b - 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (colors.length) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Section through the bone and gingiva around the lower molar. Millimetres. */
export function createExplodedToothSocket() {
  const object = new THREE.Group();
  object.name = 'exploded-bone';
  const { color, bump } = boneMaps();
  const gumBump = gumTexture();
  const materials = [
    new THREE.MeshStandardMaterial({ map: color, bumpMap: bump, bumpScale: .24, roughness: .77 }),
    new THREE.MeshStandardMaterial({ color: '#c6aa87', roughness: .75 }),
    new THREE.MeshPhysicalMaterial({
      vertexColors: true, bumpMap: gumBump, bumpScale: .19, roughness: .59,
      clearcoat: .16, clearcoatRoughness: .68, side: THREE.DoubleSide,
    }),
  ];
  const [sectionMaterial, cortexMaterial, gingivaMaterial] = materials;
  function add(name, geometry, material) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    object.add(mesh);
  }

  function boneFace(u, v, back, cut = false) {
    const [x, z] = outerPosition(u, back);
    const y = THREE.MathUtils.lerp(floor(u, back), crest(x, back), v);
    return { point: [x, y, z], uv: cut ? [x / width + .5, (y - base) / 7.8] : [u, v] };
  }
  add('Trabecular bone · cut surface', grid(across, 1, (u, v) => boneFace(u, v, 0, true)), sectionMaterial);
  add('Alveolar bone · rear cortex', grid(across, 1, (u, v) => boneFace(u, v, 1), true), cortexMaterial);
  add('Alveolar bone · left cortex', grid(backward, 1, (u, v) => boneFace(0, v, u), true), cortexMaterial);
  add('Alveolar bone · right cortex', grid(backward, 1, (u, v) => boneFace(1, v, u)), cortexMaterial);
  add('Alveolar bone · basal face', grid(across, backward, (u, back) => {
    const [x, z] = outerPosition(u, back);
    return { point: [x, floor(u, back), z] };
  }, true), cortexMaterial);
  add('Alveolar bone · socket beds', grid(across, backward, (u, back) => {
    const [x, z] = outerPosition(u, back);
    return { point: [x, crest(x, back), z] };
  }), cortexMaterial);

  const deepGum = new THREE.Color('#864341');
  const upperGum = new THREE.Color('#bc746f');
  const cutGum = new THREE.Color('#a85d57');
  function gumPoint(u, back, height, cut = false) {
    const [x, z] = outerPosition(u, back);
    const dip = trough(x, back);
    const soften = Math.sin(height * Math.PI);
    const curvedZ = z + soften * (1 - 2 * back) ** 9 * .115;
    const y = crest(x, back) + gumThickness(x, back) * height;
    const tint = (cut ? cutGum : upperGum).clone().lerp(deepGum, dip * .72);
    tint.multiplyScalar(1 + .04 * Math.sin(x * 2.1 + back * 7));
    return { point: [x, y, curvedZ], color: tint, uv: [u, cut ? height : back] };
  }
  add('Gingiva · paired sockets', grid(across, backward, (u, back) => gumPoint(u, back, 1)), gingivaMaterial);
  add('Gingiva · round front rim', grid(across, 6, (u, h) => gumPoint(u, 0, h, true)), gingivaMaterial);
  add('Gingiva · rear rim', grid(across, 5, (u, h) => gumPoint(u, 1, h), true), gingivaMaterial);
  add('Gingiva · left rim', grid(backward, 5, (u, h) => gumPoint(0, u, h), true), gingivaMaterial);
  add('Gingiva · right rim', grid(backward, 5, (u, h) => gumPoint(1, u, h)), gingivaMaterial);
  return {
    object,
    dispose() {
      for (const mesh of object.children) mesh.geometry.dispose();
      for (const material of materials) material.dispose();
      color.dispose();
      bump.dispose();
      gumBump.dispose();
    },
  };
}
