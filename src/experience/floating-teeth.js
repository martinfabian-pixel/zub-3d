import { MathUtils, Matrix4, Euler } from 'three';

export const flightStart = .802;
export const flightEnd = .969;

const smooth = (start, end, progress) => MathUtils.smoothstep(progress, start, end);
const heightLane = [.75, 1.24, .60, 1.08, 1.42, .83, 1.20];
const depthLane = [.96, -.90, .34, 1.48, -1.22, .76, -.65];
const tiltLane = [.52, -.46, .76, -.65, .41, -.57, .68];

export function flightReveal(progress) {
  return smooth(flightStart, .858, progress);
}

// A broad flight envelope; individual arcs continue moving inside its plateau.
export function floatingAmount(progress) {
  return flightReveal(progress) * (1 - smooth(.916, flightEnd, progress));
}

export function createFloatingTeeth(teeth) {
  const rotation = new Matrix4();
  const angles = new Euler();
  const records = [];
  for (const [fdi, item] of teeth) {
    const base = item.mesh.matrix.clone();
    const side = Math.sign(base.elements[12]) || 1;
    const jaw = item.upper ? 1 : -1;
    const index = fdi % 10 - 1;
    const lane = (index + (side > 0 ? 1 : 0) + (item.upper ? 0 : 3)) % 7;
    const isTeachingGroup = fdi >= 35 && fdi <= 37;
    // Four premolars pass behind the open center on diagonal tracks, breaking
    // up the rows without competing with the larger foreground teeth.
    const crossesCenter = fdi===14 || fdi===25 || fdi===34 || fdi===45;
    const launch = isTeachingGroup ? flightStart + (fdi - 35) * .004
      : .813 + (6 - index) * .002 + (side < 0 ? .004 : 0);
    const land = flightEnd - index * .0028 - (item.upper ? .002 : 0);
    records.push({
      item, base, side, jaw, launch, land,
      x: side * (crossesCenter ? -.44 : .38 + .048 * index),
      y: crossesCenter ? -base.elements[13]+jaw*(index===3?.38:.02) : jaw*(heightLane[lane]+.38),
      z: crossesCenter ? -1.9-.17*index : depthLane[lane]+(item.upper?-.18:.12),
      pitch: crossesCenter ? side*.88 : tiltLane[lane],
      yaw: -side * (.30 + .045 * index),
      roll: -side * jaw * (.22 + .038 * index),
    });
  }

  let wasActive = false;
  return {
    update(progress, closure, compact = false) {
      const amount = floatingAmount(progress);
      if (!amount && !wasActive) return amount;
      const drift = 2 * smooth(.83, .936, progress) - 1;
      for (const tooth of records) {
        const { item, base, side, jaw, launch, land, x, y, z, pitch, yaw, roll } = tooth;
        const release = smooth(launch, launch + .034, progress);
        const settle = smooth(land - .073, land, progress);
        const flight = release * (1 - settle);
        const sweep = flight * drift;
        const mesh = item.mesh;
        mesh.matrix.copy(base);
        const position = mesh.matrix.elements;
        if (item.upper) position[13] -= closure;
        // Bow the paths in opposite directions on the two rows. A narrower
        // horizontal spread on phones leaves room for the foreground teeth.
        position[12] += flight * (compact ? x * .58 - base.elements[12] * .10 : x)
          + sweep * side * jaw * .36;
        position[13] += flight * y + sweep * jaw * .38;
        position[14] += flight * z + sweep * (.30 + side * jaw * .48);
        if (flight) {
          angles.set(flight * pitch + sweep * .24, flight * yaw + sweep * side * .42,
            flight * roll - sweep * jaw * .18);
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
