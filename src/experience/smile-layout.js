import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three';

// Presentation seating in centimetres, from central incisor to second molar.
// The educational anatomy keeps its native positions and proportions.
const UPPER = {
  yaw: [5, 20, 38, 58, 73, 83, 89],
  pitch: [12, 13, 15, 15, 16, 18, 18],
  width: [1.035, 1.045, 1.04, 1.025, 1.02, 1.01, 1],
  height: [1.12, 1.10, 1.07, 1.06, 1.05, 1.02, 1.01],
  edge: [-.63, -.59, -.60, -.55, -.54, -.52, -.49],
  front: 2.03,
};
const LOWER = {
  yaw: [5, 18, 36, 55, 70, 82, 89],
  pitch: [12, 13, 14, 12, 11, 10, 10],
  width: [1.09, 1.07, 1.04, 1.025, 1.02, 1.01, 1],
  height: [.96, .97, .98, 1.00, 1.00, 1.01, 1.01],
  edge: [-.50, -.49, -.46, -.46, -.46, -.42, -.40],
  // Set the lower crowns slightly behind the upper row to keep the stylized
  // bite visually close without intersections between opposite teeth.
  front: 1.34,
};
const rad = Math.PI / 180;
// Slight overlap of neighboring support planes closes the visible contact
// without replacing individual crowns with a single continuous surface.
const contactGap = -.008;

export function createSmileLayout(teeth) {
  const layout = new Map();
  const point = new Vector3();
  const axis = new Vector3();
  const position = new Vector3();
  const scale = new Vector3();
  const turn = new Quaternion();
  const lean = new Quaternion();
  const face = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const roll = new Vector3(0, 0, 1);
  const angles = new Euler();

  function outline(mesh, matrix, direction) {
    const vertices = mesh.geometry.attributes.position;
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < vertices.count; i++) {
      const along = point.fromBufferAttribute(vertices, i).applyMatrix4(matrix).dot(direction);
      min = Math.min(min, along);
      max = Math.max(max, along);
    }
    return { min, max };
  }

  for (let quadrant = 1; quadrant <= 4; quadrant++) {
    const upper = quadrant < 3;
    const style = upper ? UPPER : LOWER;
    const side = quadrant === 1 || quadrant === 4 ? -1 : 1;
    let previous = null;
    for (let i = 0; i < 7; i++) {
      const fdi = quadrant * 10 + i + 1;
      const { crown, matrix: nativeMatrix } = teeth.get(fdi);
      scale.setFromMatrixScale(nativeMatrix);
      scale.x *= style.width[i];
      scale.y *= style.height[i];
      if (!upper && i < 3) scale.z *= .91;
      turn.setFromAxisAngle(up, side * style.yaw[i] * rad);
      face.setFromAxisAngle(roll, upper ? Math.PI : 0);
      lean.setFromEuler(angles.set(style.pitch[i] * rad, 0, side * (i === 2 ? 3 : 0) * rad));
      turn.multiply(face).multiply(lean);
      const matrix = new Matrix4().compose(position.set(0, 0, 0), turn, scale);
      const height = outline(crown, matrix, up);

      // Pair each crown's projected support with its neighbor on a plane
      // normal to the local arch, keeping differently shaped teeth in contact.
      const yaw = (i === 0 ? 0 : (style.yaw[i - 1] + style.yaw[i]) / 2) * rad;
      axis.set(side * Math.cos(yaw), 0, -Math.sin(yaw));
      const inner = outline(crown, matrix, axis).min;
      if (previous) {
        const outer = outline(previous.crown, previous.matrix, axis).max;
        position.setFromMatrixPosition(previous.matrix);
        position.addScaledVector(axis, outer - inner + contactGap - position.dot(axis));
      } else {
        position.set(side * (contactGap / 2 - inner), 0, style.front);
      }
      position.y = style.edge[i] - (upper ? height.min : height.max);
      matrix.setPosition(position);
      layout.set(fdi, matrix);
      previous = { crown, matrix };
    }
  }
  return layout;
}

export function measureSmileBounds(teeth, layout) {
  const bounds = new Box3();
  const point = new Vector3();
  for (const [fdi, matrix] of layout) {
    const vertices = teeth.get(fdi).crown.geometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      bounds.expandByPoint(point.fromBufferAttribute(vertices, i).applyMatrix4(matrix));
    }
  }
  return bounds;
}
