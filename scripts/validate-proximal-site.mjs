// Lightweight CI checks on the registered plaque surfaces and cleaning path.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const publicURL=new URL('../public/',import.meta.url);
const read=(path)=>readFile(new URL(path,publicURL));
const json=async path=>JSON.parse(await read(path));
const site=await json('story-assets/site.json');
assert.ok(site.teachingSurfaceWorldCm?.length===3 && site.teachingSurfaceWorldCm.every(Number.isFinite));
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
const brush=site.brush,line=brush.centerline,A=line[0].position,E=line.at(-1).position,length=norm(sub(E,A))*10,axis=sub(E,A).map(x=>x*10/length),env=brush.rigidEnvelope;assert.ok(Math.abs(length-brush.lengthMm)<1e-5);assert.ok(brush.dimensionsMm.wireRadius<env.continuousLowerBoundRadiusMm);assert.ok(brush.maxTipArcMm-brush.dimensionsMm.exposedHeadLength<=brush.maxFerruleNoseArcMm);assert.equal(brush.maxCurvaturePerMm,0);
for(let k=0;k<line.length;k++){
  const t=line[k];assert.ok(k===0||t.arcLengthMm>line[k-1].arcLengthMm);assert.ok(norm(sub(t.position,A.map((x,i)=>x+axis[i]*t.arcLengthMm/10)))<2e-7);
  for(const hits of [t.contacts,t.contactsMobile])for(const h of hits){assert.ok(Math.abs(norm(sub(h.nearestWorld,t.position))*10-h.distanceMm)<2e-5);assert.ok(Math.abs(norm(h.normalWorld)-1)<1e-5);assert.ok(h.distanceMm>=brush.dimensionsMm.wireRadius);}
}
for(const [patch,compact] of [...site.plaque.patches.map(p=>[p,false]),[site.plaque.mobile37,true]]){
  const model=models[patch.fdi===36?'hero-36.glb':compact?'dentition-mobile.glb':'dentition.glb'];const n=patch.sourceVertexIndices.length,m=site.displayedMatrixColumnMajor[patch.fdi];assert.equal(patch.positions.length,3*n);assert.equal(patch.normals.length,3*n);assert.equal(patch.uv.length,2*n);assert.ok(patch.indices.every(i=>i>=0&&i<n));let contacted=0,uncontacted=0;
  for(let k=0;k<n;k++){
    const source=patch.sourceVertexIndices[k],p=patch.positions.slice(3*k,3*k+3);for(let j=0;j<3;j++)assert.ok(Math.abs(p[j]-model.POSITION[3*source+j])<6e-11);
    const world=[0,1,2].map(i=>m[i]*p[0]+m[4+i]*p[1]+m[8+i]*p[2]+m[12+i]);const arc=Math.min(length,Math.max(0,dot(sub(world,A),axis)*10));const closest=A.map((a,i)=>a+axis[i]*arc/10);const distance=norm(sub(world,closest))*10;
    assert.ok(Math.abs(distance-patch.pathDistanceMm[k])<2e-5);assert.ok(Math.abs(arc-patch.nearestArcMm[k])<2e-5);assert.ok(patch.edgeWeight[k]>=0&&patch.edgeWeight[k]<=1);
    if(patch.edgeWeight[k]>.05)distance<=brush.dimensionsMm.bristleRadius?contacted++:uncontacted++;
  }
  assert.ok(contacted>0&&uncontacted>0,'Patch must include both reachable plaque and genuine residual plaque.');
}
console.log(`Proximal site verified: ${line.length} straight path samples and source-identical local plaque patches on both LODs.`);
