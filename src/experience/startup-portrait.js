import viewsUrl from './startup-molar-turn.webp';

// Sixteen photographs of the teaching molar, orbiting the same target by 20°.
const columns = 4;
const lastFrame = 15;
const anglePerFrame = (20 * Math.PI / 180) / lastFrame;
function cellPosition(frame) {
  return `${frame % columns * 100 / 3}% ${Math.floor(frame / columns) * 100 / 3}%`;
}

export function createPortraitTurn(still, reducedMotion) {
  let stopped = false, plate, animation;
  async function start() {
    if (!still?.animate || reducedMotion.matches || navigator.connection?.saveData) return;
    const image = new Image();
    image.fetchPriority = 'low';
    image.src = viewsUrl;
    try {
      await Promise.all([still.decode(), image.decode()]);
    } catch {
      return; // The first high-resolution portrait is always available.
    }
    if (stopped || reducedMotion.matches) return;
    plate = document.createElement('span');
    plate.className = 'startup-turn-window';
    plate.style.backgroundImage = `url("${image.src}")`;
    still.parentElement.append(plate);
    const frames = Array.from({length: lastFrame + 1}, (_, frame) => ({
      backgroundPosition: cellPosition(frame),
      '--portrait-frame': String(frame),
      easing: 'steps(1, end)',
    }));
    animation = plate.animate(frames, {
      duration: 1550, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out',
    });
    still.parentElement.classList.add('is-turning');
  }

  function freeze() {
    stopped = true;
    if (!animation || reducedMotion.matches) return 0;
    const frame = Number(getComputedStyle(plate).getPropertyValue('--portrait-frame'));
    plate.style.backgroundPosition = cellPosition(frame);
    plate.style.setProperty('--portrait-frame', String(frame));
    animation.cancel();
    animation = null;
    return frame * anglePerFrame;
  }

  function release() {
    stopped = true;
    animation?.cancel();
    animation = null;
    plate?.remove();
    plate = null;
    still?.parentElement.classList.remove('is-turning');
  }
  return {start, freeze, release};
}
