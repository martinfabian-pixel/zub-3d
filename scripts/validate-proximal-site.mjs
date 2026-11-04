// Lightweight CI checks on the actual source-index morph, plaque and wire data.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const publicURL=new URL('../public/',import.meta.url);
const read=(path)=>readFile(new URL(path,publicURL));
const json=async path=>JSON.parse(await read(path));
const site=await json('story-assets/site.json'), damage=await json('story-assets/caries-36.json');
const sha=b=>createHash('sha256').update(b).digest('hex');
const norm=v=>Math.hypot(...v), sub=(a,b)=>a.map((x,i)=>x-b[i]), dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
function parse(bytes,node){
  const size=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+size)),bin=bytes.subarray(28+size),mesh=j.meshes.find(x=>x.name===node),pr=mesh.primitives[0];
  const attr=i=>{const a=j.accessors[i],v=j.bufferViews[a.bufferView],w={VEC2:2,VEC3:3,VEC4:4,SCALAR:1}[a.type],type={5126:Float32Array,5125:Uint32Array,5123:Uint16Array}[a.componentType];assert.ok(!v.byteStride);return new type(bin.buffer,bin.byteOffset+(v.byteOffset||0)+(a.byteOffset||0),a.count*w);};
  const attributes=Object.fromEntries(Object.entries(pr.attributes).map(([k,i])=>[k,attr(i)]));return {...attributes,INDICES:attr(pr.indices)};
}
const models={};
for(const [name,expected] of Object.entries(site.assetSha256)){
  const bytes=await read('dentition-assets/'+name);assert.equal(sha(bytes),expected,`${name} changed: repeat spatial audits.`);models[name]=parse(bytes,name.startsWith('hero-36')?'ToothExterior':'FDI_37');
}
for(const file of ['hero-36.glb','hero-36-mobile.glb']){
  const m=models[file];for(const [name,expected] of Object.entries(damage.sourceGeometrySha256)){const x=m[name];assert.equal(sha(Buffer.from(x.buffer,x.byteOffset,x.byteLength)),expected,`${file}/${name}`);}
}
const count=damage.indices.length, used=new Set(damage.indices);assert.equal(count,used.size);assert.equal(damage.vertexCount,27741);assert.equal(damage.triangleCount,55184);assert.equal(damage.fdi,36);assert.equal(damage.noncavitatedEarlyInfluence,0);
assert.ok(damage.indices.every(i=>Number.isInteger(i)&&i>=0&&i<damage.vertexCount));assert.ok(damage.positionDelta.length===3*count&&damage.normalDelta.length===3*count&&damage.region.length===4*count);assert.ok(damage.positionDelta.every(Number.isFinite)&&damage.normalDelta.every(Number.isFinite)&&damage.region.every(x=>x>=0&&x<=1));assert.ok(damage.audit.maximumMeasuredDepressionMm>=.5&&damage.audit.maximumMeasuredDepressionMm<=.8);assert.ok(damage.audit.matureSignedVolumeNominalMm3>0&&damage.audit.matureSignedVolumeNominalMm3<damage.audit.healthySignedVolumeNominalMm3);
const brush=site.brush,line=brush.centerline,A=line[0].position,E=line.at(-1).position,length=norm(sub(E,A))*10,axis=sub(E,A).map(x=>x*10/length),env=brush.rigidEnvelope;assert.ok(Math.abs(length-brush.lengthMm)<1e-5);assert.ok(brush.dimensionsMm.wireRadius<env.continuousLowerBoundRadiusMm);assert.ok(brush.maxTipArcMm-brush.dimensionsMm.exposedHeadLength<=brush.maxFerruleNoseArcMm);assert.equal(brush.maxCurvaturePerMm,0);
// Check the delivered deformation against its physical dimensions and ensure
// the enlarged opening remains away from the cleaning corridor throughout.
function verifyCavity(){
  const surface=models['hero-36.glb'],matrix=site.displayedMatrixColumnMajor[36];
  const morphSlot=new Map(damage.indices.map((id,i)=>[id,i])),cache=new Map();
  const width=[],height=[],frame=site.lesion.basisWorld;
  function endpoint(id){
    if(cache.has(id))return cache.get(id);
    const slot=morphSlot.get(id),p=surface.POSITION.subarray(3*id,3*id+3);
    const d=slot===undefined?[0,0,0]:damage.positionDelta.slice(3*slot,3*slot+3);
    const rotated=v=>[0,1,2].map(k=>10*(matrix[k]*v[0]+matrix[4+k]*v[1]+matrix[8+k]*v[2]));
    const start=rotated(p).map((x,k)=>x+10*(matrix[12+k]-A[k])),shift=rotated(d);
    const end=start.map((x,k)=>x+shift[k]),depth=norm(shift);
    if(depth>.005){
      width.push(dot(start,frame.buccalLingualTangentBuccalPositive));
      height.push(dot(start,frame.occlusalGingivalTangentOcclusalPositive));
    }
    const record={start,end,depth,floor:slot===undefined?0:damage.region[4*slot+1]};cache.set(id,record);return record;
  }
  const bounds={anyDisplacement:Infinity,over5Microns:Infinity,exposedFloor:Infinity};
  for(let i=0;i<surface.INDICES.length;i+=3){
    const ids=Array.from(surface.INDICES.subarray(i,i+3));
    if(!ids.some(id=>morphSlot.has(id)))continue;
    const tri=ids.map(endpoint),depth=Math.max(...tri.map(v=>v.depth)),floor=tri.reduce((s,v)=>s+v.floor,0)/3;
    if(depth<=1e-6&&floor<=.55)continue;
    const radial=tri.flatMap(v=>[v.start,v.end]).map(p=>p.map((x,k)=>x-dot(p,axis)*axis[k]));
    const sum=[0,1,2].map(k=>radial.reduce((s,r)=>s+r[k],0)),dir=sum.map(x=>x/norm(sum));
    const lower=Math.min(...radial.map(r=>dot(r,dir)));
    if(depth>1e-6)bounds.anyDisplacement=Math.min(bounds.anyDisplacement,lower);
    if(depth>.005)bounds.over5Microns=Math.min(bounds.over5Microns,lower);
    if(floor>.55)bounds.exposedFloor=Math.min(bounds.exposedFloor,lower);
  }
  const extents=[width,height].map(v=>Math.max(...v)-Math.min(...v));
  assert.ok(extents[0]>=1.5*1.393 && extents[0]<=2*1.393,'Opening width relative to f3257d1');
  assert.ok(extents.every((v,k)=>Math.abs(v-damage.audit.displacedFootprintExtentMmAt5Microns[k])<1e-5));
  for(const [region,lower]of Object.entries(bounds)){
    assert.ok(Number.isFinite(lower)&&Math.abs(lower-damage.audit.wireSeparation[region].minimumRadiusMm)<2e-6);
    const radius=region==='anyDisplacement'?brush.dimensionsMm.wireRadius:brush.dimensionsMm.bristleRadius;
    assert.ok(lower>radius,`Tooth 36 ${region} enters the brush envelope`);
  }
}
verifyCavity();
for(let k=0;k<line.length;k++){
  const t=line[k];assert.ok(k===0||t.arcLengthMm>line[k-1].arcLengthMm);assert.ok(norm(sub(t.position,A.map((x,i)=>x+axis[i]*t.arcLengthMm/10)))<2e-7);
  for(const hits of [t.contacts,t.contactsMobile])for(const h of hits){assert.ok(Math.abs(norm(sub(h.nearestWorld,t.position))*10-h.distanceMm)<2e-5);assert.ok(Math.abs(norm(h.normalWorld)-1)<1e-5);assert.ok(h.distanceMm>=brush.dimensionsMm.wireRadius);}
}
for(const [patch,compact] of [...site.plaque.patches.map(p=>[p,false]),[site.plaque.mobile37,true]]){
  const model=models[patch.fdi===36?'hero-36.glb':compact?'dentition-mobile.glb':'dentition.glb'];const n=patch.sourceVertexIndices.length,m=site.displayedMatrixColumnMajor[patch.fdi];assert.equal(patch.positions.length,3*n);assert.equal(patch.normals.length,3*n);assert.equal(patch.uv.length,2*n);assert.ok(patch.indices.every(i=>i>=0&&i<n));let contacted=0,uncontacted=0;
  for(let k=0;k<n;k++){
    const source=patch.sourceVertexIndices[k],p=patch.positions.slice(3*k,3*k+3);for(let j=0;j<3;j++)assert.ok(Math.abs(p[j]-model.POSITION[3*source+j])<6e-11);
    const world=[0,1,2].map(i=>m[i]*p[0]+m[4+i]*p[1]+m[8+i]*p[2]+m[12+i]);const arc=Math.min(length,Math.max(0,dot(sub(world,A),axis)*10));const closest=A.map((a,i)=>a+axis[i]*arc/10);const distance=norm(sub(world,closest))*10;
    assert.ok(Math.abs(distance-patch.pathDistanceMm[k])<2e-5);assert.ok(Math.abs(arc-patch.nearestArcMm[k])<2e-5);assert.ok(patch.edgeWeight[k]>=0&&patch.edgeWeight[k]<=1);assert.ok(patch.lesionExclusion[k]>=0&&patch.lesionExclusion[k]<=1);
    if(patch.edgeWeight[k]>.05)distance<=brush.dimensionsMm.bristleRadius?contacted++:uncontacted++;
  }
  assert.ok(contacted>0&&uncontacted>0,'Patch must include both reachable plaque and genuine undeformed residue.');
}
console.log(`Proximal site verified: ${line.length} straight path samples, ${count} sparse 36 vertices, positive cavity volume and source-identical local plaque patches on both LODs.`);
