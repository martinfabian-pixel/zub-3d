import { Vector3 } from 'three';
import { DENTAL_ATLAS_GROUPS, DENTAL_ATLAS_TEETH } from './dental-atlas-data.js';
import './dental-map-ui.css';

const ordinals = ['jednotka', 'dvojka', 'trojka', 'štvorka', 'päťka', 'šestka', 'sedmička'];
const oppositeQuadrant = { 1: 2, 2: 1, 3: 4, 4: 3 };
const cleaningNote = 'Medzi týmto zubom a susednou sedmičkou ste si práve pozreli ukážku čistenia.';

function toothCopy(tooth) {
  const jaw = tooth.jaw.split(' ')[0];
  const side = tooth.side.split(' ')[0];
  const name = [jaw, side, ordinals[tooth.fdi % 10 - 1]].join(' ');
  // The atlas already distinguishes central/lateral incisors and first/second molars.
  const group = tooth.name.toLocaleLowerCase('sk').replace(/\b(?:horný|dolný) |(?:horná|dolná) /u, '');
  return { name, group };
}

export function createDentalMapUI({ stage, canvas, arch, requestRender }) {
  const doc = stage.ownerDocument;
  const map = doc.createElement('section');
  map.id = 'dental-map';
  map.hidden = true;
  map.setAttribute('aria-label', 'Vybraný zub na mape chrupu');
  map.innerHTML = `
    <span id="dental-map-number" aria-hidden="true" hidden></span>
    <div class="dental-map-caption">
      <label class="dental-map-picker">
        <span id="dental-map-name" aria-hidden="true"></span>
        <select id="dental-map-selected" aria-label="Vybrať zub na mape chrupu"></select>
      </label>
      <p id="dental-map-description" aria-live="polite" aria-atomic="true"></p>
    </div>`;
  stage.append(map);
  const number = map.querySelector('#dental-map-number');
  const picker = map.querySelector('select');
  const name = map.querySelector('#dental-map-name');
  const description = map.querySelector('#dental-map-description');
  const world = new Vector3();
  const corner = new Vector3();
  const points = [];
  const candidates = [];
  const anchors = new Map();
  let active = false, selected = 36, marker = null, layoutWidth = 0, layoutHeight = 0;

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
    if (!tooth) return;
    const text = toothCopy(tooth);
    name.textContent = text.name;
    description.textContent = selected === 36 ? cleaningNote
      : text.group.charAt(0).toLocaleUpperCase('sk') + text.group.slice(1);
    picker.value = String(selected);
    number.textContent = String(selected);
    arch.setMapSelection(selected);
  }

  function select(fdi) {
    if (!active || selected === fdi || !anchors.has(fdi)) return;
    selected = fdi;
    displaySelection();
    requestRender();
  }
  picker.addEventListener('change', () => select(Number(picker.value)));

  function updateBadge(camera, width, height) {
    const target = anchors.get(selected);
    marker = null;
    if (!target?.visible) { number.hidden = true; return; }
    const mesh = target.crown;
    const {min, max} = mesh.geometry.boundingBox;
    let left = width, right = 0, top = height, bottom = 0;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z)
        .applyMatrix4(mesh.matrixWorld).project(camera);
      const x = (corner.x + 1) * .5 * width, y = (1 - corner.y) * .5 * height;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    // Put the number just off the crown, toward the open palate. Try the
    // opposite edge too when the visitor rotates the arches or zooms in.
    const quadrant = Math.floor(selected / 10);
    const midline = anchors.get(quadrant * 10 + 1);
    const counterpart = anchors.get(oppositeQuadrant[quadrant] * 10 + 1);
    const inwardX = midline && counterpart ? (midline.x + counterpart.x) / 2 - target.x : 0;
    const front = selected % 10 < 4;
    const positions = [
      { x: left - 16, y: target.y, bias: !front && inwardX < 0 ? 0 : 10 },
      { x: right + 16, y: target.y, bias: !front && inwardX >= 0 ? 0 : 10 },
      { x: target.x, y: top - 14, bias: front && selected > 30 ? 0 : 11 },
      { x: target.x, y: bottom + 14, bias: front && selected < 30 ? 0 : 11 },
    ];
    let best, bestScore = Infinity;
    for (const pos of positions) {
      if (pos.x < 18 || pos.x > width - 18 || pos.y < 16 || pos.y > height - 16) continue;
      let score = pos.bias + Math.hypot(pos.x - target.x, pos.y - target.y) * .12;
      for (const other of points) {
        if (other === target || !other.visible) continue;
        score += Math.max(0, 30 - Math.hypot(other.x - pos.x, other.y - pos.y));
      }
      if (score < bestScore) { best = pos; bestScore = score; }
    }
    if (!best) { number.hidden = true; return; }
    marker = {x: best.x, y: best.y};
    const leftPx = best.x.toFixed(1) + 'px', topPx = best.y.toFixed(1) + 'px';
    if (number.style.left !== leftPx) number.style.left = leftPx;
    if (number.style.top !== topPx) number.style.top = topPx;
    number.hidden = false;
  }

  function update({active: show, unfolded = false, camera, width, height}) {
    if (active !== show) {
      active = show;
      map.hidden = !active;
      if (active) {
        populate();
        displaySelection();
      } else {
        marker = null; layoutWidth = 0;
        if (picker === doc.activeElement) canvas.focus({preventScroll: true});
      }
    }
    if (!active) {
      // The selected enamel tint follows its own crown while the jaw closes.
      // A reversal keeps that tooth until the arches have completely reseated.
      if (!unfolded && selected !== 36) { selected = 36; arch.setMapSelection(36); }
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
        map.style.setProperty('--map-caption-top', Math.min(bottom + 20, height - 94) + 'px');
      }
    }
    layoutWidth = width; layoutHeight = height;
    updateBadge(camera, width, height);
  }

  function pick(raycaster, event) {
    if (!active) return;
    const hit = raycaster.intersectObjects(candidates, false).find(({object}) => object.visible);
    if (hit) {
      select(hit.object.userData.smileFdi);
      return;
    }
    if (event.pointerType === 'mouse') return;
    // A touch just outside a thin incisal edge uses the nearest crown centre.
    // A surface hit always wins, even near the shared edge of two incisors.
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
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
    get active() { return active; },
    get selected() { return selected; },
    report: () => ({active, selectedFdi: selected, marker,
      teeth: active ? points.filter(p => p.visible).map(({fdi,x,y}) => ({fdi,x,y})) : []}),
    dispose() { map.remove(); },
  };
}
