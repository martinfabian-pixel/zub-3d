import { MathUtils, Vector3 } from 'three';

/** An edge feather for the frontal dental photograph. It is a presentation
 * mask on the canvas; the complete jaw is still rendered, lit and available
 * for inspection. The central crown band stays fully opaque. The other
 * chapters and the anatomical view use the ordinary unmasked canvas.
 */
export function createSmileFraming({ canvas, config }) {
  const { arrival, featherFraction, releaseMs } = config.smileFraming;
  const original = canvas.style.maskImage;
  const point = new Vector3();
  const incisors = [11, 21, 31, 41];
  let from = 1, to = 1, started = -Infinity, currentMask = original, disposed = false;

  function write(mask) {
    if (mask === currentMask) return;
    canvas.style.maskImage = mask;
    currentMask = mask;
  }

  // Project the source's entire cervical ring of each central incisor.
  // Use the outer edges of both rows to keep even the most curved cervical
  // portions of the central crowns inside the clear part of the photograph.
  function opaqueBand(arch, camera) {
    let top = Infinity, bottom = -Infinity;
    for (const fdi of incisors) {
      const item = arch?.teeth.get(fdi);
      if (!item?.mesh) return null;
      for (const local of item.entry.cervicalRing) {
        point.fromArray(local);
        if (item.entry.reflected) point.x = -point.x; // Runtime mirror is baked in geometry.
        point.applyMatrix4(item.mesh.matrixWorld).project(camera);
        const y = 0.5 - 0.5 * point.y;
        if (fdi < 30) top = Math.min(top, y);
        else bottom = Math.max(bottom, y);
      }
    }
    return Number.isFinite(top) && Number.isFinite(bottom) && bottom > top ? [top, bottom] : null;
  }

  function transition(now) {
    const t = MathUtils.smoothstep((now - started) / releaseMs, 0, 1);
    return MathUtils.lerp(from, to, t);
  }

  function update({ progress, finalView, free, modified, camera, arch, now = performance.now(), reducedMotion = false }) {
    if (disposed) return false;
    const enabled = finalView === 'smile' && !free && !modified ? 1 : 0;
    if (enabled !== to) {
      from = transition(now);
      to = enabled;
      started = now;
    }
    if (reducedMotion) { from = to; started = -Infinity; }
    const arrivalWeight = MathUtils.smoothstep(progress, arrival[0], arrival[1]);
    const strength = arrivalWeight * transition(now);
    const moving = arrivalWeight > 0 && now - started < releaseMs;
    if (strength < 0.0001 || !camera) { write(original); return moving; }
    const band = opaqueBand(arch, camera);
    if (!band) { write(original); return moving; }
    const [top, bottom] = band, feather = (bottom - top) * featherFraction;
    const percent = value => (100 * value).toFixed(2) + '%';
    const stop = (opacity, at) => 'rgba(0,0,0,' + (1 - strength * (1 - opacity)).toFixed(3) + ') ' + percent(at);
    const mask = 'linear-gradient(to bottom,' + [
      stop(0, top - feather), stop(0.07, top - 0.77 * feather),
      stop(0.50, top - 0.50 * feather), stop(0.93, top - 0.23 * feather),
      '#000 ' + percent(top), '#000 ' + percent(bottom),
      stop(0.93, bottom + 0.23 * feather), stop(0.50, bottom + 0.50 * feather),
      stop(0.07, bottom + 0.77 * feather), stop(0, bottom + feather),
    ].join(',') + ')';
    write(mask);
    return moving;
  }

  return { update, dispose() { if (!disposed) write(original); disposed = true; } };
}
