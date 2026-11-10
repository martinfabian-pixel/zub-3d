import './full-arch-brushing-controls.css';

const captions = {
  upper: ['Vonkajšie plochy · horný rad', 'Štetinky nakloňte asi 45° k ďasnám a robte jemné krátke ťahy.'],
  lower: ['Vonkajšie plochy · dolný rad', 'Sklon kefky obráťte smerom k dolným ďasnám. Pokračujte krátkymi ťahmi.'],
  chewing: ['Žuvacie plochy', 'Štetinky priložte na žuvaciu plochu a kefkou pohybujte krátko tam a späť.'],
  inner: ['Vnútorné plochy predných zubov', 'Kefku držte zvislo a robte krátke ťahy hore a dole.'],
};

export function createFullArchBrushingControls({ stage, signal, onToggle, onNext }) {
  const doc = stage.ownerDocument;
  const container = doc.createElement('div');
  container.className = 'full-arch-brushing';
  container.hidden = true;
  container.innerHTML = `
    <div class="full-arch-brushing-copy" hidden>
      <h2>Čistenie chrupu.</h2>
      <div class="full-arch-brushing-caption" aria-live="polite">
        <strong></strong>
        <p></p>
      </div>
    </div>
    <div class="full-arch-brushing-actions">
      <button type="button" class="primary-button full-arch-brushing-toggle">Ukážka čistenia</button>
      <button type="button" class="outline-button full-arch-brushing-next" hidden>Ďalší záber</button>
    </div>
    <a class="full-arch-brushing-source" href="https://www.mouthhealthy.org/all-topics-a-z/brushing-your-teeth" target="_blank" rel="noopener" hidden>Technika podľa ADA ↗</a>`;
  stage.querySelector('.journey-copy').append(container);
  const copy = container.querySelector('.full-arch-brushing-copy');
  const label = copy.querySelector('strong');
  const caption = copy.querySelector('p');
  const toggle = container.querySelector('.full-arch-brushing-toggle');
  const next = container.querySelector('.full-arch-brushing-next');
  const source = container.querySelector('.full-arch-brushing-source');
  toggle.addEventListener('click', onToggle, { signal });
  next.addEventListener('click', onNext, { signal });
  let active = false;
  let phase;
  let done = false;

  return {
    update({ visible, demo }) {
      const running = Boolean(demo);
      container.hidden = !visible && !running;
      if (running !== active) {
        active = running;
        stage.toggleAttribute('data-full-brushing', active);
        copy.hidden = next.hidden = source.hidden = !active;
        toggle.textContent = active ? 'Ukončiť ukážku' : 'Ukážka čistenia';
      }
      if (!running) return;
      if (phase !== demo.phase) {
        phase = demo.phase;
        [label.textContent, caption.textContent] = captions[phase] ?? captions.upper;
      }
      const canReplay = demo.done || demo.phase === 'inner';
      if (done !== canReplay) {
        done = canReplay;
        next.textContent = done ? 'Zopakovať' : 'Ďalší záber';
      }
    },
    dispose() {
      stage.removeAttribute('data-full-brushing');
      container.remove();
    },
  };
}
