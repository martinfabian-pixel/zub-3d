import './full-arch-anatomy-controls.css';

/** A separate, labelled illustration switch beside the existing final views. */
export function createFullArchAnatomyControls({ stage, onToggle, onSelect, onReturn }) {
  const doc = stage.ownerDocument, copy = stage.querySelector('.journey-copy');
  const abort = new AbortController();
  const container = doc.createElement('div');
  container.className = 'full-arch-anatomy-control';
  container.hidden = true;
  const button = doc.createElement('button');
  button.type = 'button'; button.className = 'full-arch-anatomy-toggle';
  button.textContent = 'Vnútro zubov';
  button.setAttribute('aria-pressed', 'false');
  const note = doc.createElement('p'); note.className = 'full-arch-anatomy-note';
  note.textContent = 'Ťuknite na zub · ilustračná schéma.';
  note.hidden = true;
  const select = doc.createElement('select');
  select.className = 'full-arch-focus-select';
  select.setAttribute('aria-label', 'Vybrať zub na priblíženie');
  const placeholder = doc.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Vybrať zub';
  select.append(placeholder);
  for (const fdi of [11,12,13,14,15,16,17,21,22,23,24,25,26,27,31,32,33,34,35,36,37,41,42,43,44,45,46,47]) {
    const option = doc.createElement('option'); option.value = String(fdi); option.textContent = `Zub ${fdi}`; select.append(option);
  }
  const back = doc.createElement('button'); back.type = 'button'; back.className = 'full-arch-focus-return';
  back.textContent = 'Späť na chrup'; back.hidden = true;
  const caption=doc.createElement('p');caption.className='full-arch-focus-caption';
  caption.textContent='Ilustračný izolovaný pohľad.';caption.hidden=true;
  container.append(button, note, select, back, caption); copy.append(container);
  let pressed = false, lastVisible, lastEnabled, lastNoteHidden, lastSelectHidden;
  let lastSelectedValue, lastFocusedHidden;
  button.addEventListener('click', () => onToggle?.(!pressed), { signal: abort.signal });
  select.addEventListener('change', () => { if (select.value) onSelect?.(Number(select.value)); }, { signal: abort.signal });
  back.addEventListener('click', () => onReturn?.(), { signal: abort.signal });
  return {
    update({ visible, enabled, active, focused = false, selectedFdi = null }) {
      if (lastVisible !== visible) { container.hidden = !visible; lastVisible = visible; }
      if (lastEnabled !== enabled) {
        button.disabled = !enabled;
        select.disabled = !enabled;
        lastEnabled = enabled;
      }
      if (pressed !== Boolean(active)) {
        pressed = Boolean(active);
        button.setAttribute('aria-pressed', String(pressed));
      }
      const noteHidden = !pressed || focused;
      if (lastNoteHidden !== noteHidden) { note.hidden = noteHidden; lastNoteHidden = noteHidden; }
      const selectHidden = !pressed;
      if (lastSelectHidden !== selectHidden) { select.hidden = selectHidden; lastSelectHidden = selectHidden; }
      const selectedValue = selectedFdi == null ? '' : String(selectedFdi);
      // A rejected selection (for example during the view transition) must
      // still be restored, even when the model's selected FDI did not change.
      if (lastSelectedValue !== selectedValue || select.value !== selectedValue) {
        select.value = selectedValue; lastSelectedValue = selectedValue;
      }
      const focusedHidden = !pressed || !focused;
      if (lastFocusedHidden !== focusedHidden) {
        back.hidden = focusedHidden;
        caption.hidden = focusedHidden;
        lastFocusedHidden = focusedHidden;
      }
    },
    dispose() { abort.abort(); container.remove(); },
  };
}
