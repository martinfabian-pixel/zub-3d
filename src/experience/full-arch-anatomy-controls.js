import './full-arch-anatomy-controls.css';
import { adjacentAtlasTooth, DENTAL_ATLAS_GROUPS, DENTAL_ATLAS_TEETH } from './dental-atlas-data.js';

export function createFullArchAnatomyControls({ stage, onToggle, onSelect, onReturn, onContinue, onDetailChange }) {
  const doc = stage.ownerDocument;
  const copy = stage.querySelector('.journey-copy');
  const abort = new AbortController();
  const { signal } = abort;
  const container = doc.createElement('section');
  container.className = 'full-arch-anatomy-control';
  container.setAttribute('aria-label', 'Atlas chrupu');
  container.hidden = true;
  container.innerHTML = `
    <p class="full-arch-anatomy-note">Vyberte zub v modeli alebo podľa čísla FDI.</p>
    <div class="full-arch-focus-detail" hidden>
      <p class="full-arch-focus-kicker"><span class="full-arch-focus-source">Atlas chrupu</span><span class="full-arch-focus-caption" hidden>Ilustračné vnútro</span><span class="full-arch-focus-type"></span></p>
      <h2 class="full-arch-focus-title"></h2>
      <p class="full-arch-focus-location"></p>
      <div class="full-arch-focus-topics" role="tablist" aria-label="Informácie o zube">
        <button type="button" role="tab" id="atlas-topic-function" aria-controls="atlas-function" aria-selected="true">Funkcia</button>
        <button type="button" role="tab" id="atlas-topic-landmark" aria-controls="atlas-landmark" aria-selected="false" tabindex="-1">Tvar</button>
        <button type="button" role="tab" id="atlas-topic-fact" aria-controls="atlas-fact" aria-selected="false" tabindex="-1">Zaujímavosť</button>
      </div>
      <div class="full-arch-focus-reading">
        <p class="full-arch-focus-function" id="atlas-function" role="tabpanel" aria-labelledby="atlas-topic-function" tabindex="0"></p>
        <p class="full-arch-focus-landmark" id="atlas-landmark" role="tabpanel" aria-labelledby="atlas-topic-landmark" aria-hidden="true" tabindex="-1"></p>
        <p class="full-arch-focus-fact" id="atlas-fact" role="tabpanel" aria-labelledby="atlas-topic-fact" aria-hidden="true" tabindex="-1"></p>
      </div>
    </div>
    <div class="full-arch-focus-actions">
      <select class="full-arch-focus-select" aria-label="Vybrať zub podľa čísla FDI">
        <option value="" disabled>Vybrať zub</option>
      </select>
      <button type="button" class="primary-button full-arch-anatomy-toggle" aria-pressed="false" hidden>Zobraziť vnútro</button>
      <button type="button" class="outline-button full-arch-focus-return" hidden>Späť k chrupu</button>
    </div>
    <div class="full-arch-focus-nav" hidden>
      <div class="full-arch-focus-steps" role="group" aria-label="Prepínanie zubov">
        <button type="button" class="full-arch-focus-previous"><span aria-hidden="true">‹</span> Predchádzajúci</button>
        <button type="button" class="full-arch-focus-next">Ďalší <span aria-hidden="true">›</span></button>
      </div>
      <button type="button" class="text-button full-arch-focus-continue">Pokračovať v príbehu</button>
    </div>
    <p class="sr-only full-arch-focus-live" role="status"></p>`;

  const detail = container.querySelector('.full-arch-focus-detail');
  const type = container.querySelector('.full-arch-focus-type');
  const title = container.querySelector('.full-arch-focus-title');
  const location = container.querySelector('.full-arch-focus-location');
  const tabs = [...container.querySelectorAll('[role="tab"]')];
  const [purpose, landmark, fact] = container.querySelectorAll('[role="tabpanel"]');
  const note = container.querySelector('.full-arch-anatomy-note');
  const select = container.querySelector('.full-arch-focus-select');
  const button = container.querySelector('.full-arch-anatomy-toggle');
  const back = container.querySelector('.full-arch-focus-return');
  const navigation = container.querySelector('.full-arch-focus-nav');
  const previous = container.querySelector('.full-arch-focus-previous');
  const next = container.querySelector('.full-arch-focus-next');
  const continueButton = container.querySelector('.full-arch-focus-continue');
  const caption = container.querySelector('.full-arch-focus-caption');
  const source = container.querySelector('.full-arch-focus-source');
  const announcement = container.querySelector('.full-arch-focus-live');
  for (const { label, teeth } of DENTAL_ATLAS_GROUPS) {
    const group = doc.createElement('optgroup');
    group.label = label;
    for (const { fdi } of teeth) {
      const option = doc.createElement('option');
      option.value = String(fdi);
      option.textContent = `Zub ${fdi}`;
      group.append(option);
    }
    select.append(group);
  }
  select.value = '';
  copy.append(container);

  let pressed = false;
  let currentTooth = null;
  let lastMode;
  let lastEnabled;
  let lastReturning;
  let lastFromMap;
  function showTopic(tab) {
    for (const item of tabs) {
      const selected = item === tab;
      item.tabIndex = selected ? 0 : -1;
      item.setAttribute('aria-selected', String(selected));
      const panel = doc.getElementById(item.getAttribute('aria-controls'));
      panel.tabIndex = selected ? 0 : -1;
      panel.setAttribute('aria-hidden', String(!selected));
    }
  }
  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener('click', () => showTopic(tab), {signal});
    tab.addEventListener('keydown', event => {
      const targets = { ArrowLeft: (index + tabs.length - 1) % tabs.length, ArrowRight: (index + 1) % tabs.length,
        Home: 0, End: tabs.length - 1 };
      if (!Object.hasOwn(targets, event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const target = tabs[targets[event.key]];
      showTopic(target);
      target.focus({preventScroll: true});
    }, {signal});
  }
  const selectAdjacent = direction => {
    const fdi = adjacentAtlasTooth(Number(select.value), direction);
    if (!fdi) return;
    select.value = String(fdi);
    onSelect?.(fdi);
  };
  button.addEventListener('click', () => onToggle?.(!pressed), { signal });
  select.addEventListener('change', () => { if (select.value) onSelect?.(Number(select.value)); }, { signal });
  back.addEventListener('click', () => onReturn?.(), { signal });
  previous.addEventListener('click', () => selectAdjacent('previous'), { signal });
  next.addEventListener('click', () => selectAdjacent('next'), { signal });
  continueButton.addEventListener('click', () => onContinue?.(), { signal });

  return {
    update({ visible, enabled, active, focused = false, selectedFdi = null, returning = false, fromMap = false }) {
      const tooth = focused ? DENTAL_ATLAS_TEETH.get(selectedFdi) : null;
      const mode = visible ? (tooth ? 'detail' : 'overview') : null;
      if (fromMap !== lastFromMap) {
        back.textContent = fromMap ? 'Späť na mapu' : 'Späť k chrupu';
        continueButton.hidden = fromMap;
        lastFromMap = fromMap;
      }
      if (mode !== lastMode) {
        const returnFocus = mode === 'overview' && container.contains(doc.activeElement);
        container.hidden = !mode;
        if (mode) stage.dataset.dentalAtlas = mode;
        else delete stage.dataset.dentalAtlas;
        note.hidden = mode === 'detail';
        detail.hidden = button.hidden = back.hidden = navigation.hidden = mode !== 'detail';
        if (lastMode === 'detail') showTopic(tabs[0]);
        if (returnFocus) select.focus({ preventScroll: true });
        lastMode = mode;
      }
      if (lastEnabled !== enabled || currentTooth !== tooth || lastReturning !== returning) {
        select.disabled = back.disabled = continueButton.disabled = !enabled;
        button.disabled = !enabled || returning;
        const previousFdi = adjacentAtlasTooth(tooth?.fdi, 'previous');
        const nextFdi = adjacentAtlasTooth(tooth?.fdi, 'next');
        const activeElement = doc.activeElement;
        previous.disabled = !enabled || !previousFdi;
        next.disabled = !enabled || !nextFdi;
        previous.setAttribute('aria-label', previousFdi ? `Predchádzajúci zub FDI ${previousFdi}` : 'Predchádzajúci zub');
        next.setAttribute('aria-label', nextFdi ? `Ďalší zub FDI ${nextFdi}` : 'Ďalší zub');
        if (enabled && activeElement === previous && previous.disabled && !next.disabled) next.focus({ preventScroll: true });
        if (enabled && activeElement === next && next.disabled && !previous.disabled) previous.focus({ preventScroll: true });
        lastEnabled = enabled;
        lastReturning = returning;
      }
      const showInterior = mode === 'detail' && Boolean(active);
      if (pressed !== showInterior) {
        pressed = showInterior;
        button.textContent = pressed ? 'Skryť vnútro' : 'Zobraziť vnútro';
        button.setAttribute('aria-pressed', String(pressed));
        caption.hidden = !pressed;
        source.hidden = pressed;
      }
      if (currentTooth !== tooth) {
        currentTooth = tooth;
        onDetailChange?.(tooth);
        if (tooth) {
          type.textContent = tooth.type;
          title.textContent = `${tooth.fdi} — ${tooth.name}`;
          location.textContent = tooth.patientName;
          location.title = `${tooth.jaw} · ${tooth.side}`;
          purpose.textContent = tooth.purpose;
          landmark.textContent = tooth.landmark;
          fact.textContent = tooth.fact;
        }
        announcement.textContent = tooth ? `${title.textContent}. ${tooth.patientName}. ${tooth.side}.` : '';
      }
      const selectedValue = tooth ? String(tooth.fdi) : '';
      if (select.value !== selectedValue) select.value = selectedValue;
    },
    dispose() {
      abort.abort();
      container.remove();
      onDetailChange?.(null);
      delete stage.dataset.dentalAtlas;
    },
  };
}
