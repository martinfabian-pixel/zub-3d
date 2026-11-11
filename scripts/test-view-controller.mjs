import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {createViewController} from '../src/experience/view-controller.js';
import {createJourneyCamera} from '../src/experience/camera.js';
const config={interaction:{minimumDistanceFraction:.68,maximumDistanceFraction:1.7,dampingMs:45,returnDurationMs:480}};
const camera=new PerspectiveCamera(),focus=new Vector3(3,-.7,-1),pose={position:focus.clone().add(new Vector3(0,.7,3)),target:focus};
const view=createViewController({camera,config});view.setStoryPose(pose);view.update(1);
const home=camera.position.clone();view.orbit(.6,.2,2);view.zoomBy(.8,2);
for(let t=16;t<=800;t+=16)view.update(t);
assert.ok(camera.position.distanceTo(home)>.7);assert.ok(Math.abs(view.report().yaw-.6)<1e-4);
assert.ok(Math.abs(view.report().zoom-.8)<1e-4);
const held=camera.position.clone();view.setStoryPose(pose);view.update(900);assert.ok(camera.position.distanceTo(held)<1e-4,'Same story sample must preserve the gesture');
const changed={position:pose.position.clone().add(new Vector3(.1,.1,.3)),target:pose.target.clone().add(new Vector3(.1,.1,0))};
const resizedReturn=view.poseWithOffsets(changed,view.captureDisplayed());
assert.ok(camera.position.equals(held),'Sampling a return destination must not write the displayed camera');
view.setStoryPose(changed);view.update(1000);assert.ok(Math.abs(view.report().zoom-.8)<1e-4,'Fit/resize must not reset user zoom');
assert.ok(camera.position.distanceTo(resizedReturn.position)<1e-4&&view.target.distanceTo(resizedReturn.target)<1e-7,
  'A resized atlas return lands on the same overview as restoring its saved offsets');
view.orbit(Math.PI-.6,-.2,1001);for(let t=1016;t<=1800;t+=16)view.update(t);
view.reset(1801);let min=Infinity;for(let t=1801;t<2300;t+=8){view.update(t);min=Math.min(min,camera.position.distanceTo(view.target));}
assert.ok(min>2,'Returning from the opposite side must not cross the focus');assert.equal(view.active,false);assert.ok(camera.position.distanceTo(changed.position)<1e-7);
view.orbit(.8,.2,2400);for(let t=2416;t<2900;t+=16)view.update(t);view.reset(2900);view.update(3050);
const during=camera.position.clone();view.orbit(.02,0,3050);view.update(3051);assert.ok(camera.position.distanceTo(during)<.02,'Grabbing during a return must continue from the displayed view');
view.reset(3200,true);assert.ok(camera.position.distanceTo(changed.position)<1e-7);assert.equal(view.active,false);
const sample={sampleInto(out){out.position.set(1,2,3);out.target.set(0,0,0);out.progress=0;return out;},fov:32,near:.01,far:100};
const before=camera.position.clone(),rig=createJourneyCamera({timeline:sample,config:{camera:{}},camera,sampleOnly:true});rig.setProgress(.4);
assert.ok(camera.position.equals(before),'A sample-only story rig must never write the rendered camera');
view.dispose();rig.dispose();console.log('View controller: persistent orbit/zoom, resize, antipodal and interrupted handovers, reduced motion and single camera writer passed.');
