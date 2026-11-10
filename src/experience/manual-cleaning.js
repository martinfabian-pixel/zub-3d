const clamp = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

// Keep both the approach and the physical working travel on the measured
// corridor. The first part moves the tip from outside to the path entrance;
// the remainder maps directly to createCleaningPath's certified tip range.
const APPROACH = .12;
const CONTACT_START = .10;
const MIN_PASS = .18;
const REQUIRED_TRAVEL = 2.4;
const TIME_CONSTANT = .045;

/**
 * The caller converts a drag projected onto the path to normalized deltas.
 * This object has no clock or render loop; update it from the scene's single
 * frame loop, and apply `state.pose` and `state.cleaningProgress` to the
 * existing brush and plaque models. No story timeline values are mutated.
 */
export function createManualCleaning() {
  const pose = {visibility:1, alignment:0, insertion:0, stroke:0, withdrawal:0, phase:'align'};
  const state = {phase:'ready', position:0, target:0, dragging:false, moving:false,
    cleaningProgress:0, furthestInsertion:0, travelled:0, completedPasses:0, pose};
  let segmentDirection=0, segmentLength=0;

  function reset() {
    Object.assign(state,{phase:'ready', position:0, target:0, dragging:false, moving:false,
      cleaningProgress:0, furthestInsertion:0, travelled:0, completedPasses:0});
    Object.assign(pose,{visibility:1, alignment:0, insertion:0, stroke:0, withdrawal:0, phase:'align'});
    segmentDirection=0;segmentLength=0;
    return state;
  }
  function beginDrag() {
    if(state.phase==='result')return false;
    state.dragging=true;
    return true;
  }
  function dragBy(delta) {
    if(!state.dragging||state.phase==='result'||!Number.isFinite(delta))return false;
    state.target=clamp(state.target+delta);
    state.moving=Math.abs(state.target-state.position)>1e-5;
    return state.moving;
  }
  function endDrag() { state.dragging=false; }
  function update(dtSeconds) {
    if(state.phase==='result')return state;
    const dt=Math.max(0,Math.min(Number.isFinite(dtSeconds)?dtSeconds:0,.1));
    const before=pose.insertion;
    state.position+= (state.target-state.position)*(1-Math.exp(-dt/TIME_CONSTANT));
    if(Math.abs(state.target-state.position)<1e-5)state.position=state.target;
    state.moving=Math.abs(state.target-state.position)>1e-5;
    pose.alignment=clamp(state.position/APPROACH);
    pose.insertion=clamp((state.position-APPROACH)/(1-APPROACH));
    pose.stroke=pose.insertion;
    const difference=Math.max(0,pose.insertion-CONTACT_START)-Math.max(0,before-CONTACT_START);
    if(Math.abs(difference)>1e-8) {
      const direction=Math.sign(difference);
      if(direction!==segmentDirection) {
        if(segmentDirection&&segmentLength>=MIN_PASS)state.completedPasses++;
        segmentDirection=direction;segmentLength=0;
      }
      segmentLength+=Math.abs(difference);
      state.travelled+=Math.abs(difference);
    }
    state.furthestInsertion=Math.max(state.furthestInsertion,pose.insertion);
    // The existing plaque shader interprets this as a swept front. Never
    // advance it past the deepest position actually visited by the bristles.
    const reach=clamp((state.furthestInsertion-CONTACT_START)/(1-CONTACT_START));
    state.cleaningProgress=Math.min(reach,clamp(state.travelled/REQUIRED_TRAVEL));
    const complete=state.furthestInsertion>=.98&&state.completedPasses>=3&&
      segmentLength>=MIN_PASS&&state.travelled>=REQUIRED_TRAVEL;
    if(complete) {
      state.phase='result';state.cleaningProgress=reach;state.target=state.position;
      state.moving=false;state.dragging=false;pose.phase='stroke';
    } else if(state.furthestInsertion>=.30) {
      state.phase='clean';pose.phase='stroke';
    } else if(state.position>.005) {
      state.phase='insert';pose.phase='insert';
    } else {state.phase='ready';pose.phase='align';}
    return state;
  }
  return {state,reset,beginDrag,dragBy,endDrag,update};
}
