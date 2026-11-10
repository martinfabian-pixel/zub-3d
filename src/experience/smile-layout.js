import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three';

// Presentation seating in centimetres, from central incisor to second molar.
// The educational anatomy keeps its native positions and proportions.
const UPPER = {
  yaw: [5, 24, 44, 64, 78, 87, 92],
  pitch: [9, 10, 11, 12, 12, 13, 13],
  width: [1.06, 1.035, 1.01, .98, .95, .91, .88],
  height: [1.13, 1.09, 1.06, 1.02, .99, .96, .94],
  edge: [-.63, -.60, -.59, -.56, -.53, -.51, -.49],
  front: 2.03,
};
const LOWER = {
  yaw: [5, 22, 42, 61, 76, 85, 91],
  pitch: [9, 10, 11, 10, 9, 9, 9],
  width: [1.09, 1.06, 1.03, .99, .96, .92, .89],
  height: [.98, .98, .99, .99, .98, .96, .94],
  edge: [-.45, -.44, -.43, -.45, -.41, -.40, -.38],
  // Set the lower crowns slightly behind the upper row to keep the stylized
  // bite visually close without intersections between opposite teeth.
  front: 1.34,
};
const rad = Math.PI / 180;
// A small physical clearance keeps adjacent crown meshes from intersecting.
// Contact is read as a narrow enamel seam, not as intersecting geometry.
const contactGap = .001;

/** A small cervical contour correction on the final incisors. The prepared
 * crowns are capped at the neck; a perfectly straight cap reads as a hard,
 * rectangular top in the hero view. Deform the existing vertices only and
 * transform their authored normals and tangents with the same Jacobian.
 * Whole-tooth anatomy and the flying meshes remain untouched.
 */
function softenIncisorNecks(teeth) {
  const cache = new Map();
  for (const [fdi, item] of teeth) {
    if (fdi % 10 > 2 || !item.crown) continue;
    const source = item.crown.geometry;
    let result = cache.get(source.uuid);
    if (!result) {
      result = source.clone(); result.computeBoundingBox();
      const p=result.attributes.position,n=result.attributes.normal,tangent=result.attributes.tangent;
      const box=result.boundingBox,cx=(box.min.x+box.max.x)*.5,hx=(box.max.x-box.min.x)*.5;
      const height=box.max.y-box.min.y, span=height*.42, amount=height*.105;
      for(let i=0;i<p.count;i++) {
        const x=p.getX(i), y=p.getY(i), z=p.getZ(i), dx=x-cx;
        const u=Math.max(0,Math.min(1,(y-box.min.y)/span));
        const w=1-u*u*(3-2*u), dw=u>0&&u<1?(-6*u+6*u*u)/span:0;
        const scale=1-.18*w, b=-.18*dx*dw;
        const xn=dx/hx, c=2*amount*xn*w/hx, d=1+amount*xn*xn*dw;
        p.setXYZ(i,cx+dx*scale,y+amount*xn*xn*w,z);
        if(n) {
          const nx=n.getX(i),ny=n.getY(i),nz=n.getZ(i),det=scale*d-b*c;
          const vx=(d*nx-c*ny)/det,vy=(-b*nx+scale*ny)/det;
          const length=Math.hypot(vx,vy,nz)||1;n.setXYZ(i,vx/length,vy/length,nz/length);
        }
        if(tangent) {
          const tx=tangent.getX(i),ty=tangent.getY(i),tz=tangent.getZ(i);
          const vx=scale*tx+b*ty,vy=c*tx+d*ty,length=Math.hypot(vx,vy,tz)||1;
          tangent.setXYZW(i,vx/length,vy/length,tz/length,tangent.getW(i));
        }
      }
      p.needsUpdate=true;if(n)n.needsUpdate=true;if(tangent)tangent.needsUpdate=true;
      result.computeBoundingBox();result.computeBoundingSphere();cache.set(source.uuid,result);
    }
    item.crown.geometry=result;
  }
}

export function createSmileLayout(teeth) {
  softenIncisorNecks(teeth);
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
