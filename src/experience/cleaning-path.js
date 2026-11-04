import { Vector3 } from 'three';

// World distances are centimetres. Keep small instrument specifications, path
// ordinates and surface-clearance measurements in millimetres throughout.
export const MM_TO_WORLD = 0.1;
export const saturate = n => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
const smooth = t => { t=saturate(t);return t*t*(3-2*t); };
const up = new Vector3(0,1,0), forward = new Vector3(0,0,1);
function positive(value, label) {
  if (!(Number.isFinite(value) && value>0)) throw new Error('Invalid brush measurement: '+label);
  return value;
}
function vec(values, label) {
  if (!Array.isArray(values) || values.length!==3 || !values.every(Number.isFinite)) throw new Error('Invalid world position: '+label);
  return new Vector3().fromArray(values);
}
function bounds(values,label) {
  if (!Array.isArray(values) || values.length!==2 || !values.every(Number.isFinite) || values[1]<=values[0]) throw new Error('Invalid '+label);
  return values.slice();
}

export function makePathSample() {
  return {position:new Vector3(),tangent:new Vector3(),xAxis:new Vector3(),zAxis:new Vector3(),
    contacts:[36,37,36,37].map(fdi=>({fdi,distanceMm:Infinity,toward:new Vector3()})),arcMm:0};
}

/**
 * Read the measured 36–37 buccal-to-lingual corridor. Nothing here chooses a
 * Cartesian location for the brush. The authored path and the teeth must be
 * supplied in the same world coordinate system (including the jaw opening).
 */
