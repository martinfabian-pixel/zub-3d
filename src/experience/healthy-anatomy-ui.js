import './healthy-anatomy-ui.css';

const layers = [
  { id: 'enamel', name: 'Sklovina', color: '#385d74', description: 'Tvrdá vonkajšia vrstva, ktorá chráni korunku.' },
  { id: 'dentin', name: 'Dentín', color: '#775635', description: 'Tvorí väčšinu zuba a obklopuje dreň.' },
  { id: 'pulp', name: 'Dreň', color: '#8b414d', description: 'Mäkké tkanivo s cievami a nervami v komore a koreňových kanálikoch.' },
  { id: 'cementum', name: 'Cement', color: '#5e5b4e', description: 'Pokrýva korene a podieľa sa na ukotvení zuba.' },
  { id: 'bone', name: 'Kosť', color: '#6c5138', description: 'Alveolárna kosť tvorí lôžko, v ktorom je zub ukotvený.' },
];

export function createHealthyAnatomyUI({ stage, signal, onToggle }) {
  const doc = stage.ownerDocument;
  const footer = stage.querySelector('.journey-footer');
  const anatomy = doc.createElement('section');
  anatomy.id = 'healthy-anatomy';
  anatomy.className = 'healthy-anatomy';
  anatomy.setAttribute('aria-labelledby', 'healthy-anatomy-title');
  anatomy.hidden = true;
  anatomy.innerHTML = `
    <div class="healthy-anatomy-copy">
      <p class="healthy-anatomy-eyebrow">04 / 07 <span aria-hidden="true">·</span> FDI 36 <span aria-hidden="true">·</span> Ilustračný model</p>
      <h2 id="healthy-anatomy-title">Stavba zdravého zuba.</h2>
      <p class="healthy-anatomy-description" aria-live="polite" aria-atomic="true">Rozložte zub a preskúmajte jeho jednotlivé vrstvy.</p>
    </div>
    <svg class="healthy-anatomy-leaders" aria-hidden="true" hidden></svg>
    <div id="healthy-anatomy-layers" class="healthy-anatomy-layers" role="group" aria-label="Vrstvy zuba a zubné lôžko" hidden></div>
    <div class="healthy-anatomy-actions">
      <button type="button" class="primary-button healthy-anatomy-toggle" aria-controls="healthy-anatomy-layers" aria-pressed="false">Rozložiť zub</button>
    </div>`;
  stage.append(anatomy);

  const copy = anatomy.querySelector('.healthy-anatomy-copy');
  const description = anatomy.querySelector('.healthy-anatomy-description');
  const layerGroup = anatomy.querySelector('.healthy-anatomy-layers');
  const leaders = anatomy.querySelector('.healthy-anatomy-leaders');
  const actions = anatomy.querySelector('.healthy-anatomy-actions');
  const toggle = anatomy.querySelector('.healthy-anatomy-toggle');
  toggle.addEventListener('click', onToggle, { signal });
  let selectedIndex = 0;

  const svg = 'http://www.w3.org/2000/svg';
  const items = layers.map(({ id, name, color }, index) => {
    const control = doc.createElement('button');
    control.type = 'button';
    control.className = 'healthy-anatomy-layer';
    control.dataset.layer = id;
    const number = doc.createElement('span');
    number.className = 'healthy-anatomy-index';
    number.textContent = String(index + 1).padStart(2, '0');
    number.setAttribute('aria-hidden', 'true');
    control.append(number, name);
    control.addEventListener('click', () => {
      selectedIndex = index;
      describeLayer();
    }, { signal });
    layerGroup.append(control);

    const line = doc.createElementNS(svg, 'line');
    const dot = doc.createElementNS(svg, 'circle');
    dot.setAttribute('r', '2');
    for (const element of [control, line, dot]) element.style.setProperty('--layer-color', color);
    leaders.append(line, dot);
    return { control, line, dot };
  });

  function describeLayer() {
    const selection = layers[selectedIndex];
    const name = doc.createElement('strong');
    name.textContent = selection.name;
    description.replaceChildren(name, ' ', selection.description);
    items.forEach(({ control, line, dot }, index) => {
      const selected = String(index === selectedIndex);
      control.setAttribute('aria-pressed', selected);
      line.dataset.selected = selected;
      dot.dataset.selected = selected;
    });
  }

  let expanded = false, labelsVisible = false, opacity = 0;
  return {
    setVisible(visible) {
      if (anatomy.hidden === !visible) return;
      anatomy.hidden = !visible;
      stage.toggleAttribute('data-healthy-anatomy', visible);
      if (!visible) selectedIndex = 0;
    },
    update(nextExpanded, showLabels, nextOpacity) {
      if (expanded !== nextExpanded) {
        expanded = nextExpanded;
        toggle.setAttribute('aria-pressed', String(expanded));
        toggle.textContent = expanded ? 'Zložiť zub' : 'Rozložiť zub';
      }
      if (labelsVisible !== showLabels) {
        labelsVisible = showLabels;
        leaders.toggleAttribute('hidden', !showLabels);
        layerGroup.hidden = !showLabels;
        if (showLabels) describeLayer();
        else description.textContent = 'Rozložte zub a preskúmajte jeho jednotlivé vrstvy.';
      }
      if (nextOpacity !== opacity) {
        opacity = nextOpacity;
        anatomy.style.opacity = String(opacity);
      }
    },
    gutters() {
      const top = stage.getBoundingClientRect().top;
      return { copyBottom: copy.getBoundingClientRect().bottom - top,
        actionsTop: actions.getBoundingClientRect().top - top,
        footerTop: footer.getBoundingClientRect().top - top };
    },
    positionLabels(points) {
      points.forEach(({ x, y, labelX }, index) => {
        const { control, line, dot } = items[index];
        control.style.left = `${labelX}px`;
        control.style.top = `${y}px`;
        line.setAttribute('x1', x);
        line.setAttribute('x2', labelX - 8);
        line.setAttribute('y1', y);
        line.setAttribute('y2', y);
        dot.setAttribute('cx', x);
        dot.setAttribute('cy', y);
      });
    },
    dispose() {
      stage.removeAttribute('data-healthy-anatomy');
      anatomy.remove();
    },
  };
}
