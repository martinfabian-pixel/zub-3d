import { Matrix4, Quaternion, Vector3 } from 'three';

const turn = 2 * Math.PI;
const shortest = angle => {
  const d = ((angle + Math.PI) % turn + turn) % turn - Math.PI;
  return Math.abs(d + Math.PI) < 1e-12 ? Math.PI : d;
};

/** Return from an orbit around its focus, rather than cutting the chord through
 * the inspected tooth. This is a Y-up camera; the destination may change as the
 * visitor scrolls. Positive focus distance does not certify a collision-free
 * route past every *other* tooth in the arch.
 */
export function createInspectionReturn(camera, durationMs) {
  const startTarget = new Vector3(), endTarget = new Vector3(), target = new Vector3();
  const endPosition = new Vector3(), endQuaternion = new Quaternion();
  const offset = new Vector3(), back = new Vector3(), right = new Vector3();
  const vertical = new Vector3(), actualRight = new Vector3(), basis = new Matrix4();
  const start = {}, end = {};
  let active = false, began = 0;

  function axes(yaw, elevation) {
    const sy = Math.sin(yaw), cy = Math.cos(yaw), ce = Math.cos(elevation);
    back.set(sy * ce, Math.sin(elevation), cy * ce);
    right.set(cy, 0, -sy);
    vertical.crossVectors(back, right);
  }

  function measure(position, rotation, focus, state) {
    offset.subVectors(position, focus);
    const radius = offset.length();
    if (!(radius > 1e-10) || !Number.isFinite(radius)) return false;
    const horizontal = Math.hypot(offset.x, offset.z);
    actualRight.set(1, 0, 0).applyQuaternion(rotation);
    // At a pole the offset has no azimuth. The saved camera frame still does.
    state.yaw = horizontal > radius * 1e-9 ? Math.atan2(offset.x, offset.z)
      : Math.atan2(-actualRight.z, actualRight.x);
    state.elevation = Math.atan2(offset.y, horizontal);
    state.logRadius = Math.log(radius);
    axes(state.yaw, state.elevation);
    state.roll = Math.atan2(actualRight.dot(vertical), actualRight.dot(right));
    return true;
  }

  function captureDestination(focus, previousYaw, previousRoll) {
    endTarget.copy(focus); endPosition.copy(camera.position); endQuaternion.copy(camera.quaternion);
    if (!measure(endPosition, endQuaternion, endTarget, end)) return false;
    // Retarget smoothly if a scrolling destination passes the ±π branch cut.
    end.yaw = previousYaw + shortest(end.yaw - previousYaw);
    end.roll = previousRoll + shortest(end.roll - previousRoll);
    return true;
  }

  return {
    begin(position, rotation, orbitFocus, storyFocus, now, instant = false) {
      active = false;
      if (instant || !(durationMs > 0)) return;
      startTarget.copy(orbitFocus);
      if (!measure(position, rotation, startTarget, start)
        || !captureDestination(storyFocus, start.yaw, start.roll)) return;
      began = now; active = true;
      target.copy(startTarget);
      camera.position.copy(position); camera.quaternion.copy(rotation); camera.updateMatrixWorld(true);
    },
    destination(focus) {
      if (active && !captureDestination(focus, end.yaw, end.roll)) active = false;
    },
    update(now) {
      if (!active) return false;
      const t = Math.min(1, Math.max(0, (now - began) / durationMs));
      if (t === 1) {
        target.copy(endTarget);
        camera.position.copy(endPosition); camera.quaternion.copy(endQuaternion);
        camera.updateMatrixWorld(true); active = false; return false;
      }
      const s = t * t * (3 - 2 * t);
      target.lerpVectors(startTarget, endTarget, s);
      axes(start.yaw + (end.yaw - start.yaw) * s, start.elevation + (end.elevation - start.elevation) * s);
      const radius = Math.exp(start.logRadius + (end.logRadius - start.logRadius) * s);
      camera.position.copy(target).addScaledVector(back, radius);
      camera.quaternion.setFromRotationMatrix(basis.makeBasis(right, vertical, back));
      camera.rotateZ(start.roll + (end.roll - start.roll) * s);
      camera.updateMatrixWorld(true);
      return true;
    },
    cancel() { active = false; },
    get active() { return active; },
    get target() { return target; },
  };
}
