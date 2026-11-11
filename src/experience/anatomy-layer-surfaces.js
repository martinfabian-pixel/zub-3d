import { BackSide, FrontSide, Matrix4, Ray, Triangle, Vector3 } from 'three';
import { buildTriangleBuckets } from './annotation-surfaces.js';

/** Exact, shader-aware intersections for the handful of meshes of the cut. */
export function createLayerSurfaceProbe() {
  const buckets=new WeakMap(),ray=new Ray(),inverse=new Matrix4();
  const a=new Vector3(),b=new Vector3(),c=new Vector3(),normal=new Vector3();
  const point=new Vector3(),delta=new Vector3();

  function warm(object) {
    const geometry=object.geometry;
    if(!buckets.has(geometry))buckets.set(geometry,buildTriangleBuckets(geometry));
    return buckets.get(geometry);
  }

  function nearest(surfaces,worldRay,near,far) {
    let foundObject=null,foundLayer=null,best=far;
    for(const surface of surfaces) {
      const {object,fragment}=surface;
      if(!object.visible)continue;
      const {geometry,material}=object;
      const side=material.side,{position}=geometry.attributes,index=geometry.index;
      const bins=warm(object);
      inverse.copy(object.matrixWorld).invert();
      ray.origin.copy(worldRay.origin).applyMatrix4(inverse);
      ray.direction.copy(worldRay.origin).add(worldRay.direction).applyMatrix4(inverse).sub(ray.origin);
      const scale=ray.direction.length();
      ray.direction.divideScalar(scale);
      if(!ray.intersectsBox(geometry.boundingBox))continue;
      const localNear=near*scale;
      let localBest=best*scale;
      for(const {box,faces} of bins) {
        if(!ray.intersectBox(box,point))continue;
        const distanceToBox=delta.subVectors(point,ray.origin).dot(ray.direction);
        if(!box.containsPoint(ray.origin)&&distanceToBox>localBest)continue;
        for(const face of faces) {
          a.fromBufferAttribute(position,index?index.getX(face):face);
          b.fromBufferAttribute(position,index?index.getX(face+1):face+1);
          c.fromBufferAttribute(position,index?index.getX(face+2):face+2);
          if(!ray.intersectTriangle(a,b,c,false,point))continue;
          const distance=delta.subVectors(point,ray.origin).dot(ray.direction);
          if(distance<localNear||distance>=localBest)continue;
          const front=normal.subVectors(b,a).cross(delta.subVectors(c,a)).dot(ray.direction)<0;
          if((side===FrontSide&&!front)||(side===BackSide&&front))continue;
          // A real surface may block the ray without corresponding to a
          // selectable layer, e.g. the outside of a root.
          const id=fragment(point,front);
          if(id===false)continue;
          localBest=distance;
          best=distance/scale;
          foundObject=object;foundLayer=id;
        }
      }
    }
    return foundObject?{id:foundLayer,object:foundObject,distance:best}:null;
  }

  return {nearest,warm};
}

/** One exact, stable triangle-centre sample per height band and azimuth. */
export function createLayerAnchorCandidates(object,id,heights) {
  const {geometry}=object,{position}=geometry.attributes,index=geometry.index;
  if(!geometry.boundingBox)geometry.computeBoundingBox();
  const {min,max}=geometry.boundingBox;
  const center=geometry.boundingBox.getCenter(new Vector3()),size=max.y-min.y,sectors=12;
  const best=new Array(heights.length*sectors);
  const a=new Vector3(),b=new Vector3(),c=new Vector3(),point=new Vector3();
  for(let face=0;face<(index?.count??position.count);face+=3) {
    a.fromBufferAttribute(position,index?index.getX(face):face);
    b.fromBufferAttribute(position,index?index.getX(face+1):face+1);
    c.fromBufferAttribute(position,index?index.getX(face+2):face+2);
    point.copy(a).add(b).add(c).multiplyScalar(1/3);
    const height=(point.y-min.y)/size;
    const angle=(Math.atan2(point.x-center.x,point.z-center.z)+Math.PI)*sectors/(Math.PI*2);
    const nearest=Math.round(angle),sector=nearest%sectors;
    for(let band=0;band<heights.length;band++) {
      const score=Math.abs(height-heights[band])+.06*Math.abs(angle-nearest);
      const slot=band*sectors+sector;
      if(best[slot]&&score>=best[slot].score)continue;
      best[slot]={id,object,local:point.clone(),normal:Triangle.getNormal(a,b,c,new Vector3()),score,band};
    }
  }
  return best.filter(Boolean);
}
