import { MathUtils } from 'three';
import { STORY_TIMING } from './story-config.js';

const growMs = 1150, gatherMs = 2300, seatingMs = 1350;
const revolution = 2 * Math.PI;
const speed = revolution / 3600; // radians per millisecond
const easeInMs = 290;
const maxFlightTurn = MathUtils.degToRad(260);
const minBrakingTurn = MathUtils.degToRad(18);

// The authored positions run backwards from the molar to the atlas. Give
// seating its own screen time and carry velocity across the join. A slow
// device then has time to show the shape change after the camera arrives.
function assemblyProgress(time) {
  const start=STORY_TIMING.openingTooth, seat=STORY_TIMING.assemblyCrowns[1], end=STORY_TIMING.atlas[1];
  const velocity=(end-seat)/seatingMs;
  if(time<gatherMs){
    const t=time/gatherMs;
    return MathUtils.lerp(start,seat,t*t*(3-2*t)) + velocity*gatherMs*t*t*(t-1);
  }
  const t=Math.min(1,(time-gatherMs)/seatingMs);
  return MathUtils.lerp(seat,end,t*t*(3-2*t)) + velocity*seatingMs*t*(1-t)**2;
}

/** Gather the existing rooted teeth from the live loading camera's actual angle. */
export function createOpeningFlight(initialYaw = 0) {
  const [atlasStart] = STORY_TIMING.atlas;
  const seed = STORY_TIMING.openingTooth;
  const shot = { progress: seed, yaw: initialYaw, growth: 0, phase: 'spin', done: false };
  let previous, elapsed = 0, launch, launchYaw, landingYaw, turnMs;

  function orbitYaw(time) {
    // Integrate a smooth acceleration from the first poster frame into the
    // steady orbit. Growth, download notifications and angle wraps never reset it.
    if (time >= easeInMs) return initialYaw + speed * (time - easeInMs / 2);
    const u = time / easeInMs;
    return initialYaw + speed * easeInMs * u ** 3 * (1 - u / 2);
  }

  function prepareFlight(readyAt) {
    const angle = orbitYaw(readyAt);
    // Unwrapped angles always travel forward. Leave some braking distance
    // even if the download completes exactly as the tooth faces its seat.
    landingYaw = revolution * Math.ceil((angle + minBrakingTurn) / revolution);
    launch = readyAt + Math.max(0, landingYaw - angle - maxFlightTurn) / speed;
    launchYaw = orbitYaw(launch);
    turnMs = Math.min(gatherMs, 2 * (landingYaw - launchYaw) / speed);
  }

  return {
    sample(now, crownsReady = true) {
      if (shot.done) return shot;
      // A late GPU frame must not jump several tooth poses to catch up.
      if (previous !== undefined) elapsed += MathUtils.clamp(now - previous, 0, shot.phase==='flight'?40:75);
      previous = now;
      shot.yaw = orbitYaw(elapsed);
      shot.growth = MathUtils.smootherstep(elapsed, 100, growMs);
      if (elapsed < growMs) return shot;
      if (launch === undefined) {
        if (!crownsReady) {
          shot.phase = 'waiting';
          return shot;
        }
        prepareFlight(shot.phase === 'waiting' ? elapsed : growMs);
      }
      if (elapsed < launch) {
        shot.phase = 'spin';
        return shot;
      }
      const flightElapsed = elapsed - launch;
      const u = Math.min(1, flightElapsed / turnMs);
      // Cubic Hermite: leave the orbit at its actual velocity and arrive
      // front-on at rest. The final crown-only hold is the authored camera.
      shot.yaw = MathUtils.lerp(launchYaw, landingYaw, u * u * (3 - 2 * u))
        + speed * turnMs * u * (1 - u) ** 2;
      shot.done = flightElapsed >= gatherMs + seatingMs;
      shot.phase = shot.done ? 'done' : 'flight';
      shot.progress = shot.done ? atlasStart : assemblyProgress(flightElapsed);
      return shot;
    },
    pause() { previous = undefined; },
  };
}
