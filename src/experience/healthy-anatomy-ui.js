import './healthy-anatomy-ui.css';
import { anatomyLayers } from './story-anatomy.js';

const layers = {
  whole: { name: 'Celý zub', text: 'Korunka a dva korene zdravej dolnej stoličky.' },
  enamel: { name: 'Sklovina', text: 'Tvrdá ochranná vrstva korunky. Na okraji odkrytia vidno jej hrúbku.' },
  dentin: { name: 'Dentín', text: 'Krémová vrstva pod sklovinou tvorí väčšinu zuba a obklopuje dreň.' },
  pulp: { name: 'Dreň', text: 'Mäkké tkanivo s cievami a nervami v komore a koreňových kanálikoch.' },
};

export function createHealthyAnatomyUI({ stage, signal, chapterNumber, chapterCount, onSelect, onFollow }) {
  const doc = stage.ownerDocument;
  const anatomy = doc.createElement('section');
  anatomy.id = 'healthy-anatomy';
  anatomy.className = 'healthy-anatomy';
  anatomy.setAttribute('aria-labelledby', 'healthy-anatomy-title');
  anatomy.hidden = true;
  const count = [chapterNumber, chapterCount].map(value => String(value).padStart(2, '0')).join(' / ');
  anatomy.innerHTML = `
    <div class="healthy-anatomy-copy">
      <p class="healthy-anatomy-eyebrow">${count} <span aria-hidden="true">·</span> FDI 36 <span aria-hidden="true">·</span> Ilustračný model</p>
      <h2 id="healthy-anatomy-title">Stavba zdravého zuba.</h2>
      <p class="healthy-anatomy-description" aria-live="polite" aria-atomic="true"></p>
      <div class="healthy-anatomy-layers" role="group" aria-label="Vrstvy zuba"></div>
      <button type="button" class="healthy-anatomy-follow" hidden>Vrstvy podľa posunu</button>
    </div>`;
  stage.append(anatomy);

  const description = anatomy.querySelector('.healthy-anatomy-description');
  const name = doc.createElement('strong');
  const layerCopy = doc.createTextNode('');
  description.append(name, layerCopy);
  const layerGroup = anatomy.querySelector('.healthy-anatomy-layers');
  const follow = anatomy.querySelector('.healthy-anatomy-follow');
  const items = new Map();

  for (const id of anatomyLayers) {
    const control = doc.createElement('button');
    control.type = 'button';
    control.className = 'healthy-anatomy-layer';
    control.dataset.layer = id;
    control.textContent = layers[id].name;
    control.setAttribute('aria-pressed', 'false');
    control.addEventListener('click', () => onSelect(id), { signal });
    layerGroup.append(control);
    items.set(id, control);
  }
  follow.addEventListener('click', () => {
    onFollow();
    items.get(selected)?.focus({ preventScroll: true });
  }, { signal });

  let selected;
  return {
    update({ active, layer, manual }) {
      if (anatomy.hidden === active) {
        anatomy.hidden = !active;
        stage.toggleAttribute('data-healthy-anatomy', active);
      }
      if (!active) return;
      if (follow.hidden === manual) follow.hidden = !manual;
      if (selected === layer) return;
      selected = layer;
      name.textContent = layers[layer].name;
      layerCopy.data = ' ' + layers[layer].text;
      for (const [id, control] of items) control.setAttribute('aria-pressed', String(id === layer));
    },
    dispose() {
      stage.removeAttribute('data-healthy-anatomy');
      anatomy.remove();
    },
  };
}
