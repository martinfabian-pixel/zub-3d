import { Box3, MathUtils, Matrix4, Spherical, Vector3 } from 'three';
import { STORY_TIMING } from './story-config.js';

const { clamp, lerp, smoothstep, smootherstep } = MathUtils;
const [,atlasEnd]=STORY_TIMING.atlas;
export const atlasCoverage = (progress) =>
  1-smoothstep(progress,atlasEnd,STORY_TIMING.assemblyCrowns[1]);

const copyPose = ({ position, target, screenX = .5, screenY = .5, opticalZoom = 1 }) =>
  ({ position: position.clone(), target: target.clone(), screenX, screenY, opticalZoom });

/** Coordinate the actual seated mesh, isolation and guided camera on one clock.
 * The story retains ownership of the original matrices and manual input remains
 * an offset to the guided base in the existing view controller.
 */
export function createFullArchFocus() {
  const records = new Map();
  const bounds = new Box3(), point = new Vector3(), right = new Vector3(), up = new Vector3();
  const toothWorld = new Matrix4();
  const basisUp = new Vector3(0, 1, 0);
  const a = new Spherical(), b = new Spherical(), orbit = new Spherical();
  const pose = { position: new Vector3(), target: new Vector3(), screenX: .5, screenY: .5, opticalZoom: 1 };
  const fadedPose = copyPose(pose);
  let selected = null, motion = null, current = null, moving = false, returning = false;
  let fromMap = false, mapDetail = 0;

  function initialize(arch) {
    if (records.size) return;
    for (const [fdi, item] of arch.teeth) {
      const { mesh, seatedMatrix } = item;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const center = mesh.geometry.boundingBox.getCenter(new Vector3()).applyMatrix4(seatedMatrix);
      // Draw the tooth out of its own arch rather than through its neighbours.
      const outward = new Vector3(center.x * .31, item.upper ? .15 : -.15, .92);
      const offset = new Vector3(-center.x * .14, item.upper ? -.12 : .20, 1.26);
      records.set(fdi, { item, outward, offset, baseMatrix: new Matrix4(), amount: 0, opacity: 1, applied: false });
    }
  }

  // Fit the two opposing camera planes to the actual enamel and root tips.
  // The midpoint of their supports centres an asymmetric silhouette, even
  // when the buccal root is closer to the camera than the lingual one.
  function fitMapTooth(record, target, direction, horizontalSlope, verticalSlope) {
    const { mesh, seatedMatrix } = record.item;
    toothWorld.copy(seatedMatrix).setPosition(
      seatedMatrix.elements[12] + record.offset.x,
      seatedMatrix.elements[13] + record.offset.y,
      seatedMatrix.elements[14] + record.offset.z);
    toothWorld.premultiply(mesh.parent.matrixWorld);
    const vertices = mesh.geometry.attributes.position;
    let left = Infinity, bottom = Infinity, rightEdge = -Infinity, top = -Infinity;
    for (let i = 0; i < vertices.count; i++) {
      point.fromBufferAttribute(vertices, i).applyMatrix4(toothWorld).sub(target);
      const depth = point.dot(direction), x = point.dot(right), y = point.dot(up);
      left = Math.min(left, x - horizontalSlope * depth);
      rightEdge = Math.max(rightEdge, x + horizontalSlope * depth);
      bottom = Math.min(bottom, y - verticalSlope * depth);
      top = Math.max(top, y + verticalSlope * depth);
    }
    target.addScaledVector(right, (left + rightEdge) / 2);
    target.addScaledVector(up, (bottom + top) / 2);
    return Math.max((rightEdge - left) / (2 * horizontalSlope), (top - bottom) / (2 * verticalSlope));
  }

  function destination(record, rig, { compact, short, mapSpace }) {
    const { mesh, seatedMatrix } = record.item;
    bounds.copy(mesh.geometry.boundingBox).applyMatrix4(seatedMatrix).translate(record.offset);
    bounds.applyMatrix4(mesh.parent.matrixWorld);
    const target = bounds.getCenter(new Vector3());
    const side = Math.tanh((target.x - rig.pose.target.x) * .48);
    const direction = new Vector3(.24 + side * .21, record.item.upper ? -.08 : .16, 1).normalize();
    right.crossVectors(basisUp, direction).normalize();
    up.crossVectors(direction, right);
    const opticalZoom = rig.pose.opticalZoom ?? 1;
    const lens = Math.tan(MathUtils.degToRad(rig.camera.fov / 2)) / opticalZoom;
    if (fromMap && mapSpace) {
      const { height, top, bottom } = mapSpace;
      const available = Math.max(1, bottom - top);
      const heightFraction = lerp(.237, .335, smoothstep(height, 660, 780));
      const toothHeight = Math.min(height * heightFraction, available);
      const centreY = top + (available - toothHeight) * .25 + toothHeight / 2;
      const distance = fitMapTooth(record, target, direction,
        lens * rig.camera.aspect * .84, lens * toothHeight / height);
      return { position: direction.multiplyScalar(distance).add(target), target, opticalZoom,
        screenX: .5, screenY: centreY / height };
    }
    const height = lens * (compact ? short ? .26 : .37 : .61);
    const width = lens * rig.camera.aspect * (compact ? .77 : .46);
    let distance = 0;
    for (let i = 0; i < 8; i++) {
      point.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z).sub(target);
      distance = Math.max(distance, point.dot(direction) + Math.max(Math.abs(point.dot(up)) / height, Math.abs(point.dot(right)) / width));
    }
    return { position: direction.multiplyScalar(distance).add(target), target, opticalZoom,
      screenX: compact ? .5 : .69, screenY: compact ? short ? .66 : .623 : .51 };
  }

  function begin(from, to, now, duration, clearance = 0) {
    for (const [fdi, record] of records) {
      record.fromAmount = record.amount;
      record.fromOpacity = record.opacity;
      record.toAmount = Number(!returning && fdi === selected);
      record.toOpacity = Number(returning || fdi === selected);
    }
    current = copyPose(from);
    motion = { from: current, to: copyPose(to), now, duration, clearance, mapStart: mapDetail };
    moving = true;
  }

  function interpolate(from, to, t, result, clearance = 0) {
    a.setFromVector3(point.subVectors(from.position, from.target));
    b.setFromVector3(point.subVectors(to.position, to.target));
    const delta = Math.atan2(Math.sin(b.theta - a.theta), Math.cos(b.theta - a.theta));
    // Give a longer crossing room in front of the arch. The radius returns
    // to its original interpolation with zero extra velocity at either end.
    const pullback = clearance * (4 * t * (1 - t)) ** 2;
    const radius = Math.exp(lerp(Math.log(a.radius), Math.log(b.radius), t)) + pullback;
    orbit.set(radius, lerp(a.phi, b.phi, t), a.theta + delta * t);
    result.target.copy(from.target).lerp(to.target, t);
    result.position.setFromSpherical(orbit).add(result.target);
    result.screenX = lerp(from.screenX, to.screenX, t);
    result.screenY = lerp(from.screenY, to.screenY, t);
    result.opticalZoom = lerp(from.opticalZoom ?? 1, to.opticalZoom ?? 1, t);
    return result;
  }

  function restoreMeshes() {
    for (const record of records.values()) {
      if (!record.applied) continue;
      const { mesh } = record.item;
      mesh.matrix.copy(record.baseMatrix);
      mesh.updateMatrixWorld(true);
      record.applied = false;
    }
  }

  function clear() {
    restoreMeshes();
    for (const record of records.values()) {
      record.amount = 0;
      record.opacity = 1;
    }
    selected = null; motion = null; current = null; moving = false; returning = false;
    fromMap = false; mapDetail = 0;
  }

  return {
    select(fdi, { arch, rig, framing, from, now, instant, map = false }) {
      if (!arch.teeth.get(fdi)?.mesh || (fdi === selected && !returning)) return false;
      initialize(arch);
      if (selected === null) fromMap = map;
      // `current` is the guide applied on the last displayed frame. The view
      // controller keeps the visitor's orbit and zoom relative to this guide.
      const origin = current ?? from;
      const next = destination(records.get(fdi), rig, framing);
      const clearance = current ? Math.min(2, origin.target.distanceTo(next.target) * .48) : 0;
      selected = fdi; returning = false;
      begin(origin, next, now, instant ? 0 : 1040, clearance);
      return true;
    },
    returnToArch(from, to, now, instant, { retarget = false } = {}) {
      if (selected === null || (returning && !retarget)) return false;
      returning = true;
      begin(from, to, now, instant ? 0 : 920);
      return true;
    },
    refit(rig, framing, now, instant, returnPose) {
      if (!current || selected === null || (returning && !returnPose)) return;
      const remaining = motion ? Math.max(240, motion.duration - (now - motion.now)) : 300;
      const next = returning ? returnPose : destination(records.get(selected), rig, framing);
      begin(current, next, now, instant ? 0 : remaining);
    },
    advance(now) {
      if (!motion) return;
      const { from, to, now: began, duration, clearance } = motion;
      const t = duration ? clamp((now - began) / duration, 0, 1) : 1;
      const travel = smootherstep(t, 0, 1);
      if (fromMap) mapDetail = lerp(motion.mapStart, returning ? 0 : 1, travel);
      for (const record of records.values()) {
        record.amount = lerp(record.fromAmount, record.toAmount, travel);
        const timing = returning ? smoothstep(t, .21, .96)
          : record.toOpacity ? smoothstep(t, 0, .64) : smoothstep(t, .12, .83);
        record.opacity = lerp(record.fromOpacity, record.toOpacity, timing);
      }
      current = interpolate(from, to, travel, pose, clearance);
      if (t === 1) { motion = null; moving = false; }
    },
    apply(basePose, progress) {
      if (selected === null || !current) return null;
      const coverage = fromMap ? 1 : atlasCoverage(progress);
      for (const record of records.values()) {
        const travel = record.amount * coverage;
        record.applied = travel > 0;
        if (!record.applied) continue;
        const { mesh, crown } = record.item;
        // The arch writes its current story matrices before this overlay.
        record.baseMatrix.copy(mesh.matrix);
        const translation = mesh.matrix.elements;
        const bow = Math.sin(Math.PI * travel) * .36;
        const dx = record.offset.x * travel + record.outward.x * bow;
        const dy = record.offset.y * travel + record.outward.y * bow;
        const dz = record.offset.z * travel + record.outward.z * bow;
        translation[12] += dx; translation[13] += dy; translation[14] += dz;
        mesh.updateMatrixWorld(true);
        // The cropped and rooted enamel share the same motion during the handoff.
        if (fromMap && crown.visible) {
          const position = crown.matrix.elements;
          position[12] += dx; position[13] += dy; position[14] += dz;
          crown.updateMatrixWorld(true);
        }
      }
      if (coverage === 1) return current;
      return interpolate(basePose, current, coverage, fadedPose);
    },
    opacity(fdi, progress) {
      return lerp(1, records.get(fdi)?.opacity ?? 1, fromMap ? 1 : atlasCoverage(progress));
    },
    clear,
    get selected() { return selected; },
    get moving() { return moving; },
    get returning() { return returning; },
    get engaged() { return selected !== null; },
    get fromMap() { return fromMap; },
    get mapDetail() { return mapDetail; },
  };
}
