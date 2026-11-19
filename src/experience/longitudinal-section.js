import * as THREE from 'three';
import { createDentinSectionGeometry } from './exploded-tooth-parts.js';

// Local metres, +Z buccal, +Y occlusal. The section remains registered to
// the anatomy when the camera moves. Its normal is independent of the viewer.
const width = 384;

// Project the real triangles into a depth atlas once. Two disjoint solid
// intervals per texel preserve undercuts and the space between the roots.
// Only a plane uniform changes while scrubbing; no runtime triangulation.
function makeDepthAtlas(geometry, box, height, sealEdge = false) {
  const span = box.getSize(new THREE.Vector3());
  const { position } = geometry.attributes, index = geometry.index;
  const sampleX = new Float32Array(position.count), sampleY = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    sampleX[i] = (position.getX(i) - box.min.x) * width / span.x - .5;
    sampleY[i] = (position.getY(i) - box.min.y) * height / span.y - .5;
  }
  const intersections = new Array(width * height);
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    const ax = sampleX[a], ay = sampleY[a], ux = sampleX[b] - ax, uy = sampleY[b] - ay;
    const vx = sampleX[c] - ax, vy = sampleY[c] - ay, area = ux * vy - uy * vx;
    if (Math.abs(area) < 1e-9) continue;
    const x0 = Math.max(0, Math.ceil(Math.min(ax, sampleX[b], sampleX[c])));
    const x1 = Math.min(width - 1, Math.floor(Math.max(ax, sampleX[b], sampleX[c])));
    const y0 = Math.max(0, Math.ceil(Math.min(ay, sampleY[b], sampleY[c])));
    const y1 = Math.min(height - 1, Math.floor(Math.max(ay, sampleY[b], sampleY[c])));
    const az = position.getZ(a), uz = position.getZ(b) - az, vz = position.getZ(c) - az;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const u = ((x - ax) * vy - (y - ay) * vx) / area;
      const v = (ux * (y - ay) - uy * (x - ax)) / area;
      if (u < 0 || v < 0 || u + v > 1) continue;
      const pixel = y * width + x;
      (intersections[pixel] ??= []).push(az + u * uz + v * vz);
    }
  }
  // Distance endpoints need sub-texel depth precision at shallow angles.
  // RGBA16F is sampled with texelFetch; it needs no float texture filtering.
  const data = new Uint16Array(width * height * 4);
  const one = THREE.DataUtils.toHalfFloat(1);
  const encode = z => THREE.DataUtils.toHalfFloat(THREE.MathUtils.clamp((z - box.min.z) / span.z, 0, 1));
  for (let p = 0; p < intersections.length; p++) {
    const hits = intersections[p];
    const offset = p * 4;
    data[offset] = data[offset + 2] = one;
    if (!hits || hits.length < 2) continue;
    hits.sort((a, b) => a - b);
    // Retain the widest exterior gap if a very oblique voxel hits more
    // than two separated solids. The aggregate width remains scan-fitted.
    let gap = 0, split = 0;
    for (let j = 2; j < hits.length - 1; j += 2) {
      if (hits[j] - hits[j - 1] > gap) { gap = hits[j] - hits[j - 1]; split = j; }
    }
    data[offset] = encode(hits[0]); data[offset + 1] = encode(hits[split ? split - 1 : hits.length - 1]);
    if (split) { data[offset + 2] = encode(hits[split]); data[offset + 3] = encode(hits.at(-1)); }
  }
  if (sealEdge) {
    // Coverage at a grazing scan triangle can be narrower than one texel.
    // Give that single boundary texel its closest solid interval so a
    // subpixel gap cannot reveal the scene through the enamel lip.
    const original = data.slice();
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const p = (y * width + x) * 4;
      if (original[p] <= original[p + 1]) continue;
      let widest = 0;
      for (const neighbor of [p - width*4, p + width*4, p - 4, p + 4]) {
        const range = THREE.DataUtils.fromHalfFloat(original[neighbor + 1]) - THREE.DataUtils.fromHalfFloat(original[neighbor]);
        if (range <= widest) continue;
        widest = range;
        data.set(original.subarray(neighbor, neighbor + 4), p);
      }
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.needsUpdate = true;
  function distanceAt(offset, z) {
    const decode = THREE.DataUtils.fromHalfFloat;
    const first=Math.min(z-decode(data[offset]),decode(data[offset+1])-z);
    const second=Math.min(z-decode(data[offset+2]),decode(data[offset+3])-z);
    return THREE.MathUtils.clamp(Math.max(first,second),-.03,.03);
  }
  return { texture, distance(u, v, depth) {
    const x = THREE.MathUtils.clamp(u * width - .5, 0, width - 1);
    const y = THREE.MathUtils.clamp(v * height - .5, 0, height - 1);
    const a = Math.floor(x), b = Math.floor(y), fx = x - a, fy = y - b;
    const left = 4 * (b * width + a), right = a + 1 < width ? 4 : 0;
    const up = b + 1 < height ? width * 4 : 0;
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(distanceAt(left,depth),distanceAt(left+right,depth),fx),
      THREE.MathUtils.lerp(distanceAt(left+up,depth),distanceAt(left+up+right,depth),fx),fy);
  } };
}

