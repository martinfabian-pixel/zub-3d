import * as THREE from 'three';
import { createExplodedToothParts } from './exploded-tooth-parts.js';
import { createExplodedToothSocket } from './exploded-tooth-socket.js';

const plateLayer = 1;
const { clamp, lerp, smoothstep } = THREE.MathUtils;

export function createExplodedAnatomy(scene, host) {
  const parts = createExplodedToothParts({ host });
  const socket = createExplodedToothSocket();
  const object = new THREE.Group();
  object.name = 'FDI 36 · exploded anatomy';
  const models = new THREE.Group();
  object.add(models);
  const pieces = [
    { part: parts.enamel, height: 8.7, gap: 1.35, anchor: [.43, .51], width: .93, tilt: -.20, timing: [0, .88] },
    { part: parts.dentin, height: 12, gap: 1.4, anchor: [.39, .68], width: 1.06,
      timing: [.08, .95], nested: [0, -.35, -.38], nestedScale: .53, reveal: .08, depth: -.68 },
    { part: parts.pulp, height: 9.5, gap: 1.45, anchor: [.14, .79],
      timing: [.17, .96], nested: [0, -.48, -.63], nestedScale: .32, reveal: .17, depth: -.88, fadeUntil: .33 },
    { part: parts.cementum, height: 10.6, gap: 1.25, anchor: [.38, .58], width: .99, tilt: .09, timing: [.03, .90] },
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

  // The native outer surfaces share a cervical edge. The open poses
  // stylize the parts individually, but both shells return to those exact
  // native coordinates when closed.
  function pose(value) {
    for (const row of rows) {
      const { part, wrapper, tilt, timing, reveal = 0, depth = 0 } = row;
      const progress = smoothstep(value, ...timing);
      wrapper.visible = reveal === 0 || value > reveal;
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

  const ambient = new THREE.HemisphereLight(0xfff8f1, 0x74616d, .56);
  function light(color, intensity, x, y, z) {
    const source = new THREE.DirectionalLight(color, intensity);
    source.position.set(x, y, z);
    return source;
  }
  object.add(ambient, light(0xfff8ef, 2.35, -32, 28, 25), light(0xe3ebff, 1.55, 22, 24, -27),
    light(0xe7efff, .44, 30, -4, 24));
  object.traverse(child => child.layers.set(plateLayer));
  scene.add(object);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 180);
  camera.layers.set(plateLayer);
  camera.position.set(16, 7, 75);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  function boundsAt(value) {
    pose(value);
    const bounds = new THREE.Box3();
    for (const { wrapper } of rows) {
      if (wrapper.visible) bounds.expandByObject(wrapper);
    }
    bounds.applyMatrix4(camera.matrixWorldInverse);
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
    const centerX = width * lerp(compact ? .50 : .63, compact ? .355 : .585, spread);
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
    parts.dispose();
    socket.dispose();
  }

  return { camera, models, layout, setSpread, dispose };
}
