import './tooth-function-controls.css';

const descriptions = {
  21: ['Rezák odhryzuje.', '21 · Horný ľavý stredný rezák'],
  36: ['Stolička drví.', '36 · Dolná ľavá prvá stolička'],
};

function phaseAt(fdi, progress) {
  if (progress < .18) return 'Pripravené sústo';
  if (progress < .44) return 'Približovanie';
  if (progress < .68) return fdi === 21 ? 'Rezné hrany' : 'Stláčanie';
  if (progress < .82) return fdi === 21 ? 'Oddelenie sústa' : 'Bočný pohyb';
  return 'Uvoľnenie';
}

/** One native range is the only source of manual animation progress.
 * The caller owns playback and geometry; these controls never advance time.
 */
export function createToothFunctionControls({ stage, signal, onScrub, onTogglePlay, onReturn }) {
  const doc = stage.ownerDocument;
  const abort = new AbortController();
  signal?.addEventListener('abort', () => abort.abort(), { once: true });
  const events = { signal: abort.signal };
  const container = doc.createElement('section');
  container.className = 'tooth-function';
  container.setAttribute('aria-labelledby', 'tooth-function-title');
  container.hidden = true;
  container.innerHTML = `
    <div class="tooth-function-heading" data-annotation-obstacle>
      <p class="tooth-function-kicker">Ukázať v pohybe</p>
      <h2 id="tooth-function-title"></h2>
      <p class="tooth-function-tooth"></p>
      <button type="button" class="outline-button tooth-function-return">Späť na zub</button>
    </div>
    <div class="tooth-function-panel" data-annotation-obstacle>
      <div class="tooth-function-playback">
        <button type="button" class="primary-button tooth-function-play" aria-controls="journey-canvas">Pozastaviť</button>
        <span class="tooth-function-phase"></span>
      </div>
      <label class="sr-only" for="tooth-function-progress">Priebeh pohybu čeľuste a sústa</label>
      <input id="tooth-function-progress" type="range" min="0" max="1000" step="1" value="0"
        aria-describedby="tooth-function-hint" aria-controls="journey-canvas">
      <div class="tooth-function-range-labels" aria-hidden="true"><span>Začiatok</span><span class="tooth-function-percent">0 %</span><span>Koniec</span></div>
      <p id="tooth-function-hint">Posuňte tam aj späť. Model môžete otočiť a priblížiť.</p>
    </div>
    <p class="sr-only tooth-function-status" role="status" aria-live="polite" aria-atomic="true"></p>`;
  stage.append(container);

  const heading = container.querySelector('h2');
  const tooth = container.querySelector('.tooth-function-tooth');
  const back = container.querySelector('.tooth-function-return');
  const play = container.querySelector('.tooth-function-play');
  const slider = container.querySelector('input');
  const phase = container.querySelector('.tooth-function-phase');
  const percent = container.querySelector('.tooth-function-percent');
  const status = container.querySelector('.tooth-function-status');
  let active = false, previousFdi, previousPlaying, previousEntering, previousPercent, previousPhase, previousDone;
  let returnTarget = null;

  slider.addEventListener('input', () => onScrub?.(slider.valueAsNumber / 1000), events);
  // A touch on the thumb pauses immediately, including a touch with no change.
  slider.addEventListener('pointerdown', () => onScrub?.(slider.valueAsNumber / 1000), events);
  play.addEventListener('click', () => onTogglePlay?.(), events);
  back.addEventListener('click', () => onReturn?.(), events);
  container.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onReturn?.();
    }
    // Keep native range arrows/Home/End separate from story navigation.
    event.stopPropagation();
  }, events);
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'click']) {
    container.addEventListener(type, event => event.stopPropagation(), events);
  }

  return {
    update({ active: shown, fdi, progress = 0, playing = false, entering = false, phase: phaseLabel }) {
      if (shown !== active) {
        active = shown;
        container.hidden = !active;
        if (active) {
          returnTarget = doc.activeElement?.matches('.full-arch-focus-motion')
            ? doc.activeElement : stage.querySelector('.full-arch-focus-motion');
          stage.dataset.toothMotion = String(fdi);
          back.focus({ preventScroll: true });
        } else {
          delete stage.dataset.toothMotion;
          if (returnTarget?.isConnected && !returnTarget.hidden && !returnTarget.disabled) returnTarget.focus({ preventScroll: true });
          status.textContent = '';
          previousFdi = previousPlaying = previousEntering = previousPhase = previousPercent = previousDone = undefined;
        }
      }
      if (!active) return;
      if (fdi !== previousFdi) {
        [heading.textContent, tooth.textContent] = descriptions[fdi] ?? descriptions[21];
        stage.dataset.toothMotion = String(fdi);
        previousFdi = fdi;
      }
      const amount = Math.max(0, Math.min(1, progress));
      const rounded = Math.round(amount * 100);
      const phaseText = entering ? 'Pripravujem pohľad' : phaseLabel ?? phaseAt(fdi, amount);
      const sliderValue = Math.round(amount * 1000);
      if (slider.valueAsNumber !== sliderValue) slider.valueAsNumber = sliderValue;
      if (rounded !== previousPercent || phaseText !== previousPhase) {
        percent.textContent = `${rounded} %`;
        phase.textContent = phaseText;
        slider.setAttribute('aria-valuetext', `${rounded} percent — ${phaseText}`);
        slider.style.setProperty('--motion-progress', `${amount * 100}%`);
        previousPercent = rounded;
        previousPhase = phaseText;
      }
      if (playing !== previousPlaying || entering !== previousEntering || (amount === 1) !== previousDone) {
        play.textContent = playing ? 'Pozastaviť' : amount === 1 ? 'Prehrať znova' : 'Prehrať';
        play.setAttribute('aria-label', playing ? 'Pozastaviť ukážku' : amount === 1 ? 'Prehrať ukážku znova' : 'Prehrať ukážku');
        slider.disabled = play.disabled = entering;
        status.textContent = entering ? 'Pripravujem ukážku pohybu.' : playing ? 'Ukážka sa prehráva.' : 'Pohyb je zastavený. Posuvníkom sa môžete vrátiť k rovnakému okamihu.';
        previousPlaying = playing;
        previousEntering = entering;
        previousDone = amount === 1;
      }
    },
    dispose() {
      abort.abort();
      container.remove();
      delete stage.dataset.toothMotion;
    },
  };
}
