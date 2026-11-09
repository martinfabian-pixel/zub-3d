import { MathUtils, Vector3 } from 'three';

const TURN = 2 * Math.PI;
const up = new Vector3(0, 1, 0);
const smooth = value => {
  const t = MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};
const shortest = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

/** A single introductory orbit, composed into the story pose before the view
 * controller applies manual input. Once interrupted it never restarts itself.
 */
export function createHeroSpin({ durationMs = 6400, returnMs = 550 } = {}) {
  const offset = new Vector3();
  let state = 'idle', angle = 0, previousTime = 0, elapsed = 0, startAngle = 0;

  function beginReturn() {
    if (state === 'done' || state === 'returning') return;
    startAngle = shortest(angle);
    angle = startAngle;
    elapsed = 0;
    state = Math.abs(angle) < 1e-6 ? 'done' : 'returning';
  }

  function update(now, { progress, reducedMotion, interacting, exploring, modified }) {
    const dt = previousTime ? Math.min(50, Math.max(0, now - previousTime)) : 0;
    previousTime = now;
    if (reducedMotion) {
      state = 'done'; angle = 0;
      return false;
    }
    if (state === 'idle') state = progress > .001 ? 'done' : 'spinning';
    if (state === 'returning' && (interacting || exploring)) state = 'paused';
    if (state === 'spinning' && (interacting || exploring || modified)) state = 'paused';
    if ((state === 'spinning' || state === 'paused') && progress > .001 && !interacting && !exploring) beginReturn();
    if (state === 'spinning') {
      elapsed += dt;
      angle = TURN * smooth(elapsed / durationMs);
      if (elapsed >= durationMs) { angle = 0; state = 'done'; }
    } else if (state === 'returning') {
      elapsed += dt;
      angle = startAngle * (1 - smooth(elapsed / returnMs));
      if (elapsed >= returnMs) { angle = 0; state = 'done'; }
    }
    return state === 'spinning' || state === 'returning';
  }

  return {
    update,
    apply(pose) {
      if (!angle) return pose;
      offset.subVectors(pose.position, pose.target).applyAxisAngle(up, angle);
      pose.position.copy(pose.target).add(offset);
      return pose;
    },
    release: beginReturn,
    get angle() { return angle; },
    get state() { return state; },
  };
}
