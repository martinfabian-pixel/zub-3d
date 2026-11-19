import {
  Box3, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, MathUtils,
  Matrix4, Mesh, MeshStandardMaterial, Ray, RepeatWrapping, Vector3,
} from 'three';
import { createBoneSectionMaps } from './exploded-tooth-socket.js';

// Follow the native CEJ landmarks along the arch, from the patient's right to left.
const rows = [[17,16,15,14,13,12,11,21,22,23,24,25,26,27], [47,46,45,44,43,42,41,31,32,33,34,35,36,37]];
const { clamp, lerp, smoothstep } = MathUtils;
const up = new Vector3(0,1,0);
const v = new Vector3();
const gum = new Color('#c58283'), marginal = new Color('#d59b97');

function fitRow(teeth, row, layout) {
  const rings = row.map(fdi => {
    const item=teeth.get(fdi);
    const points=item.entry.cervicalRing.map(sample => {
      const p=new Vector3().fromArray(sample);
      // The crown geometry has its mirror baked into the vertices. Native
      // rings, on the other hand, are stored before the authoring transform.
      if(layout && item.entry.reflected)p.x*=-1;
      return p.applyMatrix4(layout?.get(fdi)??item.matrix);
    });
    const center=points.reduce((sum,p)=>sum.add(p),new Vector3()).divideScalar(points.length);
    return {points,center};
  });
  const last=rings.length-1;
  for(let i=0;i<rings.length;i++) {
    const r=rings[i], tangent=rings[Math.min(i+1,last)].center.clone().sub(rings[Math.max(0,i-1)].center);
    tangent.y=0;
    r.out=new Vector3().crossVectors(tangent.normalize(),up);
    r.front=Math.max(...r.points.map(p=>v.subVectors(p,r.center).dot(r.out)));
    r.back=-Math.min(...r.points.map(p=>v.subVectors(p,r.center).dot(r.out)));
    const face=r.points.reduce((a,b)=>v.subVectors(a,b).dot(r.out)>0?a:b);
    r.faceY=face.y-r.center.y;
    const item=teeth.get(row[i]),positions=item.mesh?.geometry.attributes.position,upper=row[i]<30;
    r.rootFront=r.front;r.rootBack=r.back;r.rootDepth=1.43;
    if(row[i]===36&&!layout)r.apicalProfile=new Float32Array(48);
    if(!layout&&positions){
      for(let n=0;n<positions.count;n++){
        v.fromBufferAttribute(positions,n).applyMatrix4(item.seatedMatrix).sub(r.center);
        const depth=(upper?1:-1)*v.y;
        if(depth<.06)continue;
        r.rootDepth=Math.max(r.rootDepth,depth);
        const buccal=v.dot(r.out);
        r.rootFront=Math.max(r.rootFront,buccal);
        r.rootBack=Math.max(r.rootBack,-buccal);
        if(r.apicalProfile){
          const bin=clamp(Math.floor((v.dot(tangent)+.8)*30),0,r.apicalProfile.length-1);
          r.apicalProfile[bin]=Math.max(r.apicalProfile[bin],depth);
        }
      }
    }
    if(r.apicalProfile)r.tangent=tangent;
  }
  return rings;
}

