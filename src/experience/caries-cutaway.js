import * as THREE from 'three';
import { createHealthyPulp } from './healthy-pulp.js';

const planeNormal = new THREE.Vector3(.10, .045, 1).normalize();
const planeDistance = -.0006;
const up = new THREE.Vector3(0, 1, 0).addScaledVector(planeNormal, -planeNormal.y).normalize();
const right = new THREE.Vector3().crossVectors(up, planeNormal);
const wipeDirection = right.clone().addScaledVector(up, .18);
const origin = planeNormal.clone().multiplyScalar(planeDistance);
const rimReach = .0018;

function planeContours(geometry) {
  const { position } = geometry.attributes;
  const distance = new Float32Array(position.count);
  const point = new THREE.Vector3(), other = new THREE.Vector3();
  let first = Infinity, last = -Infinity;
  for (let i = 0; i < distance.length; i++) {
    point.fromBufferAttribute(position, i);
    distance[i] = planeNormal.dot(point) - planeDistance;
    const extent = wipeDirection.dot(point);
    first = Math.min(first, extent); last = Math.max(last, extent);
  }

  // Crossing points are welded in section coordinates. UV seams on the
  // imported exterior otherwise split one closed edge into several chains.
  const ids = new Map(), vertices = [], neighbors = [];
  function crossing(a, b) {
    const t = distance[a] / (distance[a] - distance[b]);
    point.fromBufferAttribute(position, a).lerp(other.fromBufferAttribute(position, b), t);
    const x = point.dot(right), y = point.dot(up);
    const key = Math.round(x * 1e7) + '/' + Math.round(y * 1e7);
    if (!ids.has(key)) {
      ids.set(key, vertices.length);
      vertices.push(new THREE.Vector2(x, y));
      neighbors.push(new Set());
    }
    return ids.get(key);
  }
  const index = geometry.index;
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    const aboveA = distance[a] > 0, aboveB = distance[b] > 0, aboveC = distance[c] > 0;
    if (aboveA === aboveB && aboveB === aboveC) continue;
    let from, to;
    if (aboveA === aboveB) { from = crossing(a, c); to = crossing(b, c); }
    else if (aboveA === aboveC) { from = crossing(a, b); to = crossing(c, b); }
    else { from = crossing(b, a); to = crossing(c, a); }
    if (from !== to) {
      neighbors[from].add(to);
      neighbors[to].add(from);
    }
  }

  const contours = [], visited = new Set();
  for (let start = 0; start < vertices.length; start++) {
    if (visited.has(start) || neighbors[start].size === 0) continue;
    const contour = [];
    let current = start, previous = -1;
    do {
      if (visited.has(current) || neighbors[current].size !== 2) {
        throw new Error('Open or branched FDI 36 section contour.');
      }
      visited.add(current);
      contour.push(vertices[current]);
      const next = [...neighbors[current]].find(i => i !== previous);
      previous = current;
      current = next;
    } while (current !== start);
    if (contour.length >= 3 && Math.abs(THREE.ShapeUtils.area(contour)) > 1e-10) contours.push(contour);
  }
  if (!contours.length) throw new Error('FDI 36 section misses the native tooth.');
  return { contours, first: first - .00001, last: last + .00001 };
}

