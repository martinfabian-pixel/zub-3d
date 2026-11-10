import {
  Box3, Color, Matrix4, Mesh, MeshStandardMaterial, SphereGeometry, Vector3,
  MathUtils,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// A small enamel-coloured support behind each contact. The shapes are confined
// to individual spaces, not a visible plate spanning the dental arches.
export function createSmileBacking(teeth, layout, config) {
  const bounds = new Map();
  const point = new Vector3();
  for (const [fdi, matrix] of layout) {
    const positions = teeth.get(fdi).crown.geometry.attributes.position;
    const box = new Box3();
    for (let i = 0; i < positions.count; i++) {
      box.expandByPoint(point.fromBufferAttribute(positions, i).applyMatrix4(matrix));
    }
    bounds.set(fdi, box);
  }

  const primitive = new SphereGeometry(1, 12, 8);
  const pieces = [];
  const transform = new Matrix4();
  function addPatch(x, y, z, width, height, depth) {
    const geometry = primitive.clone();
    transform.makeScale(width, height, depth).setPosition(x, y, z);
    geometry.applyMatrix4(transform);
    pieces.push(geometry);
  }

  const rows = [
    [17,16,15,14,13,12,11,21,22,23,24,25,26,27],
    [47,46,45,44,43,42,41,31,32,33,34,35,36,37],
  ];
  for (const row of rows) {
    for (let i = 0; i < row.length - 1; i++) {
      const left = bounds.get(row[i]);
      const right = bounds.get(row[i + 1]);
      const bottom = Math.max(left.min.y, right.min.y);
      const top = Math.min(left.max.y, right.max.y);
      if (bottom >= top) continue;
      const lowerRow=row[0]>=40;
      const height=top-bottom;
      const centerY=lowerRow ? bottom+height*.70 : (bottom+top)/2;
      addPatch((left.max.x + right.min.x) / 2, centerY,
        Math.min(left.max.z, right.max.z) - .40,
        lowerRow ? .05 : .065, Math.min(.19,height*(lowerRow ? .13 : .20)), .07);
    }
  }

  // Leave the bite line open. A white filler spanning opposing rows is
  // especially conspicuous when the arch is viewed at an angle.
  const geometry = mergeGeometries(pieces);
  primitive.dispose();
  for (const piece of pieces) piece.dispose();
  const material = new MeshStandardMaterial({
    color: new Color(config.smileMaterial.enamelColor),
    roughness: .38, metalness: 0, transparent: true, opacity: 0, depthWrite: false,
  });
  const object = new Mesh(geometry, material);
  object.name = 'Discreet enamel-coloured smile contact backing';
  object.visible = false;
  object.castShadow = false;
  object.receiveShadow = false;
  let coverage=0, viewFactor=1;
  function updateVisibility() {
    const opacity=coverage*viewFactor;
    object.visible=opacity>.001;
    material.opacity=opacity;
  }
  return {
    object,
    setCoverage(value) {
      coverage=MathUtils.smoothstep(value,.68,.98);
      updateVisibility();
    },
    setViewFactor(value) { viewFactor=value; updateVisibility(); },
  };
}
