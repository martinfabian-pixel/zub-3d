import { Box3, MathUtils, Matrix4, Vector3 } from 'three';

export const DEFAULT_STOPS = Object.freeze({ hero: 0.07, neighbors: 0.36, arch: 0.65, full: 0.88 });
export const JOURNEY_STAGES = Object.freeze(Object.keys(DEFAULT_STOPS));
const directions = {
  hero: [0.75, 0.8, 1], neighbors: [0.65, 0.85, 1], arch: [0.32, 1.1, 1], full: [0.58, 0.1, 1],
};
const padding = { hero: 1.12, neighbors: 1.11, arch: 1.10, full: 1.10 };
const portraitPadding = { hero: 1.12, neighbors: 1.09, arch: 1.08, full: 1.08 };
const up = new Vector3(0, 1, 0);
const unit = (value) => MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1);

/** Stage names describe the subject being approached. There is a hold at each end. */
export function getStage(progress, stops = DEFAULT_STOPS, out = {}) {
  const p = unit(progress);
  let from = 0;
  const stages=Object.keys(stops);
  for (const stage of stages) {
    const to = stops[stage];
    if (p <= to) {
      out.stage = stage;
      out.localProgress = to > from ? unit((p - from) / (to - from)) : 1;
      return out;
    }
    from = to;
  }
  out.stage = stages.at(-1);
  out.localProgress = 1;
  return out;
}

function visitBox(box, transform, emit) {
  if (box.isEmpty()) return;
  const point = new Vector3();
  for (let i = 0; i < 8; i++) {
    point.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    if (transform) point.applyMatrix4(transform);
    emit(point);
  }
}

// Hero and neighbors use the actual exterior. For the larger arches the union
// of *per-mesh* oriented boxes retains the arch shape without walking all 28
// meshes' vertices each time. Hidden reveal groups are intentionally included.
function visitLandmark(source, precise, emit) {
  if (typeof source === 'function') return visitLandmark(source(), precise, emit);
  if (Array.isArray(source)) { for (const item of source) visitLandmark(item, precise, emit); return; }
  if (source?.isBox3) { visitBox(source, null, emit); return; }
  if (!source?.isObject3D) throw new TypeError('Each journey landmark needs Object3D objects or world-space Box3 bounds.');
  // Fixed authored matrices are copied directly with matrixAutoUpdate=false.
  // Since r186 a plain updateWorldMatrix(true, true) can leave the matrixWorld
  // of a detached, never-rendered bounds proxy at identity unless forced.
  source.updateWorldMatrix(true, true, true);
  const point = new Vector3(), instance = new Matrix4(), world = new Matrix4();
  source.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
    if (!precise && !mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const count = mesh.isInstancedMesh ? mesh.count : 1;
    for (let j = 0; j < count; j++) {
      if (mesh.isInstancedMesh) {
        mesh.getMatrixAt(j, instance);
        world.multiplyMatrices(mesh.matrixWorld, instance);
      } else world.copy(mesh.matrixWorld);
      if (precise) {
        for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
          mesh.getVertexPosition(i, point).applyMatrix4(world);
          emit(point);
        }
      } else visitBox(mesh.geometry.boundingBox, world, emit);
    }
  });
}

function measure(source, stage, direction, targetOffset) {
  const box = new Box3(), points = [];
  visitLandmark(source, stage === 'hero' || stage === 'neighbors', (point) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
      throw new Error('Non-finite coordinates in journey landmark: ' + stage);
    }
    box.expandByPoint(point);
    points.push(point.x, point.y, point.z);
  });
  if (box.isEmpty()) throw new Error('Empty journey landmark: ' + stage);
  const target = box.getCenter(new Vector3());
  const offset = new Vector3().fromArray(targetOffset);
  const right = new Vector3().crossVectors(up, direction).normalize();
  const vertical = new Vector3().crossVectors(direction, right);
  const projected = new Float32Array(points.length);
  const p = new Vector3();
  for (let i = 0; i < points.length; i += 3) {
    p.fromArray(points, i).sub(target);
    projected[i] = p.dot(right);
    projected[i + 1] = p.dot(vertical);
    projected[i + 2] = p.dot(direction);
  }
  return { target, offset, projected, right, vertical, direction };
}

