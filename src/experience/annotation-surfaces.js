import { Box3, Matrix4, Ray, Triangle, Vector3 } from 'three';

const point = new Vector3(), a = new Vector3(), b = new Vector3(), c = new Vector3();
const triangle = new Triangle(a,b,c);
const nearest = new Vector3(), weighted = new Vector3();
const inverse = new Matrix4(), ray = new Ray(), boundHit = new Vector3();
const toleranceCm = 0.001; // 0.01 mm along the ray, below the film thickness.

function bindLocal(mesh, local) {
  const g=mesh.geometry, indices=g.index, p=g.attributes.position;
  let best=Infinity, binding;
  for(let f=0;f<indices.count/3;f++) {
    const ia=indices.getX(3*f),ib=indices.getX(3*f+1),ic=indices.getX(3*f+2);
    a.fromBufferAttribute(p,ia);b.fromBufferAttribute(p,ib);c.fromBufferAttribute(p,ic);
    triangle.closestPointToPoint(local,nearest);
    const d=nearest.distanceToSquared(local);
    if(d>=best)continue;
    const weights=Triangle.getBarycoord(nearest,a,b,c,weighted);
    if(!weights)continue;
    best=d;binding={fdi:mesh.userData.fdi,vertexIndices:[ia,ib,ic],barycentric:weights.toArray()};
  }
  if(!binding||best>1e-10)throw new Error('Annotation does not register to FDI '+mesh.userData.fdi);
  return binding;
}

/** Fixed source points. A paired air-space landmark has one term on each
 * wall; a surface term uses indices of the actually rendered mesh.
 */
export function createSurfaceAnchors(site, arch, compact) {
  const host=fdi=>arch.teeth.get(fdi).mesh;
  const swept=site.plaque.verifiedReachableCenters[36];
  const entrySide=swept.patchBoundary.reduce((a,b)=>a.arcMm<b.arcMm?a:b);
  const cleaned=bindLocal(host(36),new Vector3().fromArray(swept.localMetres)
    .lerp(new Vector3().fromArray(entrySide.localMetres),.72));
  const patch=site.plaque.patches.find(p=>p.fdi===36);
  // A measured vertex in the coating, on its visible distobuccal extension.
  // Choose it by its source film support and position along the surveyed
  // entry, before any viewing direction or screen coordinates are known.
  let best=-Infinity,filmPoint;
  for(let i=0;i<patch.edgeWeight.length;i++) {
    if(patch.edgeWeight[i]<.30)continue;
    const score=patch.edgeWeight[i]-.18*Math.abs(patch.nearestArcMm[i]-4.05);
    if(score>best){best=score;filmPoint=new Vector3().fromArray(patch.positions,3*i);}
  }
  if(!filmPoint)throw new Error('No marked film support for a plaque annotation.');
  const plaque=bindLocal(host(36),filmPoint);
  const contact=site.brush.centerline.reduce((x,y)=>Math.abs(x.arcLengthMm-3.35)<Math.abs(y.arcLengthMm-3.35)?x:y);
  const walls=compact?contact.contactsMobile:contact.contacts;
  const terms=[36,37].map(fdi=>{
    const mesh=host(fdi),wall=walls.find(w=>w.fdi===fdi);
    const seated=arch.teeth.get(fdi).seatedMatrix;
    const world=seated?inverse.multiplyMatrices(mesh.parent.matrixWorld,seated):inverse.copy(mesh.matrixWorld);
    const local=new Vector3().fromArray(wall.nearestWorld).applyMatrix4(world.invert());
    return bindLocal(mesh,local);
  });
  return {space:{terms,weights:[.5,.5]},plaque,cleaned};
}

function termWorld(term,arch,out) {
  const mesh=arch.teeth.get(term.fdi).mesh;
  out.set(0,0,0);
  for(let i=0;i<3;i++)out.addScaledVector(mesh.getVertexPosition(term.vertexIndices[i],point),term.barycentric[i]);
  return out.applyMatrix4(mesh.matrixWorld);
}

export function anchorWorld(anchor,arch,out) {
  if(!anchor.terms)return termWorld(anchor,arch,out);
  out.set(0,0,0);
  for(let i=0;i<anchor.terms.length;i++)out.addScaledVector(termWorld(anchor.terms[i],arch,weighted),anchor.weights[i]);
  return out;
}

// The broad-phase bounds are built once. Only intersected buckets require
// exact triangle tests, even during an orbit.
function buildBuckets(g) {
  const p=g.attributes.position,index=g.index;
  if(!g.boundingBox)g.computeBoundingBox();
  const min=g.boundingBox.min,span=g.boundingBox.getSize(new Vector3());
  const scale=11/Math.max(span.x,span.y,span.z),bins=new Map();
  for(let f=0;f<index.count;f+=3) {
    const ia=index.getX(f),ib=index.getX(f+1),ic=index.getX(f+2);
    a.fromBufferAttribute(p,ia);b.fromBufferAttribute(p,ib);c.fromBufferAttribute(p,ic);
    point.copy(a).add(b).add(c).multiplyScalar(1/3).sub(min).multiplyScalar(scale);
    const key=Math.floor(point.x)+16*Math.floor(point.y)+256*Math.floor(point.z);
    let bin=bins.get(key);
    if(!bin){bin={box:new Box3(),faces:[]};bins.set(key,bin);}
    bin.faces.push(f);bin.box.expandByPoint(a).expandByPoint(b).expandByPoint(c);
  }
  return [...bins.values()];
}

export function createVisibilityTest(arch) {
  const cache=new Map(),start=new Vector3(),end=new Vector3(),dir=new Vector3(),nearPoint=new Vector3();
  function blocked(world,camera) {
    const depth=-point.copy(world).applyMatrix4(camera.matrixWorldInverse).z;
    nearPoint.setFromMatrixPosition(camera.matrixWorld);
    dir.copy(nearPoint).sub(world).normalize();
    // Geometry between the lens and its near plane is clipped in WebGL.
    nearPoint.lerp(world,camera.near/depth);
    start.copy(world).addScaledVector(dir,toleranceCm);
    for(const item of arch.teeth.values()) {
      const mesh=item.mesh;
      if(!mesh?.visible||item.reveal<.01)continue;
      const g=mesh.geometry,index=g.index;
      if(!g.boundingBox)g.computeBoundingBox();
      inverse.copy(mesh.matrixWorld).invert();
      ray.origin.copy(start).applyMatrix4(inverse);end.copy(nearPoint).applyMatrix4(inverse);
      const distance=ray.origin.distanceToSquared(end);
      ray.direction.copy(end).sub(ray.origin).normalize();
      if(!ray.intersectsBox(g.boundingBox))continue;
      if(!cache.has(g))cache.set(g,buildBuckets(g));
      for(const bin of cache.get(g)) {
        if(!ray.intersectsBox(bin.box))continue;
        for(const f of bin.faces) {
          mesh.getVertexPosition(index.getX(f),a);mesh.getVertexPosition(index.getX(f+1),b);mesh.getVertexPosition(index.getX(f+2),c);
          if(ray.intersectTriangle(a,b,c,false,boundHit)&&ray.origin.distanceToSquared(boundHit)<distance)return true;
        }
      }
    }
    return false;
  }
  return {blocked,dispose(){cache.clear();}};
}