function sliceAt(rings,s,upper) {
  const last=rings.length-1, i=clamp(Math.floor(s),0,last-1), f=s-i, w=clamp(f,0,1);
  const a=rings[i],b=rings[i+1], center=a.center.clone().lerp(b.center,f);
  const out=a.out.clone().lerp(b.out,w).normalize();
  const bell=Math.sin(Math.PI*w)**2;
  // The papilla rises between adjacent teeth. Its facial crest turns inward
  // around their line angles while the attached gum retains a wider body.
  const papilla=s>0&&s<last?bell:0;
  const tail=s<0?-s:s>last?s-last:0;
  const cap=1-.95*smoothstep(tail,.32,.63);
  let socketDepth=1.36;
  const molar=rings[12];
  if(molar.apicalProfile?.some(Boolean)&&Math.abs(s-12)<1){
    // Project the actual root tips onto the face of the block. Gently round
    // the seat below each apex and retain a small bony septum at the fork.
    const bin=(v.subVectors(center,molar.center).dot(molar.tangent)+.8)*30;
    let sum=0,weight=0;
    for(let j=Math.max(0,Math.floor(bin)-3);j<=Math.min(47,Math.ceil(bin)+3);j++){
      const w=Math.exp(-((bin-j)**2)*.29);
      sum+=w*molar.apicalProfile[j];weight+=w;
    }
    if(weight>0)socketDepth=clamp(sum/weight+.11+(center.y-molar.center.y),.63,1.47);
  }
  return {s,center,out,papilla,cap,sign:upper?-1:1,
    front:lerp(a.front,b.front,w)*cap,back:lerp(a.back,b.back,w)*cap,
    deepFront:lerp(a.rootFront,b.rootFront,w)*cap,deepBack:lerp(a.rootBack,b.rootBack,w)*cap,
    depth:lerp(a.rootDepth,b.rootDepth,w),socketDepth,
    faceY:lerp(a.faceY,b.faceY,w)};
}

// Cross-section perimeter, clockwise from the lingual cervical edge.
// Three additional vertices between the upper rim and the side wall form
// a genuine capped notch. They coincide on the intact gum.
const shell=[
  [-.97,.09],[-.95,.025],[-.70,0],[-.35,-.014],[0,-.017],[.36,-.01],
  [.69,0],[.90,.010],[.97,.033],[1,.068],
];
const exterior=[
  [1,.00],[1.034,.08],[1.06,.23],[1.045,.47],[.98,.75],[.87,.90],
  [.72,.97],[.45,1],[0,1],[-.48,.99],[-.78,.95],[-.94,.83],[-1,.58],[-1.04,.28],[-1.02,.10],[-.97,0],
];

function profile(slice,pose) {
  const {s,center,out,sign,papilla,front,back,cap}=slice;
  const smile=pose==='smile';
  const window=pose==='window'?1-smoothstep(Math.abs(s-12),.47,.85):0;
  const access=pose==='access'?1-smoothstep(Math.abs(s-12.5),.16,.49):0;
  const sectionFootprint=sign>0?smoothstep(s,10.0,10.85):0;
  const deepSection=pose==='window'||pose==='access';
  const depth=(smile?.27:lerp(.57,slice.depth+.22,deepSection?sectionFootprint:0))*(.86+.14*cap);
  const outer=front+.055*cap, inner=back+.054*cap;
  const frontTop=front*(.96-.19*papilla);
  const backTop=back*(.96-.12*papilla);
  const retreat=window*(frontTop+back*.56);
  const edgeHeight=.105+.192*papilla+sign*slice.faceY*.52+(smile?.038:0);
  const crownHeight=u => edgeHeight+(1-Math.abs(u))*(.014+.042*papilla)-.38*access;
  const floorDepth=1.48;
  const cv=(r,y)=>new Vector3(center.x+out.x*r,center.y+sign*y,center.z+out.z*r);
  const roof=shell.map(([u,d])=>{
    let r=u<0?u*backTop:u*frontTop;
    // Narrow the remaining occlusal tissue to the lingual side of the cut.
    r-=retreat*(u+1)*.5;
    return cv(r,crownHeight(u)-d);
  });
  const lipY=crownHeight(1)-.068, lipR=frontTop-retreat;
  const cutY=lipY-.080*window;
  const lowest=lerp(lipY,-floorDepth,window);
  const bed=lerp(lipY,-slice.socketDepth,window);
  const faceR=lipR-.025*window;
  const cutLip=[roof.at(-1),cv(faceR,cutY)];
  const face=[];
  // Slightly recessed cancellous bed and denser cortical ledge. Both roots
  // intersect this face, preserving their seated registration when rotated.
  for(let j=0;j<=10;j++){
    const u=j/10;
    const flute=.035*Math.cos((s-12)*9.2)*Math.sin(Math.PI*u)*window;
    face.push(cv(faceR+flute,lerp(cutY,bed,u)));
  }
  const outerEdge=lerp(frontTop,outer,window);
  const ledge=[0,.19,.48,.82,1].map(u=>cv(lerp(faceR,outerEdge,u),lerp(bed,lowest,smoothstep(u,.12,1))));
  ledge[0]=face.at(-1);
  const side=exterior.map(([r,d])=>{
    const bulk=smile?0:smoothstep(d,.015,.35);
    const basalFront=lerp(outer,slice.deepFront+.145*cap,bulk);
    const basalBack=lerp(inner,slice.deepBack+.145*cap,bulk);
    // A soft eminence over each socket breaks up the buccal body.
    const lobe=(1-.069*papilla*Math.sin(Math.PI*d));
    if(r<0) {
      // The oral side remains intact when the near side is sectioned.
      const h=lerp(crownHeight(-1)-.09,-depth,d);
      return cv(r*basalBack*lobe,h);
    }
    return cv(lerp(frontTop,basalFront*lobe,smoothstep(d,0,.24)+window*(1-smoothstep(d,0,.24)))*r,
      lerp(lowest,-depth,d));
  });
  // Keep the exposed floor and marginal edge watertight at both extremes.
  side[0]=ledge.at(-1); side[side.length-1]=roof[0];
  return [roof,cutLip,face,ledge,side];
}