// Shape-preserving cubic Hermite interpolation with zero endpoint velocities.
// Unlike an unconstrained position spline it cannot swing past a landmark or
// shorten the camera distance below both neighboring keyframes. It is C1 at
// every knot, including the start and end holds.
function track(values, knots) {
  const slopes = values.map(() => 0);
  for (let i = 1; i < values.length - 1; i++) {
    const a = knots[i] - knots[i - 1], b = knots[i + 1] - knots[i];
    const before = (values[i] - values[i - 1]) / a;
    const after = (values[i + 1] - values[i]) / b;
    if (before * after > 0) {
      const w1 = 2 * b + a, w2 = b + 2 * a;
      slopes[i] = (w1 + w2) / (w1 / before + w2 / after);
    }
  }
  return (i, t) => {
    const t2 = t * t, t3 = t2 * t, width = knots[i + 1] - knots[i];
    return (2*t3 - 3*t2 + 1)*values[i] + (t3 - 2*t2 + t)*width*slopes[i]
      + (-2*t3 + 3*t2)*values[i + 1] + (t3 - t2)*width*slopes[i + 1];
  };
}

/**
 * Landmarks are stable world-space selections: the chosen hero, its neighbors,
 * the corresponding arch, and the full dentition. The lower-first story supplies
 * FDI 36, FDI 35–37, the 14 mandibular teeth, and all 28 seated surfaces.
 * A selection can also be a callback; refreshLandmarks() re-reads all four.
 */
