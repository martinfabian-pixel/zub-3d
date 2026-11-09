/** Time-based camera move expressed in the view controller's own offsets.
 * The view controller remains the sole writer of the actual camera. This
 * module owns no animation loop and does not alter the scroll timeline.
 */
export function createCavityJourney({ durationMs = 1150, revealYaw = -0.30 } = {}) {
  let start = null, destination = null, began = 0, duration = 0;
  let active = false, arrivalPending = false;

  const copy = snapshot => ({ ...snapshot, focus: [...snapshot.focus] });
  return {
    begin(snapshot, { factor = .55, now = performance.now(), instant = false } = {}) {
      if (!snapshot || !(factor > 0) || !Number.isFinite(factor)) return false;
      start = copy(snapshot);
      destination = copy(snapshot);
      // zoom is the logarithm of the distance multiplier, not a distance.
      destination.zoom += Math.log(factor);
      // View the proximal opening from the 36 side: this small orbit reveals
      // its rim instead of letting the neighboring 37 fill the right side.
      destination.yaw += revealYaw;
      began = now;
      duration = instant ? 0 : Math.max(0, durationMs);
      active = true;
      arrivalPending = true;
      return true;
    },
    update(now = performance.now()) {
      if (!active) return { snapshot: null, moving: false, arrived: false };
      const t = duration ? Math.min(1, Math.max(0, (now - began) / duration)) : 1;
      const s = t * t * t * (t * (t * 6 - 15) + 10);
      const snapshot = copy(start);
      snapshot.zoom = start.zoom + (destination.zoom - start.zoom) * s;
      snapshot.yaw = start.yaw + (destination.yaw - start.yaw) * s;
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
