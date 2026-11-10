import './hero-anatomy-controls.css';

/** The optional anatomy control shares the stage but only the button takes
 * pointer events. Its text explicitly identifies the anatomy as schematic. */
export function createHeroAnatomyControls({ stage, onToggle }) {
  const doc = stage.ownerDocument;
  const copy = stage.querySelector('.journey-copy');
  if (!copy) throw new Error('The tooth anatomy control needs the journey copy layer.');

  const abort = new AbortController();
  // A purely decorative backdrop sits between the stage's normal gradient and
  // the existing transparent WebGL canvas. It never intercepts model gestures.
  const backdrop = doc.createElement('div');
  backdrop.className = 'hero-anatomy-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.style.opacity = '0';
  stage.prepend(backdrop);
  const container = doc.createElement('div');
  container.className = 'hero-anatomy-control';
  container.hidden = true;
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'hero-anatomy-toggle';
  button.textContent = 'Vnútro zuba';
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-describedby', 'hero-anatomy-note');
  const note = doc.createElement('p');
  note.id = 'hero-anatomy-note';
  note.className = 'hero-anatomy-note';
  note.textContent = 'Schematické zobrazenie; tvar kanálikov sa líši.';
  note.hidden = true;
  container.append(button, note);
  copy.append(container);
  let pressed = false, lastVisible, lastEnabled, lastBackdropOpacity;

  function setPressed(value) {
    pressed = Boolean(value);
    button.setAttribute('aria-pressed', String(pressed));
    note.hidden = !pressed;
  }
  button.addEventListener('click', () => {
    const next = !pressed;
    setPressed(next);
    onToggle?.(next);
  }, { signal: abort.signal });

  return {
    update({ chapterId, enabled = true, active = pressed, weight = active ? 1 : 0, archWeight = 0 }) {
      const visible = chapterId === 'hero';
      if (lastVisible !== visible) { container.hidden = !visible; lastVisible = visible; }
      if (lastEnabled !== enabled) { button.disabled = !enabled; lastEnabled = enabled; }
      if (Boolean(active) !== pressed) setPressed(active);
      // The renderer's same anatomy weight drives the backdrop: no separate
      // animation, timer, layout measurement, or transition can drift from it.
      const opacity = chapterId === 'hero' ? Math.max(0, Math.min(1, weight)) :
        chapterId === 'dentition' ? Math.max(0, Math.min(1, archWeight)) * .65 : 0;
      if (lastBackdropOpacity !== opacity) { backdrop.style.opacity = String(opacity); lastBackdropOpacity = opacity; }
    },
    setPressed,
    get pressed() { return pressed; },
    dispose() { abort.abort(); container.remove(); backdrop.remove(); },
  };
}