export function createTimeline({ landmarks, cameraOptions = {} }) {
  const frames=cameraOptions.keyframes??Object.entries(cameraOptions.stops??DEFAULT_STOPS).map(([key,at])=>({key,at,landmark:key}));
  const names=frames.map(frame=>frame.key);
  const stops=Object.freeze(Object.fromEntries(frames.map(frame=>[frame.key,frame.at])));
  const knots = frames.map(frame=>frame.at);
  if(frames.length<2||new Set(names).size!==frames.length)throw new RangeError('Camera needs distinct named keyframes.');
  if (knots.some((v, i) => !Number.isFinite(v) || v < 0 || v > 1 || (i > 0 && v <= knots[i - 1]))) {
    throw new RangeError('Camera stops must be strictly increasing in [0, 1].');
  }
  const fov = cameraOptions.fov ?? 32, near = cameraOptions.near ?? 0.012, far = cameraOptions.far ?? 100;
  if (!(fov > 0 && fov < 180 && near > 0 && far > near)) throw new RangeError('Invalid perspective camera configuration.');
  const tanY = Math.tan(MathUtils.degToRad(fov / 2));
  const dirs = frames.map((frame) => {
    const name=frame.key;
    const value = new Vector3().fromArray(frame.direction??cameraOptions.directions?.[name]??directions[frame.landmark??name]??directions.hero).normalize();
    if (!(value.lengthSq() > 0) || Math.abs(value.y) >= 1 - 1e-8) {
      throw new Error('Camera directions must be finite, nonzero and not parallel to up: ' + name);
    }
    return value;
  });
  const yaws = [];
  for (const dir of dirs) {
    let angle = Math.atan2(dir.x, dir.z);
    if (yaws.length) {
      const previous = yaws.at(-1);
      angle = previous + Math.atan2(Math.sin(angle - previous), Math.cos(angle - previous));
    }
    yaws.push(angle);
  }
  const yaw = track(yaws, knots), elevation = track(dirs.map((d) => Math.asin(d.y)), knots);
  let measured, xyz, logDistance, lastAspect;

  function refreshLandmarks() {
    measured = frames.map((frame,i)=>measure(landmarks[frame.landmark??frame.key],frame.precise===false?'bounds':frame.landmark??frame.key,dirs[i],frame.targetOffset??cameraOptions.targetOffsets?.[frame.key]??[0,0,0]));
    lastAspect = undefined;
  }

  function fit(aspect) {
    if (lastAspect === aspect) return;
    const targets = [];
    const distances = measured.map(({ projected, target, offset, right, vertical, direction }, index) => {
      const frame=frames[index],name=frame.key;
      // Blend the framing margins through square aspect rather than popping
      // to a separate camera composition at an arbitrary device breakpoint.
      const desktop = frame.padding??cameraOptions.padding?.[name]??padding[frame.landmark??name]??1.1;
      const portrait = frame.portraitPadding??cameraOptions.portraitPadding?.[name]??portraitPadding[frame.landmark??name]??1.08;
      const margin = MathUtils.lerp(portrait, desktop, MathUtils.smoothstep(aspect, 0.65, 1.35));
      if (!(margin >= 1)) throw new RangeError('Camera padding must be at least one: ' + name);
      const kx = tanY * aspect / margin, ky = tanY / margin;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, maxDepth = -Infinity;
      for (let i = 0; i < projected.length; i += 3) {
        const x = projected[i], y = projected[i + 1], z = projected[i + 2];
        minX = Math.min(minX, x - kx*z); maxX = Math.max(maxX, x + kx*z);
        minY = Math.min(minY, y - ky*z); maxY = Math.max(maxY, y + ky*z);
        maxDepth = Math.max(maxDepth, z);
      }
      // For every point the requirement is |x-cx| <= kx*(distance-z).
      // Intersect all resulting intervals for cx (and cy). Their midpoints
      // optically centre the asymmetric arch in this particular perspective,
      // instead of wasting phone width on an empty corner of its world AABB.
      const cx = (maxX + minX) / 2, cy = (maxY + minY) / 2;
      let distance = Math.max(maxDepth + near*2, (maxX - minX)/(2*kx), (maxY - minY)/(2*ky));
      targets.push(target.clone().addScaledVector(right, cx).addScaledVector(vertical, cy).add(offset));
      if (offset.lengthSq() > 0) {
        const ox = cx + offset.dot(right), oy = cy + offset.dot(vertical), oz = offset.dot(direction);
        distance = near;
        for (let i = 0; i < projected.length; i += 3) {
          distance = Math.max(distance, projected[i + 2] - oz + Math.max(near*2,
            Math.abs(projected[i] - ox) / kx, Math.abs(projected[i + 1] - oy) / ky));
        }
      }
      if(frame.distance)distance=Math.max(distance,frame.distance);
      return Math.log(distance);
    });
    xyz = ['x', 'y', 'z'].map((axis) => track(targets.map((target) => target[axis]), knots));
    logDistance = track(distances, knots);
    lastAspect = aspect;
  }

  function sampleInto(out, progress, aspect, reducedMotion = false) {
    if (!(Number.isFinite(aspect) && aspect > 0)) throw new RangeError('Camera aspect must be positive.');
    fit(aspect);
    const p = unit(progress);
    let sceneProgress = p;
    if (reducedMotion) {
      // Arbitrary configured still compositions, without a camera sweep.
      // Use fixed midpoint thresholds so returning to a scroll position gives
      // exactly the same image in either direction.
      let nearest = 0;
      while (nearest < knots.length - 1 && p >= (knots[nearest] + knots[nearest + 1]) / 2) nearest++;
      sceneProgress = knots[nearest];
    }
    let i = 0;
    while (i < knots.length - 2 && sceneProgress > knots[i + 1]) i++;
    const t = unit((sceneProgress - knots[i]) / (knots[i + 1] - knots[i]));
    out.target.set(xyz[0](i, t), xyz[1](i, t), xyz[2](i, t));
    const azimuth = yaw(i, t), pitch = elevation(i, t), cosPitch = Math.cos(pitch);
    out.position.set(Math.sin(azimuth)*cosPitch, Math.sin(pitch), Math.cos(azimuth)*cosPitch)
      .multiplyScalar(Math.exp(logDistance(i, t))).add(out.target);
    out.progress = p;
    out.sceneProgress = sceneProgress;
    return getStage(sceneProgress, stops, out);
  }

  // Convenience for diagnostics that retain independent snapshots. The rig's
  // real-time path calls sampleInto with one persistent pose instead.
  function sample(progress, aspect, reducedMotion = false) {
    return sampleInto({ position: new Vector3(), target: new Vector3() }, progress, aspect, reducedMotion);
  }

  refreshLandmarks();
  return { sample, sampleInto, refreshLandmarks, stops, fov, near, far };
}
