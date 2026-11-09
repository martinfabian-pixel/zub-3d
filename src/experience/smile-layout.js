import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three';

// Presentation seating in centimetres, from central incisor to second molar.
// The educational anatomy keeps its native positions and proportions.
const UPPER = {
  yaw: [7, 22, 39, 58, 70, 80, 86],
  pitch: [15, 16, 18, 16, 17, 20, 18],
  width: [1.055, 1.04, 1.01, 1, 1, 1, 1],
  height: [.95, .94, .95, .96, .94, .89, .91],
  edge: [-.63, -.56, -.59, -.51, -.50, -.49, -.45],
  front: 2.03,
};
const LOWER = {
  yaw: [6, 20, 38, 57, 70, 81, 88],
  pitch: [12, 13, 14, 12, 11, 10, 10],
  width: [1.075, 1.04, 1.005, 1, 1, 1, 1],
  height: [.75, .80, .83, .87, .91, .95, .96],
  edge: [-.52, -.50, -.44, -.478, -.488, -.37, -.35],
  front: 1.72,
};
const rad = Math.PI / 180;
const contactGap = .006;

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

      // Pair each crown's projected support with the neighboring support on a
      // plane normal to the local arch. This closes the smile without letting
      // adjacent meshes occupy the same space, even where crown widths differ.
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
