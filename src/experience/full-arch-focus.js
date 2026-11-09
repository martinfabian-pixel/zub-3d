import { Box3, MathUtils, Vector3 } from 'three';

/** A guided view expressed entirely in the existing camera controller offsets.
 * The animation has no renderer or RAF; the scene's single render loop samples it. */
export function createFullArchFocus() {
  const box = new Box3(), size = new Vector3(), center = new Vector3();
  let start, end, began = 0, duration = 0, moving = false;
  const copy = s => ({ ...s, focus: [...s.focus] });
  return {
    destination(mesh, rig, camera, current) {
      if (!mesh?.geometry || !rig?.pose) return null;
      mesh.geometry.computeBoundingBox();
      mesh.updateWorldMatrix(true, false);
      box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      box.getCenter(center); box.getSize(size);
      const halfFov = MathUtils.degToRad(camera.fov * .5);
      const vertical = size.y / (2 * Math.tan(halfFov));
      const horizontal = Math.max(size.x, size.z * .65) / (2 * Math.tan(halfFov) * Math.max(.4, camera.aspect));
      const radius = Math.max(vertical, horizontal) * 1.62 / Math.max(.1, camera.zoom);
      const storyRadius = rig.pose.position.distanceTo(rig.pose.target);
      if (!(storyRadius > 0 && radius > 0)) return null;
      const next = copy(current);
      next.focus = center.clone().sub(rig.pose.target).toArray();
      // Preserve the visitor's orbit, while fitting the complete root and crown.
      next.zoom = Math.log(MathUtils.clamp(radius / storyRadius, .28, .7));
      return { snapshot: next, center: center.clone() };
    },
    begin(from, to, { now = performance.now(), instant = false } = {}) {
      start = copy(from); end = copy(to); began = now; duration = instant ? 0 : 850; moving = true;
    },
    update(now) {
      if (!moving) return { moving: false, snapshot: null };
      const t = duration ? MathUtils.clamp((now - began) / duration, 0, 1) : 1;
      const s = t * t * (3 - 2 * t);
      const result = copy(start);
      for (const key of ['yaw', 'pitch', 'zoom']) result[key] += (end[key] - start[key]) * s;
      result.focus = start.focus.map((value, i) => value + (end.focus[i] - value) * s);
      if (t === 1) moving = false;
      return { moving, snapshot: result };
    },
    cancel() { moving = false; },
    get active() { return moving; },
  };
}
