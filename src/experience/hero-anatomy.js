import * as THREE from 'three';

// This is an educational approximation, not segmented patient data. The
// coordinates are in the unchanged Dundee 36 local frame (metres, +Y crown).
// The source tooth has two roots, but does not contain any internal anatomy.
const CHANNELS = [
  // Two illustrative mesial branches, converging toward the root tip.
  [[-.0014,.0012,.0006],[-.0021,-.0035,.0006],[-.00195,-.006,.00045],[-.0012,-.009,.0002],[-.00035,-.0115,-.0001],[.0003,-.0127,-.00035]],
  [[-.0014,.0012,-.0007],[-.0021,-.0035,-.0010],[-.00195,-.006,-.0010],[-.0012,-.009,-.00085],[-.00035,-.0115,-.00065],[.0003,-.0127,-.00045]],
  // A distal branch following the centre of the other native root.
  [[.0014,.0012,0],[.0027,-.0035,-.0003],[.00355,-.006,-.0005],[.0045,-.009,-.0005],[.00495,-.011,-.0004],[.00515,-.0127,-.0003]],
];

// The delicate lines are an illustration of branching within the chamber,
// not an actual scan of this specimen. They meet the existing canal paths.
const CHAMBER_BRANCHES = [
  [[-.0014,.0010,.0015],[-.0018,.0019,.0017],[-.0026,.0026,.0012],[-.0021,.0035,.0008]],
  [[-.0014,.0010,.0015],[-.0008,.0020,.0019],[-.0010,.0029,.0018],[-.0017,.0036,.0010]],
  [[-.0014,.0010,.0015],[-.0008,.0015,.0020],[.0001,.0017,.0022],[.0007,.0023,.0018],[.0004,.0033,.0012]],
  [[.0014,.0010,.0015],[.0018,.0019,.0016],[.0025,.0023,.0011],[.0021,.0031,.0008]],
  [[.0014,.0010,.0015],[.0008,.0015,.0020],[.0001,.0017,.0022],[-.0002,.0025,.0018]],
  [[.0014,.0010,.0015],[.0013,.0024,.0017],[.0009,.0032,.0014],[.0013,.0038,.0007]],
  [[-.0013,.0008,.0018],[-.0005,.0007,.0021],[.0002,.0009,.0022],[.0014,.0008,.0017]],
];

