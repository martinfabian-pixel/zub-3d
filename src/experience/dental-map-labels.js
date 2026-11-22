import { Matrix4, Vector3 } from 'three';
import './dental-map-labels.css';

const ns = 'http://www.w3.org/2000/svg';
const directions = Array.from({length: 12}, (_, i) => {
  const angle = i * Math.PI / 6;
  return [Math.cos(angle), Math.sin(angle)];
});

// A small ring of support points on the actual enamel gives each tick a
// stable end at the silhouette, including when the visitor rotates the model.
function crownOutline(crown) {
  const vertices = crown.geometry.attributes.position;
  const stride = Math.max(1, Math.ceil(vertices.count / 240));
  const scores = directions.map(() => -Infinity);
  const contour = directions.map(() => new Vector3());
  const vertex = new Vector3();
  for (let i = 0; i < vertices.count; i += stride) {
    vertex.fromBufferAttribute(vertices, i);
    for (let d = 0; d < directions.length; d++) {
      const [x, z] = directions[d];
      const extent = vertex.x * x + vertex.z * z;
      if (extent > scores[d]) {
        scores[d] = extent;
        contour[d].copy(vertex);
      }
    }
  }
  return contour;
}

export function createDentalMapLabels(map) {
  const create = tag => map.ownerDocument.createElementNS(ns, tag);
  const svg = create('svg');
  svg.classList.add('dental-map-labels');
  svg.setAttribute('aria-hidden', 'true');
  map.prepend(svg);
  const rows = ['Horná čeľusť', 'Dolná čeľusť'].map(name => {
    const title = create('text');
    title.textContent = name;
    title.classList.add('dental-map-jaw');
    svg.append(title);
    return {labels: [], title, patientRight: null, patientLeft: null};
  });
  const labels = new Map();
  const clip = new Matrix4(), view = new Matrix4(), vertex = new Vector3();
  const normal = new Vector3(), sight = new Vector3();
  const placed = [];

  function makeLabel(point) {
    const group = create('g'), tick = create('line'), number = create('text');
    group.dataset.mapFdi = point.fdi;
    number.textContent = point.fdi;
    group.append(tick, number);
    svg.append(group);
    const label = {point, group, tick, number, outline: crownOutline(point.crown)};
    const quadrant = Math.floor(point.fdi / 10);
    const row = rows[quadrant <= 2 ? 0 : 1];
    // Walk the actual teeth along each arch from patient right to patient
    // left. Each tick follows the normal between its two real neighbours.
    label.order = (quadrant === 1 || quadrant === 4 ? -1 : 1) * (point.fdi % 10);
    row.labels.push(label);
    row.labels.sort((a, b) => a.order - b.order);
    // Centre the arch name between the second premolars in the open space.
    if (label.order === -5) row.patientRight = label;
    if (label.order === 5) row.patientLeft = label;
    labels.set(point.fdi, label);
    return label;
  }

  function setXY(node, x, y) {
    node.setAttribute('x', x.toFixed(1));
    node.setAttribute('y', y.toFixed(1));
  }
  function show(node, visible) {
    if (visible) node.removeAttribute('display');
    else node.setAttribute('display', 'none');
  }

  function placeNumber(label, before, after, centre, width, height) {
    const {point, group, tick, number} = label;
    const {x, y} = point;
    const a = before?.point ?? point, b = after?.point ?? point;
    const length = Math.hypot(b.x-a.x,b.y-a.y);
    if (!point.visible || !label.facing || length < 1) { show(group, false); return; }
    let nx = (a.y-b.y) / length, ny = (b.x-a.x) / length;
    if (nx * (x-centre.x) + ny * (y-centre.y) < 0) { nx = -nx; ny = -ny; }

    clip.multiplyMatrices(view, point.crown.matrixWorld);
    let edge = 0;
    for (const sample of label.outline) {
      vertex.copy(sample).applyMatrix4(clip);
      const sx = (1+vertex.x) * width / 2, sy = (1-vertex.y) * height / 2;
      edge = Math.max(edge, nx*(sx-x) + ny*(sy-y));
    }
    const glyphExtent = 7.5*Math.abs(nx) + 5.5*Math.abs(ny);
    for (const extra of [0,8,16]) {
      const offset = edge + 8 + glyphExtent + extra;
      const tx = x + nx*offset, ty = y + ny*offset;
      if (tx < 9 || tx > width-9 || ty < 7 || ty > height-7 ||
          placed.some(p => Math.abs(p.x-tx)<18 && Math.abs(p.y-ty)<13)) continue;
      placed.push({fdi: point.fdi, x: tx, y: ty});
      setXY(number, tx, ty);
      tick.setAttribute('x1', (x+nx*(edge+1)).toFixed(1));
      tick.setAttribute('y1', (y+ny*(edge+1)).toFixed(1));
      tick.setAttribute('x2', (tx-nx*(glyphExtent+2)).toFixed(1));
      tick.setAttribute('y2', (ty-ny*(glyphExtent+2)).toFixed(1));
      show(group, true);
      return;
    }
    show(group, false);
  }

  function update({points, width, height, selected, camera}) {
    view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    placed.length = 0;
    for (const point of points) {
      const label = labels.get(point.fdi) ?? makeLabel(point);
      const matrix = point.crown.matrixWorld;
      normal.set(0,1,0).transformDirection(matrix);
      sight.setFromMatrixPosition(matrix).sub(camera.position).normalize().negate();
      label.facing = normal.dot(sight) > .35;
      label.group.toggleAttribute('data-selected', selected === point.fdi);
    }
    for (const {labels: row, title, patientRight, patientLeft} of rows) {
      if (row.length < 2) { show(title, false); continue; }
      const left = patientRight ?? row[0], right = patientLeft ?? row[row.length-1];
      const centre = {
        x: (left.point.x+right.point.x)/2,
        y: (left.point.y+right.point.y)/2,
      };
      const space = Math.abs(right.point.x-left.point.x);
      const titleVisible = left.facing && right.facing && left.point.visible && right.point.visible && space > 80;
      show(title, titleVisible);
      if (titleVisible) setXY(title, centre.x, centre.y);
      for (let i = 0; i < row.length; i++) {
        placeNumber(row[i], row[i-1], row[i+1], centre, width, height);
      }
    }
  }
  function hitTest(x, y) {
    let nearest = 14, fdi = null;
    for (const number of placed) {
      const distance = Math.hypot(number.x - x, number.y - y);
      if (distance < nearest) { nearest = distance; fdi = number.fdi; }
    }
    return fdi;
  }
  return {update, hitTest};
}