function contains(contour, point) {
  let inside = false;
  for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
    const a = contour[i], b = contour[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function buildCap(contours) {
  const bounds = new THREE.Box2();
  for (const contour of contours) for (const point of contour) bounds.expandByPoint(point);
  bounds.expandByScalar(.0002);
  const size = bounds.getSize(new THREE.Vector2());
  const entries = contours.map(contour => ({ contour, area: Math.abs(THREE.ShapeUtils.area(contour)) }))
    .sort((a, b) => b.area - a.area);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    entry.parent = entries.slice(0, i).reverse().find(other => contains(other.contour, entry.contour[0]));
    entry.depth = entry.parent ? entry.parent.depth + 1 : 0;
  }

  const positions = [], normals = [], uv = [], indices = [];
  const point = new THREE.Vector3();
  for (const entry of entries) {
    if (entry.depth % 2) continue;
    const holes = entries.filter(other => other.parent === entry).map(other => other.contour);
    const outline = entry.contour.concat(...holes);
    const start = positions.length / 3;
    for (const p of outline) {
      point.copy(origin).addScaledVector(right, p.x).addScaledVector(up, p.y);
      positions.push(point.x, point.y, point.z);
      normals.push(planeNormal.x, planeNormal.y, planeNormal.z);
      uv.push((p.x - bounds.min.x) / size.x, (p.y - bounds.min.y) / size.y);
    }
    const faces = THREE.ShapeUtils.triangulateShape(entry.contour, holes);
    for (const [a, b, c] of faces) {
      const side = (outline[b].x - outline[a].x) * (outline[c].y - outline[a].y) -
        (outline[b].y - outline[a].y) * (outline[c].x - outline[a].x);
      indices.push(start + a, start + (side < 0 ? c : b), start + (side < 0 ? b : c));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return { geometry, bounds };
}

function rimTexture(contours, bounds) {
  const width = 192, height = 320, distances = new Float32Array(width * height);
  distances.fill(rimReach ** 2);
  const size = bounds.getSize(new THREE.Vector2());
  const dx = size.x / width, dy = size.y / height;
  for (const contour of contours) {
    for (let i = 0; i < contour.length; i++) {
      const a = contour[i], b = contour[(i + 1) % contour.length];
      const ax = a.x - bounds.min.x, ay = a.y - bounds.min.y;
      const bx = b.x - bounds.min.x, by = b.y - bounds.min.y;
      const ux = bx - ax, uy = by - ay, length = ux * ux + uy * uy;
      const left = Math.max(0, Math.floor((Math.min(ax, bx) - rimReach) / dx));
      const rightEdge = Math.min(width - 1, Math.ceil((Math.max(ax, bx) + rimReach) / dx));
      const bottom = Math.max(0, Math.floor((Math.min(ay, by) - rimReach) / dy));
      const top = Math.min(height - 1, Math.ceil((Math.max(ay, by) + rimReach) / dy));
      if (length <= 0) continue;
      for (let y = bottom; y <= top; y++) {
        const py = (y + .5) * dy - ay;
        for (let x = left; x <= rightEdge; x++) {
          const px = (x + .5) * dx - ax;
          const t = Math.max(0, Math.min(1, (px * ux + py * uy) / length));
          const ox = px - t * ux, oy = py - t * uy;
          const at = y * width + x;
          distances[at] = Math.min(distances[at], ox * ox + oy * oy);
        }
      }
    }
  }
  const data = Uint8Array.from(distances, value => Math.round(Math.sqrt(value) / rimReach * 255));
  const texture = new THREE.DataTexture(data, width, height, THREE.RedFormat);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const shaderVertex = '#include <project_vertex>';
const shaderFragment = '#include <clipping_planes_fragment>';
const shaderCommon = '#include <common>';

/** Prepared oblique section of the native healthy molar. Its boundaries and
 * cap come from the same exterior triangles. Only a clip uniform animates. */
export function createCariesCutaway({ arch }) {
  const host = arch.teeth.get(36)?.mesh;
  if (!host?.geometry.index) throw new Error('The FDI 36 section needs the native tooth.');
  const material = host.material;
  const { contours, first, last } = planeContours(host.geometry);
  const { geometry, bounds } = buildCap(contours);
  const rim = rimTexture(contours, bounds);
  const pulp = createHealthyPulp({ planeNormal, planeDistance });

  const wipe = { value: first };
  const coverage = { value: 0 };
  const plane = { value: new THREE.Vector4(planeNormal.x, planeNormal.y, planeNormal.z, planeDistance) };
  const direction = { value: wipeDirection };
  const sectionUniforms = { sectionWipe: wipe, sectionCoverage: coverage, sectionPlane: plane, sectionDirection: direction };
  const priorCompile = material.onBeforeCompile, priorKey = material.customProgramCacheKey;
  const programKey = priorKey.call(material);
  material.onBeforeCompile = function (shader, renderer) {
    priorCompile.call(this, shader, renderer);
    Object.assign(shader.uniforms, sectionUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(shaderCommon, shaderCommon + '\nvarying vec3 vAnatomicalSection;')
      .replace(shaderVertex, shaderVertex + '\nvAnatomicalSection = transformed;');
    shader.fragmentShader = shader.fragmentShader
      .replace(shaderCommon, shaderCommon + `
        varying vec3 vAnatomicalSection;
        uniform vec4 sectionPlane;
        uniform vec3 sectionDirection;
        uniform float sectionWipe, sectionCoverage;`)
      .replace(shaderFragment, shaderFragment + `
        if (sectionCoverage > .001 && dot(vAnatomicalSection, sectionPlane.xyz) > sectionPlane.w &&
          dot(vAnatomicalSection, sectionDirection) < sectionWipe) discard;`);
  };
  material.customProgramCacheKey = () => programKey + '-fd36-plane-section-v2';
  material.needsUpdate = true;

  const capMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .64, metalness: 0 });
  const contactWeight = { value: 0 };
  capMaterial.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, sectionUniforms, {
      sectionRim: { value: rim },
      sectionPulpMask: { value: pulp.sectionMask },
      sectionPulpWeight: contactWeight,
      sectionDentinColor: { value: new THREE.Color('#dfd2b6') },
      sectionEnamelColor: { value: new THREE.Color('#fff7e5') },
      sectionCementumColor: { value: new THREE.Color('#c9b79e') },
    });
    shader.vertexShader = shader.vertexShader
      .replace(shaderCommon, shaderCommon + '\nvarying vec3 vAnatomicalSection; varying vec2 vSectionUv;')
      .replace(shaderVertex, shaderVertex + '\nvAnatomicalSection = position; vSectionUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace(shaderCommon, shaderCommon + `
        varying vec3 vAnatomicalSection;
        varying vec2 vSectionUv;
        uniform vec3 sectionDirection, sectionDentinColor, sectionEnamelColor, sectionCementumColor;
        uniform float sectionWipe, sectionPulpWeight;
        uniform sampler2D sectionRim, sectionPulpMask;
        float sectionGrainHash(vec2 p) {
          return fract(sin(dot(p, vec2(37.1, 71.7))) * 19128.53);
        }
        float sectionGrain(vec2 p) {
          vec2 cell = floor(p), t = fract(p);
          t = t * t * (3. - 2. * t);
          return mix(mix(sectionGrainHash(cell), sectionGrainHash(cell + vec2(1., 0.)), t.x),
            mix(sectionGrainHash(cell + vec2(0., 1.)), sectionGrainHash(cell + vec2(1.)), t.x), t.y);
        }`)
      .replace(shaderFragment, shaderFragment + `
        if (dot(vAnatomicalSection, sectionDirection) >= sectionWipe) discard;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 toothMm = vAnatomicalSection.xy * 1000.;
        float fromEdge = texture2D(sectionRim, vSectionUv).r * 1.8;
        // The crown has an enamel band. The roots instead carry the much
        // thinner cementum mantle around the same pale dentin.
        float cej = .13 + .19 * cos(toothMm.x * .49);
        float crown = smoothstep(cej - .28, cej + .35, toothMm.y);
        float enamelWidth = mix(.24, 1.30, smoothstep(cej - .10, 5.8, toothMm.y));
        float mantleWidth = mix(.16, enamelWidth, crown);
        float mantle = 1. - smoothstep(mantleWidth - .065, mantleWidth + .065, fromEdge);
        vec3 edgeColor = mix(sectionCementumColor, sectionEnamelColor, crown);
        vec2 grainCell = toothMm * vec2(9., 5.4);
        float grainWeight = 1. - smoothstep(.72, 1.3, length(fwidth(grainCell)));
        float grain = 1. + .016 * (sectionGrain(grainCell) - .5) * grainWeight;
        vec3 dentin = sectionDentinColor * grain;
        vec2 pulpUv = (vAnatomicalSection.xy - vec2(-.0045, -.013)) / vec2(.0105, .0176);
        float contact = texture2D(sectionPulpMask, pulpUv).r * sectionPulpWeight;
        dentin *= 1. - .26 * contact;
        diffuseColor.rgb = mix(dentin, edgeColor, mantle);`);
  };
  capMaterial.customProgramCacheKey = () => 'fd36-section-mantle-v2';
  const cap = new THREE.Mesh(geometry, capMaterial);
  cap.name = 'Kontúra pozdĺžneho rezu FDI 36';
  cap.visible = false;
  cap.raycast = () => {};
  host.add(cap, pulp.object);

  host.updateWorldMatrix(true, false);
  host.geometry.computeBoundingBox();
  const viewCenter = host.localToWorld(host.geometry.boundingBox.getCenter(new THREE.Vector3()));
  const viewNormal = new THREE.Vector3(.58, .17, 1).transformDirection(host.matrixWorld);
  let savedShadow = null;
  function setReveal(weight, depth) {
    const opening = THREE.MathUtils.smoothstep(depth, 0, 1) * THREE.MathUtils.clamp(weight, 0, 1);
    coverage.value = opening;
    wipe.value = THREE.MathUtils.lerp(first, last, opening);
    cap.visible = opening > .001;
    const tissue = THREE.MathUtils.smoothstep(depth, 1.08, 1.93) *
      THREE.MathUtils.smoothstep(weight, .85, 1);
    contactWeight.value = opening * THREE.MathUtils.lerp(.24, 1, tissue);
    pulp.setReveal(tissue);
    if (cap.visible) {
      if (savedShadow === null) savedShadow = host.castShadow;
      host.castShadow = false;
    } else if (savedShadow !== null) {
      host.castShadow = savedShadow;
      savedShadow = null;
    }
  }
  function dispose() {
    setReveal(0, 0);
    host.remove(cap, pulp.object);
    pulp.dispose();
    geometry.dispose();
    capMaterial.dispose();
    rim.dispose();
    material.onBeforeCompile = priorCompile;
    material.customProgramCacheKey = priorKey;
    material.needsUpdate = true;
  }
  return { host, viewCenter, viewNormal, setReveal, dispose };
}
