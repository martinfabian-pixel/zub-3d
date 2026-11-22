import { Vector3 } from 'three';
import { DENTAL_ATLAS_GROUPS, DENTAL_ATLAS_TEETH } from './dental-atlas-data.js';
import { createDentalMapLabels } from './dental-map-labels.js';
import './dental-map-ui.css';

const toothGroups = [
  ['1–2', 'Rezáky', 'Rezák'], ['3', 'Očné zuby', 'Očný zub'],
  ['4–5', 'Črenové zuby', 'Črenový zub'], ['6–7', 'Stoličky', 'Stolička'],
];

function toothCopy(tooth) {
  // The atlas already distinguishes central/lateral incisors and first/second molars.
  const group = tooth.name.toLocaleLowerCase('sk').replace(/\b(?:horný|dolný) |(?:horná|dolná) /u, '');
  return { name: tooth.patientName, group };
}

export function createDentalMapUI({ stage, canvas, arch, requestRender, onSelect }) {
  const doc = stage.ownerDocument;
  const map = doc.createElement('section');
  map.id = 'dental-map';
  map.hidden = true;
  map.setAttribute('aria-label', 'Číslovanie a skupiny zubov');
  map.innerHTML = `
    <div class="dental-map-caption">
      <div class="dental-map-reading">
        <p id="dental-map-description" aria-live="polite" aria-atomic="true"></p>
        <label class="dental-map-picker">
          <span id="dental-map-name" aria-hidden="true"></span>
          <select id="dental-map-selected" aria-label="Vybrať zub na mape chrupu">
            <option value="" disabled>Vybrať zub</option>
            <option value="all" hidden>Všetky zuby</option>
          </select>
        </label>
      </div>
      <ul class="dental-map-key" aria-label="Skupiny zubov podľa druhej číslice FDI"></ul>
    </div>`;
  stage.append(map);
  const labels = createDentalMapLabels(map);
  const picker = map.querySelector('select');
  const name = map.querySelector('#dental-map-name');
  const description = map.querySelector('#dental-map-description');
  const world = new Vector3();
  const key = map.querySelector('.dental-map-key');
  const groupItems = toothGroups.map(([digits, label, type]) => {
    const item = doc.createElement('li');
    const range = doc.createElement('strong');
    range.textContent = digits;
    item.append(range, ' ', label);
    key.append(item);
    return {item, type};
  });
  const points = [];
  const candidates = [];
  const anchors = new Map();
  let active = false, selected = null, layoutWidth = 0, layoutHeight = 0;

  function populate() {
    // The staged loader may have installed only the teaching molar at construction.
    if (points.length) return;
    for (const { label, teeth } of DENTAL_ATLAS_GROUPS) {
      const group = doc.createElement('optgroup');
      group.label = label;
      for (const tooth of teeth) {
        const crown = arch.teeth.get(tooth.fdi)?.crown;
        if (!crown) continue;
        const text = toothCopy(tooth);
        group.append(new Option(`${tooth.fdi} · ${text.name} · ${text.group}`, String(tooth.fdi)));
        const point = { fdi: tooth.fdi, x: 0, y: 0, visible: false, crown };
        points.push(point);
        candidates.push(crown);
        anchors.set(tooth.fdi, point);
      }
      if (group.children.length) picker.append(group);
    }
  }

  function displaySelection() {
    const tooth = DENTAL_ATLAS_TEETH.get(selected);
    const text = tooth && toothCopy(tooth);
    name.textContent = text ? text.name : 'Vybrať zub';
    description.textContent = text
      ? `${selected} · ${text.group.charAt(0).toLocaleUpperCase('sk') + text.group.slice(1)}`
      : 'Druhá číslica FDI';
    // The picker opens a detail. Its current-value row is distinct from the
    // 28 actions, so choosing the last inspected FDI again fires change on iOS.
    picker.options[0].textContent = tooth ? `${selected} · ${text.name}` : 'Vybrať zub';
    picker.options[1].hidden = !tooth;
    picker.value = '';
    for (const {item, type} of groupItems) item.toggleAttribute('data-selected', type === tooth?.type);
  }

  function select(fdi) {
    if (active && anchors.has(fdi)) onSelect(fdi);
  }
  picker.addEventListener('change', () => {
    if (picker.value === 'all') {
      selected = null;
      displaySelection();
      requestRender();
    } else select(Number(picker.value));
  });

  function update({active: show, inMapChapter = false, camera, width, height}) {
    if (active !== show) {
      active = show;
      map.hidden = !active;
      if (active) {
        populate();
        displaySelection();
      } else {
        layoutWidth = 0;
        if (picker === doc.activeElement) canvas.focus({preventScroll: true});
      }
    }
    if (!active) {
      if (!inMapChapter) selected = null;
      return;
    }
    for (const point of points) {
      point.visible = false;
      if (!point.crown.visible || !arch.mapAnchor(point.fdi, world)) continue;
      world.project(camera);
      if (Math.abs(world.z) > 1) continue;
      point.x = (1 + world.x) * width / 2;
      point.y = (1 - world.y) * height / 2;
      point.visible = Math.abs(world.x) < 1 && Math.abs(world.y) < 1;
    }
    // Reserve the caption's place when the map settles or the viewport changes.
    // Picking another tooth or orbiting never moves the text under the finger.
    if (width > 700 && (width !== layoutWidth || height !== layoutHeight)) {
      const bottom = Math.max(...points.filter(point => point.visible).map(point => point.y));
      if (Number.isFinite(bottom)) {
        map.style.setProperty('--map-caption-top', Math.min(bottom + 44, height - 100) + 'px');
      }
    }
    layoutWidth = width; layoutHeight = height;
    labels.update({points,width,height,selected,camera});
  }

  function pick(raycaster, event) {
    if (!active) return;
    const hit = raycaster.intersectObjects(candidates, false).find(({object}) => object.visible);
    if (hit) {
      select(hit.object.userData.smileFdi);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    const number = labels.hitTest(x, y);
    if (number !== null) {
      select(number);
      return;
    }
    if (event.pointerType === 'mouse') return;
    // A touch just outside a thin incisal edge uses the nearest crown centre.
    let closest, nearest = 20;
    for (const point of points) {
      if (!point.visible) continue;
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance < nearest) { closest = point; nearest = distance; }
    }
    if (closest) select(closest.fdi);
  }

  return {
    update, pick,
    remember(fdi) { selected = fdi; },
    focusPicker() { picker.focus({preventScroll:true}); },
    get active() { return active; },
    get selected() { return selected; },
    report: () => ({active, selectedFdi: selected,
      teeth: active ? points.filter(p => p.visible).map(({fdi,x,y}) => ({fdi,x,y})) : []}),
    dispose() { map.remove(); },
  };
}
