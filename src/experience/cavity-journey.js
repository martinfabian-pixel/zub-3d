import { MathUtils, Spherical, Vector3 } from 'three';

const fitSamples = new WeakMap();

/** Time-based camera move expressed in the view controller's own offsets.
 * The view controller remains the sole writer of the actual camera. This
 * module owns no animation loop and does not alter the scroll timeline.
 */
export function createCavityJourney({ durationMs = 1150, revealYaw = -0.30 } = {}) {
  let start = null, destination = null, began = 0, duration = 0;
  let active = false, arrivalPending = false;

  const copy = snapshot => ({ ...snapshot, focus: [...snapshot.focus] });
  function move(from, to, { now = performance.now(), instant = false, milliseconds = durationMs } = {}) {
    start = copy(from);
    destination = copy(to);
    const turn = destination.yaw - start.yaw;
    destination.yaw = start.yaw + Math.atan2(Math.sin(turn), Math.cos(turn));
    began = now;
    duration = instant ? 0 : Math.max(0, milliseconds);
    active = true;
    arrivalPending = true;
  }
  return {
    begin(snapshot, { factor = .55, now = performance.now(), instant = false } = {}) {
      if (!snapshot || !(factor > 0) || !Number.isFinite(factor)) return false;
      const target = copy(snapshot);
      // zoom is the logarithm of the distance multiplier, not a distance.
      target.zoom += Math.log(factor);
      // View the proximal opening from the 36 side: this small orbit reveals
      // its rim instead of letting the neighboring 37 fill the right side.
      target.yaw += revealYaw;
      move(snapshot, target, { now, instant });
      return true;
    },
    move,
    update(now = performance.now()) {
      if (!active) return { snapshot: null, moving: false, arrived: false };
      const t = duration ? Math.min(1, Math.max(0, (now - began) / duration)) : 1;
      const s = t * t * t * (t * (t * 6 - 15) + 10);
      const snapshot = copy(start);
      snapshot.zoom = start.zoom + (destination.zoom - start.zoom) * s;
      snapshot.yaw = start.yaw + (destination.yaw - start.yaw) * s;
      snapshot.pitch = MathUtils.lerp(start.pitch, destination.pitch, s);
      snapshot.focus = start.focus.map((value, axis) => MathUtils.lerp(value, destination.focus[axis], s));
      if (t === 1) {
        active = false;
        const arrived = arrivalPending;
        arrivalPending = false;
        return { snapshot: destination, moving: false, arrived };
      }
      return { snapshot, moving: true, arrived: false };
    },
    cancel() { active = false; arrivalPending = false; start = destination = null; },
    get active() { return active; },
  };
}

/** Fit the same FDI 36 in the portion of the stage clear of the layer controls. */
export function frameCavityAnatomy({ host, viewNormal, viewCenter }, rig) {
  const { camera, pose } = rig;
  const portrait = camera.aspect < 1 && camera.view.fullWidth <= 700;
  const compactHeight = portrait ? MathUtils.clamp((750 - camera.view.fullHeight) / 500, 0, .14) : 0;
  const framing = portrait ? [.52, .385 - compactHeight * .42, .84, .55 - compactHeight] : [.70, .51, .49, .71];
  const [x, y, width, height] = framing;
  const forward = viewNormal.clone().normalize();
  const point = new Vector3();
  // Samples of the native contour give a closer fit than the corners of a
  // box around the roots. Calculate these once, outside the render loop.
  let samples = fitSamples.get(host);
  if (!samples) {
    const right = new Vector3(0, 1, 0).cross(forward).normalize();
    const up = new Vector3().crossVectors(forward, right);
    const position = host.geometry.getAttribute('position');
    samples = new Float32Array(Math.ceil(position.count / 4) * 3);
    host.updateWorldMatrix(true, false);
    for (let i = 0, k = 0; i < position.count; i += 4, k += 3) {
      point.fromBufferAttribute(position, i).applyMatrix4(host.matrixWorld).sub(viewCenter);
      samples[k] = Math.abs(point.dot(right));
      samples[k + 1] = Math.abs(point.dot(up));
      samples[k + 2] = point.dot(forward);
    }
    fitSamples.set(host, samples);
  }
  const tanY = Math.tan(MathUtils.degToRad(camera.fov / 2)) / pose.opticalZoom;
  const tanX = tanY * camera.aspect;
  let radius = 0;
  for (let i = 0; i < samples.length; i += 3) {
    radius = Math.max(radius, samples[i + 2] + Math.max(samples[i] / (tanX * width), samples[i + 1] / (tanY * height)));
  }
  const story = new Spherical().setFromVector3(point.subVectors(pose.position, pose.target));
  const aim = new Spherical().setFromVector3(forward);
  const distance = (radius + .09) / story.radius;
  return {
    x, y, distance,
    snapshot: { yaw: aim.theta - story.theta, pitch: story.phi - aim.phi,
      zoom: Math.log(distance), focus: viewCenter.clone().sub(pose.target).toArray() },
  };
}
