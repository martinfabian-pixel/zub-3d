import { MathUtils } from 'three';
import { STORY_TIMING } from './story-config.js';

const spinMs = 1150, flightMs = 2750, maxFrameMs = 75;
const blendOutMs = 850;

// Keep the studio's three-quarter view while the rest of the arch downloads.
// The cosine leaves and returns to the flight's starting angle at zero speed.
function inspectionYaw(milliseconds) {
  return MathUtils.degToRad(13) * (1 - Math.cos(2 * Math.PI * milliseconds / 4400));
}

/** The prologue gathers the existing rooted teeth along their authored flight paths. */
export function createOpeningFlight(initialYaw = 0) {
  const [atlasStart, atlasEnd] = STORY_TIMING.atlas;
  const seed = STORY_TIMING.openingTooth;
  const shot = { progress: seed, yaw: initialYaw, growth: 0, phase: 'spin', done: false };
  const turn = 2 * Math.PI - Math.atan2(Math.sin(initialYaw), Math.cos(initialYaw));
  let previous, elapsed = 0, launch;
  return {
    sample(now, crownsReady = true) {
      if (shot.done) return shot;
      // A slow draw or shader compilation must not skip a visible movement.
      if (previous !== undefined) elapsed += MathUtils.clamp(now - previous, 0, maxFrameMs);
      previous = now;
      if (elapsed < spinMs) {
        shot.yaw = initialYaw + turn * MathUtils.smootherstep(elapsed, 0, spinMs);
        shot.growth = MathUtils.smootherstep(elapsed, 100, spinMs);
        return shot;
      }
      shot.growth = 1;
      if (!crownsReady && launch === undefined) {
        shot.yaw = inspectionYaw(elapsed - spinMs);
        shot.phase = 'waiting';
        return shot;
      }
      launch ??= shot.phase === 'waiting' ? elapsed : spinMs;
      const flightElapsed = elapsed - launch;
      // Continue the actual waiting motion through launch, then ease the small
      // angle back to the authored path before the surrounding teeth assemble.
      shot.yaw = launch > spinMs && flightElapsed < blendOutMs
        ? inspectionYaw(elapsed - spinMs) * (1 - MathUtils.smootherstep(flightElapsed, 0, blendOutMs)) : 0;
      const travel = MathUtils.smoothstep(flightElapsed, 0, flightMs);
      shot.done = travel === 1;
      shot.phase = shot.done ? 'done' : 'flight';
      shot.progress = shot.done ? atlasStart : MathUtils.lerp(seed, atlasEnd, travel);
      return shot;
    },
    pause() { previous = undefined; },
  };
}
