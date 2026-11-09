import {
  Color, Curve, CylinderGeometry, DynamicDrawUsage, Group, InstancedMesh, LatheGeometry,
  Matrix4, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Quaternion, SphereGeometry,
  TubeGeometry, Vector2, Vector3,
} from 'three';
import { makePathSample, MM_TO_WORLD as mm, saturate } from './cleaning-path.js';

const Y=new Vector3(0,1,0),TAU=Math.PI*2;
// Repeatable, bounded variations in filament length/tone, not random geometry
// placement in the mouth. Pairs of nylon fibres emerge from a twisted wire.
const noise=n=>{const k=Math.sin(n*17.117+51.31)*14563.795;return k-Math.floor(k);};
class WireStrand extends Curve {
  constructor(span,radius,pitch,phase){super();Object.assign(this,{span,radius,pitch,phase});}
  getPoint(t,out=new Vector3()){
    const along=t*this.span,angle=this.phase+TAU*along/this.pitch;
    return out.set(this.radius*Math.cos(angle)*mm,-along*mm,this.radius*Math.sin(angle)*mm);
  }
}

export function createInterdentalBrush({path,compact=false,options={}}) {
  const dims=path.dimensions;
  const {wireRadiusMm:wr,bristledLengthMm:length,fiberRadiusMm:fr,ferruleBackMm:span}=dims;
  const object=new Group();object.name='Interdental brush';object.userData.kind='interdental-brush';
  // During the approach/withdrawal fade, composite this foreground instrument
  // after the already deposited coating. A nearly invisible depth-writing
  // filament must not cut a white hole out of a transparent plaque overlay.
  object.renderOrder=6;
  const geometries=new Set(),materials=new Set();
  function part(name,geometry,material) {
    geometry.computeBoundingSphere();
    const mesh=new Mesh(geometry,material);mesh.name=name;mesh.userData.kind='interdental-brush';
    mesh.castShadow=false;mesh.receiveShadow=true;
    geometries.add(geometry);materials.add(material);object.add(mesh);return mesh;
  }
  // An original, unbranded handle: narrow ferrule, gently convex flattened
  // grip and a rounded heel. Its long end remains outside the embrasure.
  const polymer=new MeshPhysicalMaterial({color:options.handleColor??'#7351a0',roughness:.37,
    metalness:0,ior:1.46,clearcoat:.12,clearcoatRoughness:.42});
  const steel=new MeshStandardMaterial({color:'#d4d3d1',metalness:.87,roughness:.29});
  // A soft nylon reflection stays continuous along the tapered segments;
  // bright pin-point glints on subpixel tips read as unrelated speckles.
  const nylon=new MeshPhysicalMaterial({color:0xffffff,metalness:0,roughness:.58,ior:1.50,specularIntensity:.46});
  const handleL=dims.handleLengthMm,handleR=dims.handleRadiusMm;
  const profile=[
    [1,0],[.995,.28],[.98,.66],[.95,.89],[.9,.975],[.73,1],[.56,.985],
    [.42,.93],[.31,.81],[.21,.65],[.13,.51],[.075,.47],[.035,.455],[.012,dims.ferruleRadiusMm/handleR],[0,dims.ferruleRadiusMm/handleR],[0,0],
  ].map(([t,r])=>new Vector2(r*handleR*mm,-(span+t*handleL)*mm));
  const handle=part('Brush · satin violet grip',new LatheGeometry(profile,compact?20:32),polymer);handle.scale.z=.73;
  // Tiny moulded relief along the flattened sides is part of the form, with
  // no brand lettering, medical colour-code claim or giant decorative rings.
  const neckR=dims.ferruleRadiusMm;
  const neck=part('Brush · ferrule',new CylinderGeometry(neckR*mm,neckR*mm,.24*mm,compact?12:20),
    new MeshStandardMaterial({color:options.ferruleColor??'#5b4280',roughness:.4,metalness:0}));
  neck.position.y=-(span+.12)*mm;neck.scale.z=.8;
  const pitch=Math.max(.30,wr*4.5);
  for(let i=0;i<2;i++){
    const curve=new WireStrand(span,wr*.49,pitch,i*Math.PI);
    part('Brush · steel strand '+(i+1),new TubeGeometry(curve,
      Math.max(28,Math.ceil(span/pitch*(compact?7:11))),wr*.30*mm,compact?4:6,false),steel);
  }
  const cap=part('Brush · rounded wire end',new SphereGeometry(wr*mm,10,6),steel);
  cap.scale.y=.82;

  const pairs=compact?176:200,filamentCount=pairs*2;
  const bristles=new InstancedMesh(new CylinderGeometry(.76,1,1,compact?4:5,1,false),nylon,filamentCount*2);
  bristles.name='Brush · tapered nylon fibres';bristles.userData.kind='interdental-brush';
  bristles.instanceMatrix.setUsage(DynamicDrawUsage);bristles.frustumCulled=false;
  bristles.castShadow=false;bristles.receiveShadow=true;object.add(bristles);
  geometries.add(bristles.geometry);materials.add(nylon);
  const fibres=[],sample=makePathSample(),station=makePathSample();
  const color=new Color(),baseTone=new Color('#c1c6ca'),tipTone=new Color('#efeeeb');
  for(let i=0;i<pairs;i++){
    const t=(i+.5)/pairs,back=dims.tipMarginMm+t*length;
    const angle=TAU*back/pitch+Math.PI*.5+(noise(i+2)-.5)*.19;
    for(let side=0;side<2;side++) {
      const f=i*2+side,theta=angle+side*Math.PI+(noise(f+19)-.5)*.12;
      fibres.push({back,c:Math.cos(theta),s:Math.sin(theta),radius:path.radiusAt(back)*(.955+.045*noise(f+5)),
        rake:.025+.05*noise(f+47),thickness:fr*(.90+.16*noise(f+23))});
      const tone=noise(f+64);
      color.copy(baseTone).lerp(tipTone,.08+.12*tone);bristles.setColorAt(2*f,color);
      color.copy(baseTone).lerp(tipTone,.67+.16*tone);bristles.setColorAt(2*f+1,color);
    }
  }
  const from=new Vector3(),mid=new Vector3(),tip=new Vector3(),delta=new Vector3(),center=new Vector3();
  const q=new Quaternion(),scale=new Vector3(),matrix=new Matrix4(),basis=new Matrix4();
  let disposed=false,lastArc=NaN,lastFitArc=NaN,lastStroke=NaN,lastVisibility=NaN,bent=0,minPlaneGapMm=Infinity;
  let insertion=0,alignment=0,phase='hidden';
  function segment(index,a,b,r) {
    delta.subVectors(b,a);
    const l=delta.length();if(l<=0)return;
    q.setFromUnitVectors(Y,delta.multiplyScalar(1/l));center.copy(a).add(b).multiplyScalar(.5);
    scale.set(r*mm,l,r*mm);matrix.compose(center,q,scale);bristles.setMatrixAt(index,matrix);
  }
  function fitFibres(arc,stroke) {
    bent=0;minPlaneGapMm=Infinity;
    for(let i=0;i<fibres.length;i++){
      const f=fibres[i];
      if((i&1)===0)path.sample(arc-f.back,station);
      let radius=f.radius,rake=f.rake;
      for(let pass=0;pass<2;pass++) {
        for(const wall of station.contacts) {
          if(!Number.isFinite(wall.distanceMm))continue;
          const radialProjection=f.c*station.xAxis.dot(wall.toward)+f.s*station.zAxis.dot(wall.toward);
          if(radialProjection<=.02)continue;
          const alongProjection=station.tangent.dot(wall.toward);
          const limit=(wall.distanceMm-f.thickness*1.12+rake*alongProjection)/radialProjection;
          radius=Math.min(radius,Math.max(wr+f.thickness,limit));
        }
        // Nylon yields backward along the shaft, it never rotates like a bur.
        if(pass===0)rake+=Math.max(0,f.radius-radius)*(.55+.16*stroke);
      }
      if(radius<f.radius-.001)bent++;
      for(const wall of station.contacts) {
        if(!Number.isFinite(wall.distanceMm))continue;
        const rp=f.c*station.xAxis.dot(wall.toward)+f.s*station.zAxis.dot(wall.toward);
        minPlaneGapMm=Math.min(minPlaneGapMm,wall.distanceMm-radius*rp+rake*station.tangent.dot(wall.toward)-f.thickness);
      }
      const baseR=wr*.55,midR=baseR+(radius-baseR)*.56;
      from.set(f.c*baseR,-f.back,f.s*baseR).multiplyScalar(mm);
      mid.set(f.c*midR,-f.back-rake*.22,f.s*midR).multiplyScalar(mm);
      tip.set(f.c*radius,-f.back-rake,f.s*radius).multiplyScalar(mm);
      segment(i*2,from,mid,f.thickness);segment(i*2+1,mid,tip,f.thickness*.82);
    }
    bristles.instanceMatrix.needsUpdate=true;
  }
  function setPose(pose={}) {
    if(disposed)return;
    const visibility=saturate(Number(pose.visibility??pose.visible??0));
    insertion=saturate(Number(pose.insertion??0));alignment=saturate(Number(pose.alignment??1));
    phase=pose.phase??'';const stroke=saturate(Number(pose.stroke??0));
    object.visible=visibility>.0001;
    if(visibility!==lastVisibility) {
      for(const material of materials){
        const fading=visibility<.99999;
        if(material.transparent!==fading){material.transparent=fading;material.needsUpdate=true;}
        material.opacity=visibility;material.depthWrite=true;
      }
      lastVisibility=visibility;
    }
    const arc=path.tipArcMm(insertion,alignment);
    if(arc!==lastArc){
      path.sample(arc,sample);object.position.copy(sample.position);
      basis.makeBasis(sample.xAxis,sample.tangent,sample.zAxis);object.quaternion.setFromRotationMatrix(basis);lastArc=arc;
    }
    // Even hidden transforms are a function of the current story sample.
    // Avoid rebuilding invisible fibre instances while scrolling other chapters.
    if(!object.visible){bent=0;minPlaneGapMm=Infinity;lastFitArc=NaN;return;}
    if(arc===lastFitArc&&stroke===lastStroke)return;
    fitFibres(arc,stroke);lastFitArc=arc;lastStroke=stroke;
  }
  function dispose(){
    if(disposed)return;disposed=true;object.removeFromParent();bristles.dispose();
    for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();
    object.clear();fibres.length=0;geometries.clear();materials.clear();
  }
  setPose({visibility:0,alignment:0});
  return {object,setPose,dispose,report:()=>({visible:object.visible,visibility:lastVisibility,phase,insertion,alignment,
    tipArcMm:Number.isFinite(lastArc)?lastArc:null,tipWorld:object.position.toArray(),filaments:filamentCount,
    filamentInstances:bristles.count,bentFilaments:bent,approxMinFibreGapToSampledTangentPlanesMm:Number.isFinite(minPlaneGapMm)?minPlaneGapMm:null,
    tipToFerruleMm:span,disposed})};
}
