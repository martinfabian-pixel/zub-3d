import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { createInspectionReturn } from '../src/experience/inspection.js';

const camera = new PerspectiveCamera(), origin = new Vector3();
const transition = createInspectionReturn(camera, 1000);
const near = (a, b, eps = 1e-8) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
function pose(focus, yaw, elevation, distance) {
  const y=yaw*Math.PI/180, e=elevation*Math.PI/180;
  camera.position.set(Math.sin(y)*Math.cos(e),Math.sin(e),Math.cos(y)*Math.cos(e))
    .multiplyScalar(distance).add(focus);
  camera.lookAt(focus);camera.updateMatrixWorld(true);
  return {position: camera.position.clone(), rotation: camera.quaternion.clone(), focus: focus.clone()};
}
function start(a, b, instant=false) {
  transition.begin(a.position,a.rotation,a.focus,b.focus,0,instant);
}
function looksAt(focus) {
  const direction=camera.getWorldDirection(new Vector3());
  assert.ok(direction.dot(focus.clone().sub(camera.position).normalize())>1-1e-8);
}

// An antipodal orbit used to put the lens exactly in the tooth at t=0.5.
{
  const focus=new Vector3(2.7,-0.7,-1.2),a=pose(focus,180,0,2.15),b=pose(focus,0,0,2.15);
  start(a,b);
  for(let ms=0;ms<=1000;ms+=10){transition.update(ms);near(camera.position.distanceTo(focus),2.15);looksAt(focus);}
  assert.equal(transition.active,false);assert.ok(camera.position.equals(b.position));assert.ok(camera.quaternion.equals(b.rotation));
}

// Follow a moving scroll target, even when its heading crosses the wrap point.
{
  const a=pose(origin,0,5,2),first=pose(new Vector3(0.3,0,0),179,6,3);
  start(a,first);transition.update(500);
  const old=camera.position.clone(),next=pose(new Vector3(.32,.02,0),-179,6,3);
  transition.destination(next.focus);transition.update(500);
  assert.ok(camera.position.distanceTo(old)<.08,'Retargeting across ±180° flipped the orbital arc');
  const midway=a.focus.clone().lerp(next.focus,.5);near(camera.position.distanceTo(midway),Math.sqrt(6));looksAt(midway);
  transition.update(1000);assert.ok(camera.position.equals(next.position));
}

// A tiny 2° movement across ±180° must not become an almost full revolution.
{
  const a=pose(origin,179,0,2),b=pose(origin,-179,0,2);start(a,b);transition.update(500);
  assert.ok(camera.position.z < -1.99);transition.cancel();assert.equal(transition.update(750),false);
}

// Exact poles have no horizontal azimuth; a valid saved orientation supplies it.
{
  const a=pose(origin,0,90,2),b=pose(origin,140,-89.99999,3);start(a,b);
  for(let ms=0;ms<=1000;ms+=25){transition.update(ms);assert.ok(camera.position.toArray().every(Number.isFinite));near(camera.quaternion.length(),1);assert.ok(camera.position.length()>1.99);}
  pose(b.focus,140,-89.99999,3);start(a,b,true);assert.equal(transition.active,false);assert.ok(camera.position.equals(b.position));
}
console.log('Inspection return: antipodal orbit, moving focus, yaw wrap, polar poses, cancellation and reduced motion passed.');
