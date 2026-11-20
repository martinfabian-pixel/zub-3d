import { MathUtils } from 'three';
import { STORY_TIMING } from './story-config.js';

// Native scroll distance in units of the regular seven-chapter route.
export const OPENING_SCROLL_SPAN = .10;
export const OPENING_TURN_END = .30;

/** The prologue gathers the existing rooted teeth along their authored flight paths. */
export function createOpeningFlight() {
  const [atlasStart, atlasEnd] = STORY_TIMING.atlas;
  const shot = {};
  return {
    sample(amount) {
      const turn = MathUtils.smootherstep(amount, 0, OPENING_TURN_END);
      const travel = MathUtils.smoothstep(amount, OPENING_TURN_END, 1);
      shot.done = amount >= 1;
      shot.phase = shot.done ? 'done' : amount < OPENING_TURN_END ? 'spin' : 'flight';
      shot.growth = turn;
      shot.yaw = turn < 1 ? 2 * Math.PI * turn : 0;
      shot.progress = shot.done ? atlasStart : MathUtils.lerp(STORY_TIMING.openingTooth, atlasEnd, travel);
      return shot;
    },
  };
}
