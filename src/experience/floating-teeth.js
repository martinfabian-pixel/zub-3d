import { MathUtils, Matrix4, Euler } from 'three';
import { STORY_TIMING } from './story-config.js';

export const [flightStart,flightEnd] = STORY_TIMING.flight;
const authoredStart = .802, authoredEnd = .969;
// The opening still uses the original authored flight clock. The scroll
// story approaches the seated teeth independently of these trajectories.
export const flightProgress = authored => MathUtils.mapLinear(authored,authoredEnd,authoredStart,flightStart,flightEnd);
const authoredProgress = progress => MathUtils.mapLinear(progress,flightStart,flightEnd,authoredEnd,authoredStart);

const smooth = (start, end, progress) => MathUtils.smoothstep(progress, start, end);
const heightLane = [.75, 1.24, .60, 1.08, 1.42, .83, 1.20];
// Ordered depth layers give a foreground/midground/background separation;
// none of the per-tooth offsets depend on frame time or random state.
const depthLane = [1.48, -1.42, .42, 2.00, -1.76, 1.10, -.96];
const tiltLane = [.52, -.46, .76, -.65, .41, -.57, .68];

export function flightReveal(progress, fdi) {
  const authored = authoredProgress(progress);
  if (!fdi) return smooth(authoredStart,.858,authored);
  const lane = (fdi % 10 + Math.floor(fdi / 10) * 2) % 7;
  const from = authoredStart + lane * .004;
  return smooth(from,from + .055,authored);
}

// A broad flight envelope; individual arcs continue moving inside its plateau.
export function floatingAmount(progress) {
  const authored = authoredProgress(progress);
  return smooth(authoredStart,.858,authored) * (1 - smooth(.916,authoredEnd,authored));
}

export function createFloatingTeeth(teeth) {
  const rotation = new Matrix4();
  const angles = new Euler();
  const records = [];
  for (const [fdi, item] of teeth) {
    const base = (item.seatedMatrix??item.mesh.matrix).clone();
    const side = Math.sign(base.elements[12]) || 1;
    const jaw = item.upper ? 1 : -1;
    const index = fdi % 10 - 1;
    const lane = (index + (side > 0 ? 1 : 0) + (item.upper ? 0 : 3)) % 7;
    const isTeachingGroup = fdi >= 35 && fdi <= 37;
    // The premolars travel through staggered middle-depth lanes. They break
    // up the two original rows without crowding the main foreground silhouettes.
    const crossesCenter = [14,15,25,34,44,45].includes(fdi);
    const launch = isTeachingGroup ? authoredStart + (fdi - 35) * .004
      : .813 + (6 - index) * .002 + (side < 0 ? .004 : 0);
    const land = authoredEnd - index * .0036 - (item.upper ? .002 : 0);
    records.push({
      item, base, side, jaw, launch, land,
      x: crossesCenter ? -base.elements[12]*.60 + (lane-3)*.09 : side*(.43+.055*index)+(lane%2?.18:-.18),
      y: crossesCenter ? -base.elements[13]+jaw*(.22+.20*(lane%3))+(side<0?.10:-.10) : jaw*(heightLane[lane]+.38),
      z: crossesCenter ? -2.1-.15*index : depthLane[lane]+(item.upper?-.18:.12),
      pitch: crossesCenter ? side*.88 : tiltLane[lane],
      yaw: -side * (.30 + .045 * index),
      roll: -side * jaw * (.22 + .038 * index),
      phase: index*.73 + (item.upper?.54:1.54) + (side>0?.39:0), crossesCenter,
    });
  }

  let wasActive = false;
  return {
    update(progress, closure, compact = false) {
      const amount = floatingAmount(progress);
      if (!amount && !wasActive) return amount;
      const authored = authoredProgress(progress);
      const drift = 2 * smooth(.83, .936, authored) - 1;
      const route = Math.PI * smooth(.826, .958, authored);
      for (const tooth of records) {
        const { item, base, side, jaw, launch, land, x, y, z, pitch, yaw, roll, phase, crossesCenter } = tooth;
        const release = smooth(launch, launch + .034, authored);
        const settle = smooth(land - .073, land, authored);
        const flight = release * (1 - settle);
        const sweep = flight * drift;
        const mesh = item.mesh;
        mesh.matrix.copy(base);
        const position = mesh.matrix.elements;
        if (item.upper) position[13] -= closure;
        // Bow the paths in opposite directions on the two rows. A narrower
        // horizontal spread on phones leaves room for the foreground teeth.
        const arcX=Math.sin(route+phase)*.27, arcY=Math.cos(route*.82+phase)*.22;
        const arcZ=Math.sin(route*.8+phase)*.42;
        position[12] += flight * ((compact ? (crossesCenter?x*.85:x*.58-base.elements[12]*.10) : x) + arcX)
          + sweep * side * jaw * .53;
        position[13] += flight * (y + arcY) + sweep * jaw * .48;
        position[14] += flight * (z + arcZ) + sweep * (.38 + side * jaw * .58);
        if (flight) {
          angles.set(flight * pitch + sweep * .30, flight * yaw + sweep * side * .51,
            flight * roll - sweep * jaw * .23);
          rotation.makeRotationFromEuler(angles);
          mesh.matrix.multiply(rotation);
        }
        mesh.updateMatrixWorld(true);
      }
      wasActive = amount > 0;
      return amount;
    },
  };
}