const tones=[.94,.49,0,0,.18];
const boneStrip=strip=>strip===2||strip===3;
function buildPatch(row,smileRow,upper,start,end,steps,maps,name) {
  const poses=['closed','smile','window','access'];
  const positions=poses.map(()=>[]), colors=[],uv=[], indices=[[],[]], batches=[];
  const lengths=[shell.length,2,11,5,exterior.length];
  const stride=lengths.reduce((total,n)=>total+n,0);
  const tint=new Color(),run=Array(stride).fill(0),previous=[];
  for(let col=0;col<=steps;col++) {
    const s=lerp(start,end,col/steps);
    const native=sliceAt(row,s,upper), smile=sliceAt(smileRow,s,upper);
    const profiles=poses.map(pose=>profile(pose==='smile'?smile:native,pose));
    let offset=0;
    for(let band=0;band<lengths.length;band++) {
      const n=lengths[band],bone=boneStrip(band);
      let across=0;
      for(let j=0;j<n;j++){
        const t=j/(n-1);
        for(let k=0;k<poses.length;k++)profiles[k][band][j].toArray(positions[k],positions[k].length);
        const bright=band===4?.14+.45*Math.abs(t-.5)*2:tones[band];
        tint.copy(gum).lerp(marginal,bright).multiplyScalar(1+.028*Math.sin(s*2.6+t*.8)+.015*Math.cos(s*8.2-t*3));
        colors.push(tint.r,tint.g,tint.b);
        // Measure the open surface, including the oblique walls and the
        // ledge beneath the apices. UV density stays in actual centimetres.
        const sample=profiles[2][band][j],slot=offset+j;
        if(previous[slot])run[slot]+=sample.distanceTo(previous[slot]);
        previous[slot]=sample;
        if(j)across+=sample.distanceTo(profiles[2][band][j-1]);
        uv.push(run[slot]*1.03,across*1.43);
        if(!col||!j)continue;
        const d=col*stride+offset+j, a=d-stride-1,b=d-stride,c=d-1;
        // Camera-facing direction depends on whether this row opens up or down.
        if(upper) indices[+bone].push(a,c,b,b,c,d);
        else indices[+bone].push(a,b,c,b,d,c);
      }
      offset+=n;
    }
  }
  // Close both ends of the represented section, including the cut side when
  // surrounding teeth fade. An end cap uses a ring fan only at intact seats.
  for(const col of [0,steps]){
    const capStart=colors.length/3;
    const centerIndex=capStart+stride;
    for(let k=0;k<positions.length;k++){
      const p=positions[k],base=col*stride*3,ring=p.slice(base,base+stride*3),center=new Vector3();
      for(let i=0;i<stride;i++)center.add(v.fromArray(ring,i*3));
      p.push(...ring);center.divideScalar(stride).toArray(p,p.length);
    }
    for(let j=0;j<=stride;j++) {colors.push(gum.r,gum.g,gum.b);uv.push(0,0);}
    for(let j=0;j<stride;j++){
      const first=capStart+j,next=capStart+(j+1)%stride;
      indices[0].push(centerIndex,...((col===0)===upper?[next,first]:[first,next]));
    }
  }
  const geometry=new BufferGeometry();
  geometry.setIndex([...indices[0],...indices[1]]);
  geometry.addGroup(0,indices[0].length,0);
  geometry.addGroup(indices[0].length,indices[1].length,1);
  const attributes=positions.map(values=>new Float32BufferAttribute(values,3));
  geometry.setAttribute('position',attributes[0]);geometry.setAttribute('color',new Float32BufferAttribute(colors,3));
  geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));
  geometry.computeVertexNormals();
  const normals=geometry.attributes.normal;
  geometry.morphAttributes.position=[];geometry.morphAttributes.normal=[];
  // Rest, seated crown, open socket and brush access share one topology.
  // Compute all positions and normals once; the GPU blends the displayed pose.
  for(let k=1;k<attributes.length;k++){
    const target=new BufferGeometry();
    target.setIndex(geometry.index);target.setAttribute('position',attributes[k]);target.computeVertexNormals();
    geometry.morphAttributes.position.push(attributes[k]);
    geometry.morphAttributes.normal.push(target.attributes.normal);
  }
  // The closed (zero-area) faces have no geometric normal. Supply their open
  // orientation to avoid unstable shading at the first millimetre of opening.
  const opened=geometry.morphAttributes.normal[1];
  for(let i=0;i<normals.count;i++){
    if(v.fromBufferAttribute(normals,i).lengthSq()<.1)normals.setXYZ(i,opened.getX(i),opened.getY(i),opened.getZ(i));
  }
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const soft=new MeshStandardMaterial({vertexColors:true,roughness:.54,metalness:0,side:DoubleSide,transparent:true});
  soft.forceSinglePass=true;
  const porous=new MeshStandardMaterial({map:maps.color,bumpMap:maps.bump,bumpScale:.0028,roughness:.80,side:DoubleSide,transparent:true});
  porous.forceSinglePass=true;
  const mesh=new Mesh(geometry,[soft,porous]);mesh.name=name;mesh.receiveShadow=true;mesh.visible=false;
  // Keep short longitudinal batches in an envelope containing every pose.
  // Only the few batches under a pointer ever need a morphed triangle test.
  const blockSize=4,groups=Math.ceil(steps/blockSize);
  for(let i=0;i<groups;i++)batches.push({box:new Box3(),faces:[]});
  const idx=geometry.index.array;
  for(let f=0;f<idx.length;f+=3){
    const id=idx[f],column=Math.floor(id/stride);
    const group=column<=steps?Math.min(groups-1,Math.floor(column/blockSize)):column===steps+1?0:groups-1;
    const batch=batches[group];batch.faces.push(f);
    for(const attr of attributes)for(let j=0;j<3;j++)batch.box.expandByPoint(v.fromBufferAttribute(attr,idx[f+j]));
  }
  return {mesh,upper,site:!upper&&start===10.5,batches,attributes,soft,porous};
}

