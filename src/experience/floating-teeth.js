import { MathUtils, Matrix4, Euler } from 'three';

// Absolute, reversible choreography. All offsets vanish at both ends.
const smooth = (a, b, value) => MathUtils.smoothstep(value, a, b);
export function floatingAmount(progress) {
  return smooth(.80, .84, progress) * (1 - smooth(.88, .975, progress));
}

export function createFloatingTeeth(teeth) {
  const rotation = new Matrix4();
  const angles = new Euler();
  const records = [];
  for (const [fdi, item] of teeth) {
    const side = fdi % 20 < 10 ? -1 : 1;
    const ordinal = fdi % 10;
    const seed = Math.sin(fdi * 91.37) * 43758.5453;
    const phase = seed - Math.floor(seed);
    records.push({ item, side, ordinal, phase, base: item.mesh.matrix.clone() });
  }
  let wasActive = false;
  return {
    update(progress, closure) {
      const amount = floatingAmount(progress);
      if (!amount && !wasActive) return amount;
      for (const { item, side, ordinal, phase, base } of records) {
        const mesh = item.mesh;
        mesh.matrix.copy(base);
        if (item.upper) mesh.matrix.elements[13] -= closure;
        const stagger = .82 + phase * .18;
        const motion = amount * stagger;
        mesh.matrix.elements[12] += side * motion * (.35 + ordinal * .12);
        mesh.matrix.elements[13] += motion * ((item.upper ? .55 : -.55) + (phase - .5) * .6);
        mesh.matrix.elements[14] += motion * (phase - .45) * 2;
        angles.set((item.upper ? Math.PI : (phase - .5) * .8) * motion,
          side * motion * .32, (phase - .5) * motion * .6);
        rotation.makeRotationFromEuler(angles);
        mesh.matrix.multiply(rotation);
        mesh.updateMatrixWorld(true);
      }
      wasActive = amount > 0;
      return amount;
    },
  };
}
