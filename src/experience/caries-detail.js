import './caries-detail.css';

// Accessible controls for the close-up. The illustration itself lives in the
// existing WebGL scene; this layer never covers the canvas or intercepts drags.
export function createCariesDetail({ stage, onRequest, onClose }) {
  const doc = stage.ownerDocument;
  const abort = new AbortController();
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
  info.innerHTML = '<p>Ilustračné baktérie v povlaku vytvárajú z cukrov kyseliny, ktoré poškodzujú sklovinu.</p><button type="button" class="cavity-detail-return">Späť k zubu ↗</button>';
  copy.append(info);
  const returnButton = info.querySelector('button');
  let busy = false, open = false, disposed = false;

  function request() {
    if (disposed || busy || open || button.hidden || button.disabled) return false;
    onRequest?.();
    return true;
  }
  function close() {
    if (!open) return;
    open = false;
    info.hidden = true;
    onClose?.();
    if (!button.hidden && !button.disabled) button.focus({ preventScroll: true });
  }
  button.addEventListener('click', request, { signal: abort.signal });
  returnButton.addEventListener('click', close, { signal: abort.signal });
  doc.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopImmediatePropagation(); close(); }
  }, { signal: abort.signal, capture: true });

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
      returnButton.focus({ preventScroll: true });
    },
    close,
    get isOpen() { return open; },
    dispose() { disposed = true; abort.abort(); info.remove(); button.remove(); },
  };
}
