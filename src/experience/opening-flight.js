import { MathUtils } from 'three';
import { STORY_TIMING } from './story-config.js';

const spinMs = 1150, flightMs = 2000, maxFrameMs = 75;

/** The prologue gathers the existing rooted teeth along their authored flight paths. */
export function createOpeningFlight() {
  const [atlasStart, atlasEnd] = STORY_TIMING.atlas;
  const seed = STORY_TIMING.openingTooth;
  const shot = { progress: seed, yaw: 0, growth: 0, phase: 'spin', done: false };
  let previous, elapsed = 0;
  return {
    sample(now, crownsReady = true) {
      if (shot.done) return shot;
      // A slow draw or shader compilation must not skip a visible movement.
      if (previous !== undefined) elapsed += MathUtils.clamp(now - previous, 0, maxFrameMs);
      previous = now;
      if (elapsed < spinMs) {
        shot.yaw = 2 * Math.PI * MathUtils.smootherstep(elapsed, 0, spinMs);
        shot.growth = MathUtils.smootherstep(elapsed, 100, spinMs);
        return shot;
      }
      shot.yaw = 0;
      shot.growth = 1;
      if (!crownsReady) {
        elapsed = spinMs;
        previous = undefined;
        shot.phase = 'waiting';
        return shot;
      }
      const travel = MathUtils.smoothstep(elapsed - spinMs, 0, flightMs);
      shot.done = travel === 1;
      shot.phase = shot.done ? 'done' : 'flight';
      shot.progress = shot.done ? atlasStart : MathUtils.lerp(seed, atlasEnd, travel);
      return shot;
    },
    pause() { previous = undefined; },
  };
}