/** A tapered, smooth tube built once; its physical radius narrows at the tip. */
function channelGeometry(points, radius, start = 0, length = 1) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'centripetal');
  const segments = 48, sides = 10, frames = curve.computeFrenetFrames(segments, false);
  const positions = new Float32Array((segments + 1) * (sides + 1) * 3);
  const indices = [];
  const center = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPoint(start + length * t, center);
    const taper = Math.max(.12, (1 - t) ** .8);
    const r = radius * (.32 + .68 * taper);
    for (let j = 0; j <= sides; j++) {
      const angle = j / sides * Math.PI * 2, c = Math.cos(angle), s = Math.sin(angle);
      const k = (i * (sides + 1) + j) * 3;
      positions[k] = center.x + r * (frames.normals[i].x * c + frames.binormals[i].x * s);
      positions[k + 1] = center.y + r * (frames.normals[i].y * c + frames.binormals[i].y * s);
      positions[k + 2] = center.z + r * (frames.normals[i].z * c + frames.binormals[i].z * s);
      if (i && j) {
        const a = (i - 1) * (sides + 1) + j - 1, b = a + sides + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

/** Optional, reversible anatomical illustration inside the original 36 mesh. */
export function createHeroAnatomy({ arch }) {
  const item = arch.teeth.get(36), host = item?.mesh;
  if (!host || !item.finish) throw new Error('FDI 36 is needed for the illustrative anatomy.');
  const material = host.material;
  const originalColor = material.color.clone();
  const blueColor = new THREE.Color('#8bcaf1');
  const originalRenderOrder = host.renderOrder;
  const originalSetReveal = item.finish.setReveal;
  const group = new THREE.Group();
  group.name = 'Ilustračná zubná dreň a koreňové kanáliky FDI 36';
  group.visible = false;
  const bodyMaterial = new THREE.MeshPhysicalMaterial({ color: '#912b3b', roughness: .38, clearcoat: .22, clearcoatRoughness: .4, transparent: true, depthWrite: false });
  const canalMaterial = new THREE.MeshStandardMaterial({ color: '#a33642', roughness: .45, transparent: true, depthWrite: false });
  const nerveMaterial = new THREE.MeshStandardMaterial({ color: '#ffe0aa', roughness: .5, transparent: true, depthWrite: false });
  const vesselMaterial = new THREE.MeshStandardMaterial({ color: '#ed9ba1', roughness: .5, transparent: true, depthWrite: false });
  // Build one continuous chamber. Gentle raised regions on the roof suggest
  // pulp horns without separate spheres, seams or detached round protrusions.
  const chamberGeometry = new THREE.SphereGeometry(1, 48, 32);
  const chamberPosition = chamberGeometry.getAttribute('position');
  for (let i = 0; i < chamberPosition.count; i++) {
    const x = chamberPosition.getX(i), y = chamberPosition.getY(i), z = chamberPosition.getZ(i);
    let horns = 0;
    for (const hx of [-.52, .52]) for (const hz of [-.50, .50]) {
      const dx = x - hx, dz = z - hz;
      horns += Math.exp(-(dx * dx + dz * dz) / .11);
    }
    // The taper joins the chamber to the canals at the bottom and leaves
    // its occlusal outline soft rather than forming a row of spheres.
    const neck = .90 + .10 * Math.max(0, y);
    const rise = .00072 * horns * Math.max(0, Math.min(1, y * 2.5));
    chamberPosition.setXYZ(i, x * .00315 * neck, .00165 + y * .00145 + rise, z * .00245 * neck - .00015);
  }
  chamberGeometry.computeVertexNormals(); chamberGeometry.computeBoundingSphere();
  const geometries = new Set([chamberGeometry]);
  function add(geometry, mat, position, scale) {
    const mesh = new THREE.Mesh(geometry, mat);
    if (position) mesh.position.set(...position);
    if (scale) mesh.scale.set(...scale);
    mesh.renderOrder = originalRenderOrder + 1;
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.raycast = () => {}; // Do not intercept manual picking of the tooth.
    group.add(mesh); return mesh;
  }
  add(chamberGeometry, bodyMaterial);
  for (const points of CHANNELS) {
    const geometry = channelGeometry(points, .00039); geometries.add(geometry); add(geometry, canalMaterial);
    // The pale thread stands slightly toward the buccal surface within the
    // translucent pulp, remaining legible while rotating the same tooth.
    // It is an illustrative pathway, not a measurement of a real nerve.
    const visibleStrand = points.map(([x,y,z]) => [x,y,z+.00013]);
    const nerve = channelGeometry(visibleStrand, .000085, .03, .90); geometries.add(nerve);
    add(nerve, nerveMaterial).renderOrder = originalRenderOrder + 2;
  }
  // A fine cross-connection suggests the possible variation in branching,
  // while staying within the mesial root and following the existing curves.
  const link = channelGeometry([
    [-.00198,-.0055,.00046],[-.00195,-.0060,.00005],[-.00187,-.0065,-.00052],
  ], .000075);
  geometries.add(link); add(link, nerveMaterial).renderOrder = originalRenderOrder + 2;
  for (const [i, points] of CHAMBER_BRANCHES.entries()) {
    // Keep the schematic branch centres within the chamber's ellipsoid.
    // Curves must not appear to extend into otherwise healthy enamel.
    const contained = points.map(([x,y,z]) => {
      const nx=x/.00315, ny=(y-.00165)/.00145, nz=(z+.00015)/.00245;
      const factor=Math.min(1,.88/Math.hypot(nx,ny,nz));
      return [x*factor,.00165+(y-.00165)*factor,-.00015+(z+.00015)*factor];
    });
    const branch = channelGeometry(contained, i === 6 ? .000055 : .000065);
    geometries.add(branch);
    add(branch, i % 3 === 1 ? vesselMaterial : nerveMaterial).renderOrder = originalRenderOrder + 2;
  }
  host.add(group);
  // A transparent Fresnel rim describes the original exterior rather than a
  // replacement tooth. It shares the existing mesh and is visible only here.
  const rimMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { strength: { value: 0 }, rimColor: { value: new THREE.Color('#d9f4ff') } },
    vertexShader: `varying vec3 vNormalView; varying vec3 vEyeView;
      void main() { vec4 p = modelViewMatrix * vec4(position, 1.0);
        vNormalView = normalize(normalMatrix * normal); vEyeView = normalize(-p.xyz);
        gl_Position = projectionMatrix * p; }`,
    fragmentShader: `uniform float strength; uniform vec3 rimColor;
      varying vec3 vNormalView; varying vec3 vEyeView;
      void main() { float edge = pow(1.0 - abs(dot(normalize(vNormalView), normalize(vEyeView))), 2.1);
        gl_FragColor = vec4(rimColor, strength * (0.035 + 0.58 * edge)); }`,
  });
  const rim = new THREE.Mesh(host.geometry, rimMaterial);
  rim.name = 'Illustrative translucent enamel contour';
  rim.raycast = () => {}; rim.renderOrder = originalRenderOrder + 4;
  rim.visible = false; host.add(rim);
  let weight = 0, disposed = false, lastReveal = item.finish.getReveal?.() ?? item.reveal;

  // The shared story controls reveal every frame. While the hero is in this
  // full-reveal illustration, avoid toggling material transparency twice per
  // frame; all other tooth states retain the original implementation.
  item.finish.setReveal = value => {
    lastReveal = value;
    if (weight > 0 && value > .99999) {
      host.visible = true; host.castShadow = false;
      material.opacity = 1 - .66 * weight;
      material.depthWrite = false;
      if (!material.transparent) { material.transparent = true; material.needsUpdate = true; }
      return;
    }
    originalSetReveal(value);
  };
  function setWeight(next) {
    if (disposed) return;
    const target = THREE.MathUtils.clamp(next, 0, 1);
    if (target === 0 && weight === 0) return;
    weight = target;
    const visible = weight > .001 && host.visible;
    group.visible = visible;
    rim.visible = visible;
    rimMaterial.uniforms.strength.value = weight;
    bodyMaterial.opacity = .93 * weight;
    canalMaterial.opacity = .86 * weight;
    nerveMaterial.opacity = .96 * weight;
    vesselMaterial.opacity = .90 * weight;
    material.color.copy(originalColor).lerp(blueColor, weight);
    host.renderOrder = weight > 0 ? originalRenderOrder + 3 : originalRenderOrder;
    if (weight > 0) {
      material.opacity = 1 - .66 * weight;
      material.depthWrite = false;
      host.castShadow = false;
      if (!material.transparent) { material.transparent = true; material.needsUpdate = true; }
    } else {
      material.color.copy(originalColor);
      originalSetReveal(lastReveal);
    }
  }
  function dispose() {
    if (disposed) return;
    setWeight(0); disposed = true;
    item.finish.setReveal = originalSetReveal;
    host.remove(group, rim); host.renderOrder = originalRenderOrder;
    for (const geometry of geometries) geometry.dispose();
    bodyMaterial.dispose(); canalMaterial.dispose(); nerveMaterial.dispose(); vesselMaterial.dispose(); rimMaterial.dispose();
  }
  return { object: group, setWeight, dispose, get weight() { return weight; } };
}