export function createCleaningPath(site,{depictedTravelMm=11.7}={}) {
  const brush=site?.brush, line=brush?.centerline;
  if (!Array.isArray(line) || line.length<2) throw new Error('A measured 36–37 brush centerline is required.');
  const dim=brush.dimensionsMm??{};
  const wireRadiusMm=positive(dim.wireRadius??dim.wireDiameter/2,'wire radius');
  const bristleRadiusMm=positive(dim.bristleRadius??dim.bristleDiameter/2,'swept bristle radius');
  const bristledLengthMm=positive(dim.bristledLength,'bristled length');
  if (bristleRadiusMm<=wireRadiusMm) throw new Error('Bristles must extend past the wire.');
  const points=line.map((row,i)=>vec(row.position,'sample '+i));
  const arcs=line.map(row=>row.arcLengthMm);
  const wallPoints=line.map(row=>[36,37,36,37].map((fdi,i)=>{
    const contact=(i<2?(row.contacts??[]):(row.contactsMobile??[])).find(c=>Number(c.fdi)===fdi);
    return contact?.nearestWorld ? vec(contact.nearestWorld,'contact '+fdi) : null;
  }));
  let minWireSurfaceDistanceMm=Infinity;
  for(let i=0;i<line.length;i++) {
    if (!Number.isFinite(arcs[i]) || (i>0 && arcs[i]<=arcs[i-1])) throw new Error('Brush arc lengths must increase.');
    if (i>0) {
      const segmentMm=points[i].distanceTo(points[i-1])/MM_TO_WORLD;
      if (Math.abs(segmentMm-(arcs[i]-arcs[i-1]))>Math.max(.006,segmentMm*.015)) throw new Error('Brush path units do not match world cm.');
    }
    for(const wall of wallPoints[i]) if(wall) minWireSurfaceDistanceMm=Math.min(minWireSurfaceDistanceMm,wall.distanceTo(points[i])/MM_TO_WORLD);
  }
  if(minWireSurfaceDistanceMm<=wireRadiusMm) throw new Error('Rigid brush wire intersects a measured tooth surface.');
  const first=arcs[0],last=arcs.at(-1),totalMm=last-first;
  const direction=points.at(-1).clone().sub(points[0]).normalize();
  let maxDeviationMm=0;
  const relative=new Vector3();
  for(const p of points) {
    relative.copy(p).sub(points[0]);relative.addScaledVector(direction,-relative.dot(direction));
    maxDeviationMm=Math.max(maxDeviationMm,relative.length()/MM_TO_WORLD);
  }
  // The appliance is a rigid, straight wire. Refuse a bent corridor rather
  // than drawing the chord through a tooth when the guide asset is replaced.
  if(maxDeviationMm>.025) throw new Error('This rigid brush requires a straight, clearance-audited corridor.');
  const surveyedTipRangeMm=bounds(brush.tipRangeMm??brush.tipTravelRangeMm??[first,last],'surveyed brush tip range');
  // The full 14.345 mm certified corridor remains intact. The depicted passes
  // end sooner so the bristled portion remains legible in the contact rather
  // than disappearing behind 37. Reach thresholds use this *same* travel.
  const tipRangeMm=[surveyedTipRangeMm[0],Math.min(surveyedTipRangeMm[1],surveyedTipRangeMm[0]+positive(depictedTravelMm,'depicted tip travel'))];
  const contactRangeMm=bounds(brush.contactRangeMm??[first,last],'brush contact range');
  const approachMm=positive(dim.approachTravel??2.0,'outside approach');
  const tipMarginMm=positive(dim.bareTipLength??dim.frontBristleInset??Math.max(.12,wireRadiusMm*1.6),'tip margin');
  const fiberRadiusMm=positive(dim.filamentRadius??.018,'filament radius');
  const ferruleBackMm=positive(dim.exposedHeadLength??dim.tipToFerrule??Math.max(bristledLengthMm+1.8,tipRangeMm[1]-first+1.2),'tip to ferrule');
  if(Number.isFinite(brush.maxFerruleNoseArcMm)&&tipRangeMm[1]-ferruleBackMm>brush.maxFerruleNoseArcMm)
    throw new Error('Brush ferrule would enter the restricted corridor.');
  const dimensions={wireRadiusMm,bristleRadiusMm,bristledLengthMm,fiberRadiusMm,tipMarginMm,ferruleBackMm,
    ferruleRadiusMm:positive(dim.ferruleRadius??.65,'ferrule radius'),
    handleLengthMm:positive(dim.handleLength??18,'handle length'),handleRadiusMm:positive(dim.handleRadius??1.65,'handle radius')};
  const xAxis=up.clone().addScaledVector(direction,-up.dot(direction));
  if(xAxis.lengthSq()<.01)xAxis.copy(forward).addScaledVector(direction,-forward.dot(direction));
  xAxis.normalize();
  const zAxis=xAxis.clone().cross(direction).normalize();
  const reachStart=tipRangeMm[0]+.1*(tipRangeMm[1]-tipRangeMm[0]);
  const reachSpan=tipRangeMm[1]-reachStart;

  function sample(arcMm,out=makePathSample()) {
    let lo=0,hi=arcs.length-1;
    while(hi-lo>1){const m=(lo+hi)>>1;if(arcs[m]<=arcMm)lo=m;else hi=m;}
    const t=(arcMm-arcs[lo])/(arcs[hi]-arcs[lo]);
    out.position.copy(points[lo]).lerp(points[hi],t);
    out.tangent.copy(direction);out.xAxis.copy(xAxis);out.zAxis.copy(zAxis);out.arcMm=arcMm;
    for(let j=0;j<4;j++) {
      const c=out.contacts[j],a=wallPoints[lo][j],b=wallPoints[hi][j];
      if(t<0 || t>1 || !a || !b) {c.distanceMm=Infinity;c.toward.set(0,0,0);continue;}
      c.toward.copy(a).lerp(b,t).sub(out.position);
      c.distanceMm=c.toward.length()/MM_TO_WORLD;
      if(c.distanceMm>0)c.toward.multiplyScalar(1/(c.distanceMm*MM_TO_WORLD));
    }
    return out;
  }
  function tipArcMm(insertion,alignment=1) {
    return tipRangeMm[0]+saturate(insertion)*(tipRangeMm[1]-tipRangeMm[0])-(1-saturate(alignment))*approachMm;
  }
  function nearest(worldPoint,out={}) {
    let best=Infinity,bestArc=first;
    for(let i=0;i+1<points.length;i++) {
      const a=points[i],b=points[i+1],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
      const t=saturate(((worldPoint.x-a.x)*dx+(worldPoint.y-a.y)*dy+(worldPoint.z-a.z)*dz)/(dx*dx+dy*dy+dz*dz));
      const x=worldPoint.x-a.x-t*dx,y=worldPoint.y-a.y-t*dy,z=worldPoint.z-a.z-t*dz,q=x*x+y*y+z*z;
      if(q<best){best=q;bestArc=arcs[i]+t*(arcs[i+1]-arcs[i]);}
    }
    out.distanceMm=Math.sqrt(best)/MM_TO_WORLD;out.arcMm=bestArc;return out;
  }
  // A tapered end, a full-diameter working portion, then a small trailing
  // taper. The same envelope drives filament construction and reach tests.
  function radiusAt(backMm) {
    const t=saturate((backMm-tipMarginMm)/bristledLengthMm);
    return bristleRadiusMm*(.52+.48*smooth(t/.20))*(1-.13*smooth((t-.82)/.18));
  }
  function sweepThreshold(distanceMm,arcMm,out={}) {
    out.start=1;out.end=2;out.reach=0;
    if(!Number.isFinite(distanceMm)||!Number.isFinite(arcMm)||distanceMm<0||distanceMm>=bristleRadiusMm)return out;
    // Find the first axial ring long enough for this part of the coating.
    let lo=tipMarginMm,hi=tipMarginMm+bristledLengthMm*.20;
    for(let i=0;i<12;i++){const mid=(lo+hi)*.5;if(radiusAt(mid)>=distanceMm)hi=mid;else lo=mid;}
    const firstContact=arcMm+hi;
    if(arcMm+tipMarginMm+bristledLengthMm<tipRangeMm[0]||firstContact>=tipRangeMm[1])return out;
    out.start=Math.max(0,(firstContact-reachStart)/reachSpan);
    out.end=Math.max(out.start+.015,(firstContact+.28-reachStart)/reachSpan);
    out.reach=1-smooth((distanceMm/bristleRadiusMm-.94)/.06);
    return out;
  }
  function removedFraction(progress,threshold) {
    return threshold.reach*smooth((saturate(progress)-threshold.start)/(threshold.end-threshold.start));
  }
  return {sample,nearest,tipArcMm,radiusAt,sweepThreshold,removedFraction,dimensions,contactRangeMm,tipRangeMm,totalMm,
    startWorld:points[0].clone(),directionWorld:direction.clone(),firstArcMm:first,
    report:()=>({pathLengthMm:totalMm,depictedTravelMm:tipRangeMm[1]-tipRangeMm[0],surveyedTipRangeMm:[...surveyedTipRangeMm],samples:points.length,maxChordDeviationMm:maxDeviationMm,
      certifiedWireRadialMarginMm:brush.rigidEnvelope?.wireRadialMarginLowerBoundMm??null,
      maxActualFerruleNoseArcMm:tipRangeMm[1]-ferruleBackMm,allowedFerruleNoseArcMm:brush.maxFerruleNoseArcMm??null,
      minMeasuredWireClearanceMm:Number.isFinite(minWireSurfaceDistanceMm)?minWireSurfaceDistanceMm-wireRadiusMm:null,
      tipRangeMm:[...tipRangeMm],contactRangeMm:[...contactRangeMm],...dimensions})};
}