export function createLongitudinalSection(host) {
  const outer = host.geometry;
  outer.computeBoundingBox();
  const box = outer.boundingBox.clone().expandByScalar(.00010);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const height = Math.ceil(width * size.y / size.x);
  const shell = makeDepthAtlas(outer, box, height, true);
  const dentin = createDentinSectionGeometry(host);
  const core = makeDepthAtlas(dentin, box, height);
  dentin.dispose();

  const depth = { value: 1 }, selected = { value: 0 };
  const sectionZ = {value:box.max.z};
  const shadow = new THREE.MeshDepthMaterial();
  shadow.onBeforeCompile = shader => {
    shader.uniforms.sectionZ = sectionZ;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vSectionZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSectionZ=position.z;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float sectionZ; varying float vSectionZ;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif(vSectionZ>sectionZ)discard;');
  };
  const enamel = new THREE.Color('#f6f3eb'), ivory = new THREE.Color('#e3ccb0');
  const cementum = new THREE.Color('#d3bea5'), junction = new THREE.Color('#bfa989');
  const material = new THREE.MeshStandardMaterial({ roughness: .64, side: THREE.DoubleSide });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, {
      sectionExterior: { value: shell.texture }, sectionInterior: { value: core.texture },
      planeDepth: depth, selectedLayer: selected, sectionEnamel: { value: enamel },
      sectionDentin: { value: ivory }, sectionRoot: { value: cementum }, sectionJunction: { value: junction },
    });
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vCutUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCutUv = uv;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vCutUv;
      uniform sampler2D sectionExterior, sectionInterior;
      uniform vec3 sectionEnamel, sectionDentin, sectionRoot, sectionJunction;
      uniform float planeDepth, selectedLayer;
      float fibreNoise(vec2 p){
        vec2 c=floor(p), f=fract(p);
        f=f*f*(3.-2.*f);
        float seed=dot(c,vec2(.06711056,.00583715));
        vec4 corners=fract(52.9829189*fract(seed+vec4(0.,.06711056,.00583715,.07294771)));
        return mix(mix(corners.x,corners.y,f.x),mix(corners.z,corners.w,f.x),f.y)-.5;
      }
      float sectionDistance(vec4 depths) {
        return clamp(max(min(planeDepth-depths.r, depths.g-planeDepth), min(planeDepth-depths.b, depths.a-planeDepth)),-.03,.03);
      }
      float distanceAtUv(sampler2D atlas) {
        // Interpolate the signed distances, not the interval endpoints:
        // two nearby texels can contain a different number of root lobes.
        ivec2 last = textureSize(atlas,0)-1;
        vec2 st = clamp(vCutUv*vec2(last+1)-.5,vec2(0.),vec2(last));
        ivec2 lo=ivec2(st), hi=min(lo+1,last);
        vec2 t=fract(st);
        return mix(mix(sectionDistance(texelFetch(atlas,lo,0)),sectionDistance(texelFetch(atlas,ivec2(hi.x,lo.y),0)),t.x),
                   mix(sectionDistance(texelFetch(atlas,ivec2(lo.x,hi.y),0)),sectionDistance(texelFetch(atlas,hi,0)),t.x),t.y);
      }`).replace('#include <color_fragment>', `#include <color_fragment>
        float outerDepth = distanceAtUv(sectionExterior);
        if(outerDepth < -0.002) discard;
        float coreDepth = distanceAtUv(sectionInterior);
        float inner = smoothstep(-0.004,0.004,coreDepth);
        float crown = smoothstep(0.62,0.67,vCutUv.y);
        vec3 mantle = mix(sectionRoot, sectionEnamel, crown);
        vec2 mm = (vCutUv - vec2(.5,.64)) * vec2(12.7,21.9);
        vec2 fibre = vec2(mm.x*5.4 + .8*sin(mm.y*1.65), mm.y*2.1);
        float grain = fibreNoise(fibre);
        float attenuation = 1.-smoothstep(.22,1.,length(fwidth(fibre)));
        vec3 coreColor = sectionDentin * (1.0 + .018 * grain * attenuation);
        coreColor = mix(sectionJunction,coreColor,.69+.31*smoothstep(.0,.036,coreDepth));
        float marked = selectedLayer==2.0 ? inner : selectedLayer==1.0 ? (1.0-inner)*crown : 0.0;
        diffuseColor.rgb *= mix(mantle,coreColor,inner) * mix(vec3(1.),vec3(.87,.97,1.055),marked);
      `).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        // Lacquer-like reflections would obscure a sawn section. The enamel
        // mantle takes a satin highlight; the cut dentin has a broader lobe.
        roughnessFactor = mix(mix(.54,.34,crown), .70 + .06*grain*attenuation, inner);
      `).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // Bounded section relief (world centimetres). Light rounds off the
        // exposed lip, crosses a shallow junction and catches the dentin grain.
        float height = .0009 * smoothstep(-.002,.030,outerDepth)
                     - .0018 * smoothstep(-.006,.026,coreDepth);
        vec2 dh = vec2(dFdx(height),dFdy(height));
        dh += .00010 * inner * attenuation * vec2(dFdx(grain), dFdy(grain));
        vec3 tx = dFdx(-vViewPosition), ty = dFdy(-vViewPosition);
        vec3 rx = cross(ty,normal), ry = cross(normal,tx);
        float determinant = dot(tx,rx);
        if(abs(determinant)>1e-12){
          vec3 slope = (dh.x*rx + dh.y*ry) / determinant;
          normal = normalize(normal - slope / max(1., 2.*length(slope)));
        }
      `);
  };
  const geometry = new THREE.PlaneGeometry(size.x, size.y);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'FDI 36 · pozdĺžny rez sklovinou a dentínom';
  mesh.visible = false;
  mesh.receiveShadow = true;
  mesh.position.set(center.x, center.y, box.max.z);
  mesh.raycast = () => {};
  host.add(mesh);
  const candidates = [];
  // Grid candidates lie on the current plane in its own coordinates.
  // Moving the plane carries each anchor and the exact same picking mask.
  for (const [y, band] of [[.78,0],[.66,1],[.51,2],[.35,3]]) {
    for (const x of [.21,.78,.32,.68,.42,.58]) {
      candidates.push({ id:'dentin', object:mesh, local:new THREE.Vector3((x-.5)*size.x,(y-.5)*size.y,0),
        normal:new THREE.Vector3(0,0,1), band });
    }
  }
  return { mesh, candidates, shadow,
    update(amount, highlight) {
      mesh.visible = amount > 0;
      const z = THREE.MathUtils.lerp(box.max.z, -.00095, amount / 3);
      sectionZ.value = z;
      if (amount > 0) host.customDepthMaterial = shadow;
      else if (host.customDepthMaterial === shadow) host.customDepthMaterial = undefined;
      mesh.position.z = z;
      depth.value = (z - box.min.z) / size.z;
      selected.value = highlight === 'enamel' ? 1 : highlight === 'dentin' ? 2 : 0;
      mesh.updateWorldMatrix(true, false);
      return z;
    },
    fragment(point) {
      const u = point.x / size.x + .5, v = point.y / size.y + .5;
      if (shell.distance(u, v, depth.value) < -.002) return false;
      if (core.distance(u, v, depth.value) >= 0) return 'dentin';
      return point.y + center.y > .00045 ? 'enamel' : null;
    },
    dispose() {
      mesh.removeFromParent(); geometry.dispose(); material.dispose();
      if(host.customDepthMaterial === shadow)host.customDepthMaterial=undefined;
      shadow.dispose();
      shell.texture.dispose(); core.texture.dispose();
    },
  };
}
