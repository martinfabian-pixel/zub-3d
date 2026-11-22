import { Box3, Matrix4, Vector3 } from 'three';

// Both arches hinge around the posterior edge of their own row. A rotation
// about X keeps the patient's right (FDI 1/4) on the viewer's left throughout.
export function createOcclusalMap(teeth, layout) {
  const row = upper => ({ upper, seated: new Box3(), transform: new Matrix4() });
  const upper = row(true), lower = row(false);
  const bounds = new Box3(), lowerBounds = new Box3();
  const box = new Box3(), surface = new Vector3();
  const combined = new Matrix4();
  const anchors = new Map();

  for (const [fdi, seat] of layout) {
    const { crown, upper: isUpper } = teeth.get(fdi);
    const local = crown.geometry.boundingBox;
    (isUpper ? upper : lower).seated.union(box.copy(local).applyMatrix4(seat));

    // Store a real point on the biting surface, near its centre. The point
    // then follows the live crown, including the independent jaw rotations.
    const anchor = local.getCenter(new Vector3());
    const size = local.getSize(new Vector3());
    const vertices = crown.geometry.attributes.position;
    const cx = anchor.x, cz = anchor.z;
    // Sample across the whole authored surface without delaying the first
    // smile with a second high-resolution vertex pass on mobile.
    const stride = Math.max(1, Math.ceil(vertices.count / 768));
    let best = -Infinity;
    for (let i = 0; i < vertices.count; i += stride) {
      surface.fromBufferAttribute(vertices, i);
      const dx = (surface.x - cx) / size.x, dz = (surface.z - cz) / size.z;
      const score = (surface.y - local.min.y) / size.y - 7 * (dx * dx + dz * dz);
      if (score > best) { best = score; anchor.copy(surface); }
    }
    anchors.set(fdi, anchor);
  }

  const centerZ = (upper.seated.min.z + upper.seated.max.z + lower.seated.min.z + lower.seated.max.z) / 4;
  function rotate(jaw, amount) {
    const { min, max } = jaw.seated;
    const y = (min.y + max.y) / 2, z = min.z;
    const angle = (jaw.upper ? -1 : 1) * amount * Math.PI / 2;
    const cosine = Math.cos(angle), sine = Math.sin(angle);
    // Leave a small seam between opposing second molars at full extension.
    const endY = jaw.upper ? .16 : -.16;
    jaw.transform.makeRotationX(angle).setPosition(0,
      y + amount * (endY - y) - cosine * y + sine * z,
      z + amount * (centerZ - z) - sine * y - cosine * z);
  }
  function sample(lowerAmount, upperAmount) {
    rotate(lower, lowerAmount);
    rotate(upper, upperAmount);
  }
  sample(1, 1);
  for (const [fdi, seat] of layout) {
    const item = teeth.get(fdi);
    combined.multiplyMatrices(item.upper ? upper.transform : lower.transform, seat);
    box.copy(item.crown.geometry.boundingBox).applyMatrix4(combined);
    bounds.union(box);
    if (!item.upper) lowerBounds.union(box);
  }
  return { lower: lower.transform, upper: upper.transform, bounds, lowerBounds, anchors, sample };
}
