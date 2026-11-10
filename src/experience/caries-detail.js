import './caries-detail.css';

const layers = [
  { id: 'enamel', name: 'Sklovina', description: 'Ochranná vonkajšia vrstva korunky.' },
  { id: 'dentin', name: 'Dentín', description: 'Tkanivo pod sklovinou, ktoré obklopuje dreň.' },
  { id: 'pulp', name: 'Dreň', description: 'Mäkké tkanivo s cievami a nervami.' },
];

// Accessible controls for the close-up. The illustration itself lives in the
// existing WebGL scene; this layer never covers the canvas or intercepts drags.
export function createCariesDetail({ stage, onRequest, onClose, onAnatomyChange }) {
  const doc = stage.ownerDocument;
  const abort = new AbortController();
  const listen = { signal: abort.signal };
  const copy = stage.querySelector('.journey-copy');
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'cavity-detail-trigger';
  button.textContent = 'Pozrieť sa na kaz bližšie ↗';
  button.hidden = true;
  copy.append(button);

  const info = doc.createElement('div');
  info.className = 'cavity-detail-info';
  info.hidden = true;
  info.innerHTML = `
    <p>Baktérie v povlaku vytvárajú z cukrov kyseliny, ktoré poškodzujú sklovinu.</p>
    <div class="cavity-detail-actions">
      <button type="button" class="cavity-anatomy-trigger" aria-controls="cavity-anatomy">Pozrieť pod povrch <span aria-hidden="true">↗</span></button>
      <button type="button" class="cavity-detail-return">Späť k zubu</button>
    </div>`;
  copy.append(info);
  const anatomyButton = info.querySelector('.cavity-anatomy-trigger');
  const detailActions = info.querySelector('.cavity-detail-actions');
  const returnButton = info.querySelector('.cavity-detail-return');

  const anatomy = doc.createElement('section');
  anatomy.id = 'cavity-anatomy';
  anatomy.className = 'cavity-anatomy';
  anatomy.setAttribute('aria-labelledby', 'cavity-anatomy-title');
  anatomy.setAttribute('data-annotation-obstacle', '');
  anatomy.hidden = true;
  anatomy.innerHTML = `
    <p class="cavity-anatomy-eyebrow">Stavba zdravého zuba · ilustračný model</p>
    <div class="cavity-anatomy-copy" aria-live="polite" aria-atomic="true">
      <h2 id="cavity-anatomy-title"></h2>
      <p class="cavity-anatomy-description"></p>
    </div>
    <div class="cavity-anatomy-layers" role="group" aria-label="Vrstvy zuba"></div>
    <div class="cavity-anatomy-actions"></div>`;
  stage.append(anatomy);

  const title = anatomy.querySelector('h2');
  const description = anatomy.querySelector('.cavity-anatomy-description');
  const layerGroup = anatomy.querySelector('.cavity-anatomy-layers');
  const anatomyActions = anatomy.querySelector('.cavity-anatomy-actions');
  let layerIndex = 0;
  let busy = false, open = false, disposed = false;

  const layerButtons = layers.map(({ name }, index) => {
    const control = doc.createElement('button');
    control.type = 'button';
    control.className = 'cavity-anatomy-layer';
    control.textContent = name;
    control.setAttribute('aria-pressed', 'false');
    control.addEventListener('click', () => {
      layerIndex = index;
      updateAnatomy();
    }, listen);
    layerGroup.append(control);
    return control;
  });

  function updateAnatomy() {
    const selection = layers[layerIndex];
    title.textContent = selection.name;
    description.textContent = selection.description;
    layerButtons.forEach((control, index) => control.setAttribute('aria-pressed', String(index === layerIndex)));
    onAnatomyChange?.(selection.id);
  }

  function openAnatomy() {
    if (!open || !anatomy.hidden) return;
    layerIndex = 0;
    anatomyActions.append(returnButton);
    info.hidden = true;
    anatomy.hidden = false;
    stage.dataset.cavityAnatomy = 'open';
    updateAnatomy();
    layerButtons[0].focus({ preventScroll: true });
  }

  function request() {
    if (disposed || busy || open || button.hidden || button.disabled) return false;
    onRequest?.();
    return true;
  }
  function close() {
    if (!open) return;
    open = false;
    info.hidden = true;
    if (!anatomy.hidden) {
      anatomy.hidden = true;
      delete stage.dataset.cavityAnatomy;
      detailActions.append(returnButton);
    }
    onClose?.();
    if (!button.hidden && !button.disabled) button.focus({ preventScroll: true });
  }
  button.addEventListener('click', request, listen);
  anatomyButton.addEventListener('click', openAnatomy, listen);
  returnButton.addEventListener('click', close, listen);
  doc.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open && !doc.querySelector('dialog[open]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    }
  }, { ...listen, capture: true });

  return {
    update({ chapterId, lesionProgress, enabled = true }) {
      button.hidden = chapterId !== 'caries' || lesionProgress <= .5 || open;
      button.disabled = busy || !enabled;
    },
    request,
    setBusy(value) { busy = Boolean(value); button.disabled = busy; },
    show() {
      if (disposed || open) return;
      busy = false; open = true;
      button.hidden = true;
      info.hidden = false;
      anatomyButton.focus({ preventScroll: true });
    },
    close,
    focusTrigger() { if (!button.hidden && !button.disabled) button.focus({ preventScroll: true }); },
    get isOpen() { return open; },
    get isAnatomyOpen() { return !anatomy.hidden; },
    dispose() {
      disposed = true;
      abort.abort();
      delete stage.dataset.cavityAnatomy;
      anatomy.remove();
      info.remove();
      button.remove();
    },
  };
}
