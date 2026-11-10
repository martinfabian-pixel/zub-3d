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
  mesh.castShadow = host.castShadow;
  mesh.receiveShadow = host.receiveShadow;
  return mesh;
}

export function createExplodedAnatomy(scene, host, config) {
  const parts = createExplodedToothParts({ host });
  const socket = createExplodedToothSocket();
  const object = new THREE.Group();
  object.name = 'FDI 36 · exploded anatomy';
  // The fully assembled pose is coincident with the story tooth, down to
  // its world transform. The isolated anatomy then grows from that pose.
  const heroPosition = host.getWorldPosition(new THREE.Vector3());
  const heroScale = host.getWorldScale(new THREE.Vector3());
  object.position.copy(heroPosition);
  object.scale.setScalar(heroScale.x / 1000);
  const models = new THREE.Group();
  object.add(models);
  const mix = { value: 0 };
  const intact = createIntactTooth(host, mix);
  intact.scale.copy(heroScale).divideScalar(object.scale.x);
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
  const studioLights = scene.children
    .filter(source => source.isRectAreaLight || source.isDirectionalLight)
    .map(source => [source, source.intensity]);
  for (const [source] of studioLights) source.layers.enable(plateLayer);
  for (const [source] of layerLights) {
    object.add(source);
    if (source.isDirectionalLight) object.add(source.target);
  }
  object.traverse(child => child.layers.set(plateLayer));
  scene.add(object);

  const camera = new THREE.PerspectiveCamera(config.camera.fov, 1, config.camera.near, config.camera.far);
  camera.layers.set(plateLayer);
  const openOffset = new THREE.Vector3(16, 7, 75).setLength(75);
  const openPosition = heroPosition.clone().add(openOffset);
  const openRotation = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(openPosition, heroPosition, camera.up));
  const openEye = openOffset.clone().applyQuaternion(openRotation.clone().invert());
  const sourceRotation = new THREE.Quaternion();
  const inverseRotation = new THREE.Quaternion();
  const sourceEye = new THREE.Vector3();
  const eye = new THREE.Vector3();

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
  }

  camera.position.copy(openPosition);
  camera.quaternion.copy(openRotation);
  camera.updateMatrixWorld();
  pose(1);
  const bounds = new THREE.Box3().setFromObject(object);
  // setFromObject includes the hidden intact mesh. At full spread it sits
  // inside the extents of the five layers and adds no extra framing.
  bounds.applyMatrix4(camera.matrixWorldInverse);
  const opened = { size: bounds.getSize(new THREE.Vector3()), center: bounds.getCenter(new THREE.Vector3()) };
  pose(0);
  const projected = new THREE.Vector3();
  let viewport, storyCamera, spread = 0, labelPoints = null;

  function layout(width, height, { copyBottom, actionsTop, footerTop }) {
    const compact = width <= 760 && height > 500;
    const short = height <= 620;
    const top = compact ? Math.max(short ? 146 : 163, copyBottom + 12) : (short ? 63 : 82);
    const bottom = (compact ? actionsTop : footerTop) - 8;
    const available = Math.max(1, bottom - top);
    const openedFit = Math.min(available / opened.size.y, width * (compact ? .50 : .29) / opened.size.x);
    const labelX = Math.max(width * (compact ? .675 : .745),
      width * (compact ? .355 : .585) + opened.size.x * openedFit / 2 + 25);
    viewport = { width, height, compact, centerY: (top + bottom) / 2, openedFit, labelX };
    return frame();
  }

  function frame() {
    const { width, height, compact, centerY, openedFit, labelX } = viewport;
    const centerX = width * (compact ? .355 : .585);
    const left = opened.center.x - centerX / openedFit;
    const top = opened.center.y + centerY / openedFit;
    if (!storyCamera || spread === 1) {
      camera.position.copy(openPosition);
      camera.quaternion.copy(openRotation);
      camera.projectionMatrix.makeOrthographic(left, left + width / openedFit, top, top - height / openedFit, camera.near, camera.far);
    } else {
      storyCamera.getWorldPosition(sourceEye);
      storyCamera.getWorldQuaternion(sourceRotation);
      if (spread === 0) {
        camera.position.copy(sourceEye);
        camera.quaternion.copy(sourceRotation);
        camera.projectionMatrix.copy(storyCamera.projectionMatrix);
      } else {
        const t = smoothstep(spread, 0, 1);
        sourceEye.sub(heroPosition).applyQuaternion(inverseRotation.copy(sourceRotation).invert());
        eye.lerpVectors(sourceEye, openEye, t);
        const depth = Math.max(eye.z, camera.near);
        const sourceDepth = Math.max(sourceEye.z, camera.near);
        camera.quaternion.slerpQuaternions(sourceRotation, openRotation, t);
        camera.position.copy(eye).applyQuaternion(camera.quaternion).add(heroPosition);

        // Mix the two projections at the tooth depth. The homogeneous
        // divisor starts as perspective and becomes orthographic as the
        // diagram opens, so the handover and the reverse are pixel-continuous.
        const source = storyCamera.projectionMatrix.elements;
        const zoomOut = 1 + .065 * Math.sin(Math.PI * spread);
        const sx = lerp(source[0] / sourceDepth, 2 * openedFit / width, t) / zoomOut;
        const sy = lerp(source[5] / sourceDepth, 2 * openedFit / height, t) / zoomOut;
        const offsetX = lerp(-source[8], -1 - 2 * left * openedFit / width, t);
        const offsetY = lerp(-source[9], 1 - 2 * top * openedFit / height, t);
        const perspective = -(1 - t) / depth;
        const nearWeight = t - camera.near * perspective;
        const farWeight = t - camera.far * perspective;
        const zScale = -(farWeight + nearWeight) / (camera.far - camera.near);
        const zOffset = zScale * camera.near - nearWeight;
        camera.projectionMatrix.set(
          sx, 0, offsetX * perspective, offsetX * t,
          0, sy, offsetY * perspective, offsetY * t,
          0, 0, zScale, zOffset,
          0, 0, perspective, t);
      }
    }
    camera.updateMatrixWorld();
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    labelPoints = rows.map(({ wrapper, anchorPoint }) => {
      projected.copy(anchorPoint).applyMatrix4(wrapper.matrixWorld).project(camera);
      return { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2, labelX };
    });
    return labelPoints;
  }

  function setSpread(value, sourceCamera) {
    const next = clamp(value, 0, 1);
    if (sourceCamera) storyCamera = sourceCamera;
    if (next !== spread) {
      spread = next;
      pose(spread);
    } else if (!sourceCamera) return labelPoints;
    return viewport ? frame() : null;
  }

  function dispose() {
    object.removeFromParent();
    for (const [source, intensity] of studioLights) {
      source.intensity = intensity;
      source.layers.disable(plateLayer);
    }
    intact.material.dispose();
    parts.dispose();
    socket.dispose();
  }

  return { camera, models, layout, setSpread, dispose };
}
