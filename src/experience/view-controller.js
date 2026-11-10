import { MathUtils, Spherical, Vector3 } from 'three';
import { createInspectionReturn } from './inspection.js';

const shortest=a=>Math.atan2(Math.sin(a),Math.cos(a));
const offsetKeys=['yaw','pitch','zoom'];
/** Sole writer of the displayed camera. The timeline only samples a base pose;
 * pointer/keyboard/wheel input changes offsets, never a competing camera rig.
 */
export function createViewController({camera,config}) {
  const settings=config.interaction,basePosition=new Vector3(),baseTarget=new Vector3(),target=new Vector3();
  const focusOffset=new Vector3(),desiredFocus=new Vector3(),offset=new Vector3(),spherical=new Spherical();
  const current={yaw:0,pitch:0,zoom:0},desired={yaw:0,pitch:0,zoom:0};
  const returning=createInspectionReturn(camera,settings.returnDurationMs??480);
  let baseYaw=0,basePitch=0,baseRadius=1,last=0,valid=false,disposed=false;
  const minimum=Math.log(settings.minimumDistanceFraction),maximum=Math.log(settings.maximumDistanceFraction);
  let guidedMinimum=null;
  function writeBase(){camera.position.copy(basePosition);camera.lookAt(baseTarget);camera.updateMatrixWorld(true);}
  function interrupt(now){
    if(!returning.active)return;
    update(now);returning.cancel();
    offset.subVectors(camera.position,target);spherical.setFromVector3(offset);
    current.yaw=desired.yaw=shortest(spherical.theta-baseYaw);
    current.pitch=desired.pitch=Math.PI/2-spherical.phi-basePitch;
    current.zoom=desired.zoom=Math.log(spherical.radius/baseRadius);
    focusOffset.subVectors(target,baseTarget);desiredFocus.copy(focusOffset);
  }
  function update(now=performance.now()) {
    if(disposed||!valid)return false;
    if(returning.active){
      writeBase();returning.destination(baseTarget);const moving=returning.update(now);
      target.copy(returning.target);last=now;return moving;
    }
    const dt=last?Math.min(64,Math.max(1,now-last)):16.67;last=now;
    const a=1-Math.exp(-dt/(settings.dampingMs??45));let moving=false;
    for(const key of offsetKeys){
      current[key]+=a*(desired[key]-current[key]);
      if(Math.abs(desired[key]-current[key])<1e-5)current[key]=desired[key];else moving=true;
    }
    focusOffset.lerp(desiredFocus,a);
    if(focusOffset.distanceToSquared(desiredFocus)<1e-10)focusOffset.copy(desiredFocus);else moving=true;
    target.copy(baseTarget).add(focusOffset);
    const pitch=MathUtils.clamp(basePitch+current.pitch,-Math.PI/2+.04,Math.PI/2-.04),yaw=baseYaw+current.yaw;
    const radius=baseRadius*Math.exp(current.zoom),c=Math.cos(pitch);
    camera.position.set(Math.sin(yaw)*c,Math.sin(pitch),Math.cos(yaw)*c).multiplyScalar(radius).add(target);
    camera.lookAt(target);camera.updateMatrixWorld(true);return moving;
  }
  return {
    target,
    setStoryPose(pose){
      basePosition.copy(pose.position);baseTarget.copy(pose.target);offset.subVectors(basePosition,baseTarget);
      spherical.setFromVector3(offset);baseYaw=spherical.theta;basePitch=Math.PI/2-spherical.phi;baseRadius=spherical.radius;valid=true;
    },
    orbit(yaw,pitch,now=performance.now()){
      if(!valid)return;interrupt(now);desired.yaw+=yaw;
      desired.pitch=MathUtils.clamp(desired.pitch+pitch,-Math.PI/2+.04-basePitch,Math.PI/2-.04-basePitch);
    },
    zoomBy(factor,now=performance.now()){
      if(!valid)return;interrupt(now);
      // A guided close-up may be closer than the regular manual zoom limit.
      // Permit a gradual zoom out from that position rather than snapping to it.
      const nearLimit=guidedMinimum===null?Math.min(minimum,desired.zoom):Math.min(minimum,guidedMinimum);
      desired.zoom=MathUtils.clamp(desired.zoom+Math.log(factor),nearLimit,maximum);
    },
    setGuidedZoomMinimum(fraction=null){
      guidedMinimum=Number.isFinite(fraction)&&fraction>0&&fraction<1?Math.log(fraction):null;
    },
    capture(){return { ...desired, focus:desiredFocus.toArray() };},
    captureDisplayed(){
      spherical.setFromVector3(offset.subVectors(camera.position,target));
      return {yaw:shortest(spherical.theta-baseYaw),pitch:Math.PI/2-spherical.phi-basePitch,
        zoom:Math.log(spherical.radius/baseRadius),focus:offset.subVectors(target,baseTarget).toArray()};
    },
    restore(snapshot,{instant=false}={}){
      if(!valid||!snapshot)return;
      returning.cancel();
      for(const key of offsetKeys)desired[key]=snapshot[key];
      desired.yaw=current.yaw+shortest(snapshot.yaw-current.yaw);
      desiredFocus.fromArray(snapshot.focus);
      if(instant){for(const key of offsetKeys)current[key]=desired[key];focusOffset.copy(desiredFocus);}
    },
    reset(now=performance.now(),instant=false){
      if(!valid)return;
      const position=camera.position.clone(),rotation=camera.quaternion.clone(),focus=target.clone();
      returning.cancel();for(const key of offsetKeys)current[key]=desired[key]=0;
      focusOffset.set(0,0,0);desiredFocus.set(0,0,0);writeBase();
      returning.begin(position,rotation,focus,baseTarget,now,instant);target.copy(returning.active?focus:baseTarget);last=now;
    },
    update,
    report(){return{yaw:current.yaw,pitch:current.pitch,zoom:Math.exp(current.zoom),desiredYaw:desired.yaw,desiredPitch:desired.pitch,desiredZoom:Math.exp(desired.zoom),returning:returning.active,focusOffset:focusOffset.toArray()};},
    get active(){return returning.active;},
    get modified(){return Math.abs(desired.yaw)+Math.abs(desired.pitch)+Math.abs(desired.zoom)+desiredFocus.length()>1e-5;},
    dispose(){disposed=true;returning.cancel();},
  };
}