/** A single deforming tissue model follows the presentation and native seats.
 * The opening is an actual notched volume; there is no camera-facing card. */
export function createGingiva(teeth,layout) {
  const object=new Group();object.name='Gingiva and alveolar teaching section';
  const maps=createBoneSectionMaps(.47);
  for(const map of [maps.color,maps.bump])map.wrapS=map.wrapT=RepeatWrapping;
  const parts=[];
  rows.forEach((row,i)=>{
    const upper=i===0, native=fitRow(teeth,row,null),smile=fitRow(teeth,row,layout);
    const sets=upper?[[-.63,13.63,168,'Maxillary gingival margin']]:
      [[-.63,10.5,135,'Mandibular gingival margin'],[10.5,13.63,76,'FDI 35–37 gingiva and alveolar window']];
    for(const [from,to,steps,name] of sets){
      const part=buildPatch(native,smile,upper,from,to,steps,maps,name);
      parts.push(part);object.add(part.mesh);
    }
  });
  const localRay=new Ray(),inverse=new Matrix4(),hit=new Vector3(),delta=new Vector3();
  const vertices=[new Vector3(),new Vector3(),new Vector3()];
  const trimmed=[...teeth.values()].filter(item=>item.finish).map(item=>({
    finish:item.finish,atSite:[35,36,37].includes(item.entry.fdi),
    neck:item.entry.cervicalRing.reduce((s,p)=>s+p[1],0)/item.entry.cervicalRing.length,
    cmPerUnit:new Vector3().setFromMatrixColumn(item.matrix,1).length(),
  }));
  let closure=0;
  function setJawOpening(value=0) {
    for(const {mesh,upper} of parts) {
      mesh.position.y=(upper?.62:-.38)*value-(upper?closure*(1-mesh.morphTargetInfluences[0]):0);
      mesh.updateMatrixWorld();
    }
  }
  return {object,setJawOpening,
    update(state,mix,close){
      closure=close;
      const local=state.siteTissue??0, context=Math.max(state.assemblyReveal,state.finaleReveal);
      for(const {finish,atSite,neck,cmPerUnit} of trimmed) {
        // Leaving the optional open-root atlas may start with no tissue at
        // all. Bring the basal trim in only as the enclosing cuff arrives.
        const atlasRelease=2.5*(1-smoothstep(local+mix,0,.95));
        const depth=.29+atlasRelease+(atSite?1.86*((state.tissueWindow??0)+(state.cleaningWindow??0)):0);
        finish.setGumBase(local>0?neck-depth/cmPerUnit:-1);
      }
      for(const {mesh,site,soft,porous} of parts) {
        const alpha=state.openingFlight?smoothstep(mix,.29,.96):clamp(mix+local*(site?1:context),0,1);
        mesh.visible=alpha>.003;
        soft.opacity=porous.opacity=alpha;
        mesh.morphTargetInfluences[0]=mix;
        mesh.morphTargetInfluences[1]=site?(state.tissueWindow??0):0;
        mesh.morphTargetInfluences[2]=site?(state.cleaningWindow??0):0;
      }
      setJawOpening();
    },
    occludes(ray,near,far){
      for(const {mesh,soft,batches,attributes} of parts){
        if(!mesh.visible||soft.opacity<.60)continue;
        inverse.copy(mesh.matrixWorld).invert();localRay.copy(ray).applyMatrix4(inverse);
        const idx=mesh.geometry.index.array,weights=mesh.morphTargetInfluences;
        const base=1-weights[0]-weights[1]-weights[2];
        for(const {box,faces} of batches){
          if(!localRay.intersectBox(box,hit)||(!box.containsPoint(localRay.origin)&&hit.distanceTo(localRay.origin)>far))continue;
          for(const f of faces){
            for(let j=0;j<3;j++){
              const id=idx[f+j],point=vertices[j];
              point.fromBufferAttribute(attributes[0],id).multiplyScalar(base);
              for(let k=0;k<weights.length;k++)if(weights[k])point.addScaledVector(v.fromBufferAttribute(attributes[k+1],id),weights[k]);
            }
            if(localRay.intersectTriangle(...vertices,false,hit)){
              const d=delta.subVectors(hit,localRay.origin).dot(localRay.direction);
              if(d>=near&&d<far)return true;
            }
          }
        }
      }
      return false;
    },
  };
}
