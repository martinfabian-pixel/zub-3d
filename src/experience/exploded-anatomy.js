import * as THREE from 'three';
import { createExplodedToothParts } from './exploded-tooth-parts.js';
import { createExplodedToothSocket } from './exploded-tooth-socket.js';

const plateLayer = 1;
const { clamp, lerp, smoothstep } = THREE.MathUtils;

function applyAssemblyDissolve(material, mix, shell) {
  const prepare = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  const reject = shell ? 'coverage >= anatomyMix' : 'coverage < anatomyMix';
  material.onBeforeCompile = function (shader, renderer) {
    prepare.call(this, shader, renderer);
    shader.uniforms.anatomyMix = mix;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float anatomyMix;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (anatomyMix > 0.0 && anatomyMix < 1.0) {
          float coverage = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (${reject}) discard;
        }
      `);
  };
  material.customProgramCacheKey = () => `${key}-anatomy-${shell ? 'shell' : 'intact'}`;
}

function createIntactTooth(host, mix) {
  const source = host.material;
  const material = new THREE.MeshPhysicalMaterial({
    color: source.color, roughness: source.roughness, metalness: source.metalness,
    normalMap: source.normalMap, normalScale: source.normalScale, ior: source.ior,
    clearcoat: source.clearcoat, clearcoatRoughness: source.clearcoatRoughness,
    transmission: source.transmission, envMapIntensity: source.envMapIntensity,
    dithering: source.dithering,
  });
  material.onBeforeCompile = source.onBeforeCompile;
  material.customProgramCacheKey = source.customProgramCacheKey;
  applyAssemblyDissolve(material, mix, false);
  const mesh = new THREE.Mesh(host.geometry, material);
  mesh.name = 'FDI 36 · intact hero';
  mesh.scale.setScalar(1000);
  return mesh;
}

export function createExplodedAnatomy(scene, host, config) {
  const parts = createExplodedToothParts({ host });
  const socket = createExplodedToothSocket();
  const object = new THREE.Group();
  object.name = 'FDI 36 · exploded anatomy';
  // Shells are authored in millimetres. Match the hero's centimetre world
  // so its normal-map detail and studio lighting keep their original scale.
  object.scale.setScalar(.1);
  const models = new THREE.Group();
  object.add(models);
  const mix = { value: 0 };
  const intact = createIntactTooth(host, mix);
  models.add(intact);
  for (const shell of [parts.enamel, parts.cementum]) {
    shell.traverse(child => { if (child.isMesh) applyAssemblyDissolve(child.material, mix, true); });
  }
  const heroRotation = host.getWorldQuaternion(new THREE.Quaternion());
  const upright = new THREE.Quaternion();
  const pieces = [
    { part: parts.enamel, height: 8.7, gap: 1.35, anchor: [.43, .51], width: .93, tilt: -.20, timing: [.11, .88], shell: true },
    { part: parts.dentin, height: 12, gap: 1.4, anchor: [.39, .68], width: 1.06,
      timing: [.08, .95], nested: [0, -.35, -.38], nestedScale: .53, reveal: .08, depth: -.68 },
    { part: parts.pulp, height: 9.5, gap: 1.45, anchor: [.14, .79],
      timing: [.17, .96], nested: [0, -.48, -.63], nestedScale: .32, reveal: .17, depth: -.88, fadeUntil: .33 },
    { part: parts.cementum, height: 10.6, gap: 1.25, anchor: [.38, .58], width: .99, tilt: .09, timing: [.13, .90], shell: true },
    { part: socket.object, height: 8.6, gap: 0, anchor: [.45, .48],
      timing: [.15, 1], nested: [0, -13.5, -.8], nestedScale: .002, reveal: .15 },
  ];

  let top = pieces.reduce((sum, piece) => sum + piece.height + piece.gap, 0) / 2;
  const rows = pieces.map((piece) => {
    const { part, height, gap, anchor, width = 1, tilt = 0, nested = [0, 0, 0], nestedScale = 1 } = piece;
    part.rotation.x = tilt;
    const bounds = new THREE.Box3().setFromObject(part);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const scale = height / size.y;
    const wrapper = new THREE.Group();
    wrapper.add(part);
    models.add(wrapper);

    const openScale = new THREE.Vector3(scale * width, scale, scale);
    const openPosition = new THREE.Vector3(-center.x * openScale.x, top - bounds.max.y * scale, -center.z * scale);
    const point = new THREE.Vector3(size.x * openScale.x * anchor[0], top - height * (1 - anchor[1]), size.z * scale * .18);
    const fadeMaterials = [];
    if (piece.fadeUntil) part.traverse(({ material }) => {
      if (material) fadeMaterials.push([material, material.opacity]);
    });
    top -= height + gap;
    return {
      ...piece, wrapper, tilt, openPosition, openScale,
      closedPosition: new THREE.Vector3(...nested),
      closedScale: new THREE.Vector3().setScalar(nestedScale),
      anchorPoint: point.sub(openPosition).divide(openScale),
      fadeMaterials,
    };
  });

  const ambient = new THREE.HemisphereLight(0xfff8f1, 0x74616d, .56);
  function light(color, intensity, x, y, z) {
    const source = new THREE.DirectionalLight(color, intensity);
    source.position.set(x, y, z);
    return source;
  }
  const layerLights = [ambient, light(0xfff8ef, 2.35, -32, 28, 25), light(0xe3ebff, 1.55, 22, 24, -27),
    light(0xe7efff, .44, 30, -4, 24)].map(source => [source, source.intensity]);
  const studioLights = [config.studio.key, config.studio.fill, config.studio.rim].map(spec => {
    const source = new THREE.RectAreaLight(spec.color, spec.intensity, ...spec.size);
    source.position.fromArray(spec.position).multiplyScalar(10);
    return [source, spec.intensity];
  });
  const direct = config.studio.directional;
  studioLights.push([light(direct.color, direct.intensity, ...direct.position.map(value => value * 10)), direct.intensity]);
  for (const [source] of [...layerLights, ...studioLights]) object.add(source);
  object.traverse(child => child.layers.set(plateLayer));
  scene.add(object);
  for (const [source] of studioLights) if (source.isRectAreaLight) source.lookAt(0, 0, 0);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 180);
  camera.layers.set(plateLayer);
  const heroDirection = new THREE.Vector3().fromArray(config.camera.directions.hero).normalize();
  const openDirection = new THREE.Vector3(16, 7, 75).normalize();

  function pose(value) {
    const orientation = smoothstep(value, 0, 1);
    const layerLight = smoothstep(value, .04, .4);
    mix.value = smoothstep(value, 0, .11);
    intact.visible = mix.value < 1;
    models.quaternion.slerpQuaternions(heroRotation, upright, orientation);
    for (const [source, intensity] of studioLights) source.intensity = intensity * (1 - layerLight);
    for (const [source, intensity] of layerLights) source.intensity = intensity * layerLight;
    for (const row of rows) {
      const { part, wrapper, tilt, timing, reveal = 0, depth = 0, shell = false } = row;
      const progress = smoothstep(value, ...timing);
      wrapper.visible = shell ? mix.value > 0 : value > reveal;
      wrapper.position.lerpVectors(row.closedPosition, row.openPosition, progress);
      wrapper.position.z += depth * Math.sin(Math.PI * progress);
      wrapper.scale.lerpVectors(row.closedScale, row.openScale, progress);
      part.rotation.x = tilt * progress;
      for (const [material, opacity] of row.fadeMaterials) {
        material.opacity = opacity * smoothstep(value, reveal, row.fadeUntil);
      }
    }
    object.updateMatrixWorld(true);
    camera.position.lerpVectors(heroDirection, openDirection, orientation).normalize().multiplyScalar(75);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
  }

  function boundsAt(value) {
    pose(value);
    const bounds = new THREE.Box3();
    if (intact.visible) {
      const position = intact.geometry.getAttribute('position');
      const transform = new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse, intact.matrixWorld);
      const vertex = new THREE.Vector3();
      for (let i = 0; i < position.count; i++) bounds.expandByPoint(vertex.fromBufferAttribute(position, i).applyMatrix4(transform));
    } else {
      for (const { wrapper } of rows) if (wrapper.visible) bounds.expandByObject(wrapper);
      bounds.applyMatrix4(camera.matrixWorldInverse);
    }
    return { size: bounds.getSize(new THREE.Vector3()), center: bounds.getCenter(new THREE.Vector3()) };
  }

  const opened = boundsAt(1);
  const closed = boundsAt(0);
  const projected = new THREE.Vector3();
  let viewport, spread = 0, labelPoints = null;

  function layout(width, height, { copyBottom, actionsTop, footerTop }) {
    const compact = width <= 760 && height > 500;
    const short = height <= 620;
    const top = compact ? Math.max(short ? 146 : 163, copyBottom + 12) : (short ? 63 : 82);
    const bottom = (compact ? actionsTop : footerTop) - 8;
    const available = Math.max(1, bottom - top);
    const closedFit = Math.min(.82 * available / closed.size.y, width * (compact ? .75 : .35) / closed.size.x);
    const openedFit = Math.min(available / opened.size.y, width * (compact ? .50 : .29) / opened.size.x);
    const labelX = Math.max(width * (compact ? .675 : .745),
      width * (compact ? .355 : .585) + opened.size.x * openedFit / 2 + 25);
    viewport = { width, height, compact, centerY: (top + bottom) / 2, closedFit, openedFit, labelX };
    return frame();
  }

  function frame() {
    const { width, height, compact, centerY, closedFit, openedFit, labelX } = viewport;
    const centerX = width * lerp(compact ? .57 : .69, compact ? .355 : .585, spread);
    // The staggered rows reach their widest vertical separation before the
    // labels settle. Ease the framing back slightly through that passage.
    const unitsPerPixel = lerp(1 / closedFit, 1 / openedFit, spread) * (1 + .065 * Math.sin(Math.PI * spread));
    const aimX = lerp(closed.center.x, opened.center.x, spread);
    const aimY = lerp(closed.center.y, opened.center.y, spread);
    camera.left = aimX - centerX * unitsPerPixel;
    camera.right = camera.left + width * unitsPerPixel;
    camera.top = aimY + centerY * unitsPerPixel;
    camera.bottom = camera.top - height * unitsPerPixel;
    camera.updateProjectionMatrix();
    labelPoints = rows.map(({ wrapper, anchorPoint }) => {
      projected.copy(anchorPoint).applyMatrix4(wrapper.matrixWorld).project(camera);
      return { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2, labelX };
    });
    return labelPoints;
  }

  function setSpread(value) {
    const next = clamp(value, 0, 1);
    if (next === spread) return labelPoints;
    spread = next;
    pose(spread);
    return viewport ? frame() : null;
  }

  function dispose() {
    object.removeFromParent();
    intact.material.dispose();
    parts.dispose();
    socket.dispose();
  }

  return { camera, models, layout, setSpread, dispose };
}
