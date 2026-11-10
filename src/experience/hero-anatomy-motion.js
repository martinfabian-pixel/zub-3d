import { MathUtils } from 'three';

// One gentle introduction, then an optional user-controlled view. Animation
// shares the existing on-demand renderer and never owns another frame loop.
export function createHeroAnatomyMotion() {
  let previous = 0, elapsed = 0, weight = 0, manual = null, started = false, finished = false;
  const smooth = t => { t = MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  return {
    setActive(value) { manual = Boolean(value); finished = true; },
    update(now, { hero, preview = true, reducedMotion, interacting }) {
      const dt = previous ? Math.min(50, Math.max(0, now - previous)) : 16.67;
      previous = now;
      if (!hero) {
        weight = 0; manual = null; finished ||= started;
        return { weight, active: false, moving: false };
      }
      if (!preview && started) finished = true;
      if (interacting && manual === null) finished = true;
      let target = manual ? 1 : 0, waiting = false;
      const automatic=preview&&!finished&&!reducedMotion&&manual===null;
      if (automatic) {
        started = true;
        elapsed += dt;
        if (elapsed < 1100) { target = 0; waiting = true; }
        else if (elapsed < 2000) target = smooth((elapsed - 1100) / 900);
        else if (elapsed < 3400) target = 1;
        else if (elapsed < 4300) target = 1 - smooth((elapsed - 3400) / 900);
        else { target = 0; finished = true; }
        weight = target;
      } else if (reducedMotion) weight = target;
      else {
        weight += (target - weight) * (1 - Math.exp(-dt / 150));
        if (Math.abs(weight - target) < .002) weight = target;
      }
      return { weight, active: weight > .02 || manual === true,
        moving: waiting || (automatic && !finished) || Math.abs(weight - target) > .002 };
    },
    resetClock() { previous = 0; },
  };
}
