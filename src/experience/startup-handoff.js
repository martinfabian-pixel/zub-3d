import { Matrix4, Vector3 } from 'three';

const spriteSize = 128;
// Alpha bounds of the first frame in startup-tooth.webp. This is the same
// FDI 36 view as the authored opening shot, rendered on a transparent cell.
const spriteTooth = { centerX: 60, centerY: 55.5, height: 103 };
const frames = 30;
const swapDuration = 130;
const growDuration = 680;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = value => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

export function createStartupHandoff({ stage, canvas }) {
  const body = stage.ownerDocument.body;
  const tooth = stage.querySelector('.startup-tooth');
  const reducedMotion = stage.ownerDocument.defaultView.matchMedia('(prefers-reduced-motion: reduce)');
  const projection = new Matrix4();
  const vertex = new Vector3();
  let sequence, needsFit = false;

  function fit(mesh, camera) {
    const position = mesh.geometry?.getAttribute('position');
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!position || !width || !height) return null;
    const stageRect = stage.getBoundingClientRect();
    const spriteRect = tooth.getBoundingClientRect();
    if (!spriteRect.height) return null;
    mesh.updateWorldMatrix(true, false);
    camera.updateMatrixWorld();
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(mesh.matrixWorld);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(projection);
      minX = Math.min(minX, vertex.x); maxX = Math.max(maxX, vertex.x);
      minY = Math.min(minY, vertex.y); maxY = Math.max(maxY, vertex.y);
    }
    const modelHeight = (maxY - minY) * height * .5;
    if (!(modelHeight > 0) || !Number.isFinite(modelHeight)) return null;
    const scale = spriteRect.height * spriteTooth.height / spriteSize / modelHeight;
    const modelX = (1 + (minX + maxX) * .5) * width * .5;
    const modelY = (1 - (minY + maxY) * .5) * height * .5;
    const spriteX = spriteRect.left - stageRect.left + spriteRect.width * spriteTooth.centerX / spriteSize;
    const spriteY = spriteRect.top - stageRect.top + spriteRect.height * spriteTooth.centerY / spriteSize;
    return { scale, x: spriteX - scale * modelX, y: spriteY - scale * modelY };
  }

  function finish() {
    sequence = undefined;
    needsFit = false;
    body.removeAttribute('data-journey-loading');
    body.removeAttribute('data-journey-handoff');
    tooth?.style.removeProperty('--startup-frame');
    for (const name of ['--startup-canvas-transform', '--startup-sprite-opacity', '--startup-ui-opacity']) {
      stage.style.removeProperty(name);
    }
  }

  function start(now, mesh, camera, skip = false) {
    if (!body.hasAttribute('data-journey-loading') || sequence) return;
    if (skip || reducedMotion.matches || !tooth || !mesh || !camera) return finish();
    const fitAtStart = fit(mesh, camera);
    if (!fitAtStart) return finish();
    const style = getComputedStyle(tooth);
    const position = clamp(parseFloat(style.backgroundPositionX) / 100 || 0, 0, 1);
    const frame = Math.round(position * frames) / frames;
    const turn = tooth.getAnimations?.().reverse().map(animation => animation.effect?.getComputedTiming())
      .find(timing => timing?.progress != null);
    const remaining = 1 - frame;
    const turnDuration = remaining <= 1 / frames ? 0 : clamp(2 * remaining * (turn?.duration || 780), 90, 365);
    tooth.style.setProperty('--startup-frame', `${frame * 100}%`);
    body.dataset.journeyHandoff = 'align';
    sequence = { now, mesh, camera, frame, turnDuration, fit: fitAtStart };
  }

  function update(now) {
    if (!sequence) return false;
    if (reducedMotion.matches) { finish(); return false; }
    const elapsed = Math.max(0, now - sequence.now);
    const { turnDuration, frame } = sequence;
    if (elapsed < turnDuration) {
      const t = elapsed / turnDuration;
      const phase = frame + (1 - frame) * (1 - (1 - t) ** 2);
      tooth.style.setProperty('--startup-frame', `${Math.floor(phase * frames + 1e-6) / frames * 100}%`);
      return true;
    }
    const swapTime = elapsed - turnDuration;
    const growTime = swapTime - swapDuration;
    if (growTime >= growDuration) { finish(); return false; }
    if (body.dataset.journeyHandoff !== 'grow') {
      tooth.style.setProperty('--startup-frame', '0%');
      body.dataset.journeyHandoff = 'grow';
    }
    if (needsFit) {
      needsFit = false;
      const resized = fit(sequence.mesh, sequence.camera);
      if (resized) sequence.fit = resized;
    }
    const progress = smooth(growTime / growDuration);
    const remaining = 1 - progress;
    const { x, y, scale } = sequence.fit;
    stage.style.setProperty('--startup-canvas-transform',
      `translate(${x * remaining}px, ${y * remaining}px) scale(${scale + (1 - scale) * progress})`);
    stage.style.setProperty('--startup-sprite-opacity', String(1 - smooth(swapTime / swapDuration)));
    stage.style.setProperty('--startup-ui-opacity', String(smooth((growTime - 110) / 475)));
    return true;
  }

  return {
    start, update, finish,
    resize() { needsFit = Boolean(sequence); },
    get active() { return body.hasAttribute('data-journey-loading'); },
  };
}
