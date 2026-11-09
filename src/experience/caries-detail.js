import './caries-detail.css';

// This explanatory view is a separate, accessible DOM overlay. The 3D scene
// and its camera remain owned by the presentation while it is open.
export function createCariesDetail({ stage, onRequest, onClose }) {
  const doc = stage.ownerDocument;
  const abort = new AbortController();
  const { signal } = abort;
  const copy = stage.querySelector('.journey-copy');
  if (!copy) throw new Error('The cavity detail needs the journey copy layer.');

  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'cavity-detail-trigger';
  button.textContent = 'Pozrieť sa na kaz bližšie ↗';
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-controls', 'cavity-detail-dialog');
  button.hidden = true;
  copy.append(button);

  const dialog = doc.createElement('dialog');
  dialog.id = 'cavity-detail-dialog';
  dialog.className = 'cavity-detail';
  dialog.setAttribute('aria-labelledby', 'cavity-detail-title');
  dialog.setAttribute('aria-describedby', 'cavity-detail-description');
  dialog.innerHTML = `
    <div class="cavity-detail-header">
      <span class="cavity-detail-eyebrow">ČO SA DEJE V POVLAKU</span>
      <button class="cavity-detail-close" type="button" aria-label="Zavrieť detail kazu">×</button>
    </div>
    <h2 id="cavity-detail-title">Ako vzniká kaz?</h2>
    <p id="cavity-detail-description">Baktérie v povlaku premieňajú cukry na kyseliny. Tie môžu postupne poškodzovať sklovinu.</p>
    <div class="cavity-detail-art">
      <svg viewBox="0 0 640 340" role="img" aria-label="Ilustrácia baktérií v povlaku, kyselín a poškodzovania skloviny">
        <defs>
          <linearGradient id="cavity-tooth-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#dce8e9"/>
          </linearGradient>
          <linearGradient id="cavity-pit-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#b58c77"/><stop offset="1" stop-color="#775342"/>
          </linearGradient>
          <g id="cavity-germ">
            <g stroke="currentColor" stroke-width="5" stroke-linecap="round" opacity=".75">
              <path d="M0 -27v-9M0 27v9M-27 0h-9M27 0h9M-19 -19l-7 -7M19 -19l7 -7M-19 19l-7 7M19 19l7 7"/>
            </g>
            <circle r="27" fill="currentColor"/>
            <circle cx="-9" cy="-4" r="3" fill="#fff"/><circle cx="9" cy="-4" r="3" fill="#fff"/>
            <path d="M-8 8q8 8 16 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
          </g>
        </defs>
        <ellipse cx="320" cy="327" rx="185" ry="10" fill="#7ca9bc" opacity=".13"/>
        <path d="M162 191c9-32 34-48 67-47 37 1 50 13 72 16 21 3 36-15 66-17 35-3 64 16 73 47 11 38-2 76-19 106-9 16-24 28-40 26-28-2-38-34-61-34s-33 32-61 34c-17 2-31-10-40-26-18-30-65-67-57-105Z" fill="url(#cavity-tooth-gradient)" stroke="#d2e3e9" stroke-width="3"/>
        <path d="M165 192c14-30 37-41 65-39 38 1 51 15 72 17 22 3 37-16 65-17 31-2 53 10 70 39" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".8"/>
        <g class="cavity-pit">
          <path d="M290 169c10 3 13 15 26 18 14 3 19-11 30-14 7 12 1 25-9 31-12 8-31 7-43-2-9-8-10-19-4-33Z" fill="url(#cavity-pit-gradient)" opacity=".86"/>
          <path d="M294 174c11 5 14 14 25 15 11 1 17-9 24-11" fill="none" stroke="#dac0aa" stroke-width="4" stroke-linecap="round"/>
        </g>
        <g class="cavity-germ cavity-germ-a" transform="translate(223 102) scale(.90)" color="#609f90"><use href="#cavity-germ"/></g>
        <g class="cavity-germ cavity-germ-b" transform="translate(320 69) scale(1.05)" color="#896ab1"><use href="#cavity-germ"/></g>
        <g class="cavity-germ cavity-germ-c" transform="translate(420 105) scale(.78)" color="#d29a76"><use href="#cavity-germ"/></g>
        <g class="cavity-acid" fill="#e3b96c">
          <path d="M289 121c-5 9-7 12-7 17a7 7 0 0 0 14 0c0-5-2-8-7-17Z"/>
          <path d="M351 124c-5 9-7 12-7 17a7 7 0 0 0 14 0c0-5-2-8-7-17Z"/>
        </g>
        <text x="320" y="24" text-anchor="middle" fill="#607e8f" font-size="15" font-weight="600" font-family="inherit">Baktérie v povlaku</text>
        <text x="320" y="142" text-anchor="middle" fill="#967546" font-size="14" font-weight="600" font-family="inherit">kyseliny</text>
      </svg>
    </div>
    <p class="cavity-detail-note">Ilustrácia vývoja v čase. Vzniknutú dutinu kefka neopraví – vyžaduje ošetrenie.</p>
    <button class="cavity-detail-return" type="button">Späť k zubu <span aria-hidden="true">↗</span></button>
  `;
  doc.body.append(dialog);
  const closeButton = dialog.querySelector('.cavity-detail-close');
  const returnButton = dialog.querySelector('.cavity-detail-return');
  let busy = false;
  let disposed = false;

  function request() {
    if (disposed || busy || dialog.open || button.hidden || button.disabled) return false;
    onRequest?.();
    return true;
  }
  button.addEventListener('click', request, { signal });
  closeButton.addEventListener('click', () => dialog.close(), { signal });
  returnButton.addEventListener('click', () => dialog.close(), { signal });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  }, { signal });
  dialog.addEventListener('close', () => {
    onClose?.();
    if (!button.hidden && !button.disabled) button.focus({ preventScroll: true });
  }, { signal });

  return {
    update({ chapterId, lesionProgress, enabled = true }) {
      const visible = chapterId === 'caries' && lesionProgress > .5;
      if (button.hidden === visible) button.hidden = !visible;
      button.disabled = busy || !enabled;
    },
    request,
    setBusy(value) { busy = Boolean(value); button.disabled = busy; },
    show() {
      if (disposed || dialog.open) return;
      busy = false;
      button.disabled = false;
      dialog.showModal();
      closeButton.focus({ preventScroll: true });
    },
    close() { if (dialog.open) dialog.close(); },
    get isOpen() { return dialog.open; },
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      if (dialog.open) dialog.close();
      dialog.remove();
      button.remove();
    },
  };
}
