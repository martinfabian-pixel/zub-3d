// Numeric checks on the released 36/37 meshes and registered site, not on an
// invented coordinate fixture. Run: node scripts/test-cleaning-path.mjs
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Vector3} from 'three';
import {createCleaningPath,makePathSample,MM_TO_WORLD} from '../src/experience/cleaning-path.js';
import {createInterdentalBrush} from '../src/experience/interdental-brush.js';
import {createPlaque} from '../src/experience/plaque.js';
import {sampleDentalStory} from '../src/experience/dental-story.js';

const read=name=>readFile(new URL('../public/'+name,import.meta.url));
const site=JSON.parse(await read('story-assets/site.json'));
const path=createCleaningPath(site),sample=makePathSample(),p=new Vector3();
const curve=site.brush.centerline,dimensions=site.brush.dimensionsMm;
assert.ok(path.report().maxChordDeviationMm<.001);
assert.ok(Math.abs(path.totalMm-site.brush.lengthMm)<1e-5 && path.totalMm>14.3,'Keep the full surveyed corridor.');
assert.equal(path.tipArcMm(1),11.7,'The depicted tip stops before the full corridor end.');
assert.equal(path.tipArcMm(0),0);
assert.ok(path.report().certifiedWireRadialMarginMm>.3,'Certified against desktop and compact hard surfaces.');
assert.ok(path.report().maxActualFerruleNoseArcMm<site.brush.maxFerruleNoseArcMm,'The bulky ferrule must stop outside the narrow gap.');
for(const row of curve){
  path.sample(row.arcLengthMm,sample);
  assert.ok(sample.position.distanceTo(p.fromArray(row.position))<1e-7,'The pose must lie on the surveyed line.');
  assert.ok(Math.abs(sample.xAxis.dot(sample.tangent))<1e-10 && Math.abs(sample.zAxis.dot(sample.tangent))<1e-10);
  assert.ok(Math.abs(path.nearest(sample.position).arcMm-row.arcLengthMm)<.0001);
}
const failedSite=structuredClone(site);failedSite.brush.dimensionsMm.exposedHeadLength=4;
assert.throws(()=>createCleaningPath(failedSite),/ferrule/);

async function readPositions(file,meshName) {
  const b=await read('dentition-assets/'+file),jsonLength=b.readUInt32LE(12);
  const doc=JSON.parse(b.toString('utf8',20,20+jsonLength));
  const primitive=doc.meshes.find(m=>m.name===meshName).primitives[0];
  const a=doc.accessors[primitive.attributes.POSITION],view=doc.bufferViews[a.bufferView];
  assert.equal(a.type,'VEC3');assert.equal(a.componentType,5126);
  const data=new Float32Array(a.count*3),offset=28+jsonLength+(view.byteOffset??0)+(a.byteOffset??0);
  for(let i=0;i<a.count;i++)for(let c=0;c<3;c++)data[3*i+c]=b.readFloatLE(offset+i*(view.byteStride??12)+4*c);
  return data;
}

const results=[];
for(const compact of [false,true]){
  const suffix=compact?'-mobile':'',teeth=new Map();
  const shared=new MeshBasicMaterial();
  for(const fdi of [36,37]){
    const positions=await readPositions((fdi===36?'hero-36':'dentition')+suffix+'.glb',fdi===36?'ToothExterior':'FDI_37');
    const geometry=new BufferGeometry().setAttribute('position',new Float32BufferAttribute(positions,3));
    const mesh=new Mesh(geometry,shared);mesh.matrixAutoUpdate=false;mesh.matrix.fromArray(site.displayedMatrixColumnMajor[fdi]);
    mesh.updateWorldMatrix(true,false,true);teeth.set(fdi,{mesh});
  }
  const brush=createInterdentalBrush({path,compact}),film=createPlaque({site,path,arch:{teeth},compact});
  assert.ok(brush.report().filamentInstances>=400 && brush.report().filamentInstances<=800);
  const sampled=[...site.plaque.patches];
  if(compact)sampled[sampled.findIndex(d=>d.fdi===37)]=site.plaque.mobile37;
  const world=new Vector3(),surface=new Vector3(),threshold={};
  let minimumLiftMm=Infinity,maximumLiftMm=-Infinity,residual=0,reached=0;
  for(const raw of sampled){
    const mesh=teeth.get(raw.fdi).mesh;
    const layer=film.object.children.find(m=>m.userData.hostFDI===raw.fdi);
    assert.deepEqual(layer.matrix.elements,mesh.matrixWorld.elements);
    const indices=raw.sourceVertexIndices,g=layer.geometry;
    assert.equal(g.index.count,raw.indices.length);assert.equal(g.attributes.position.count,indices.length);
    for(let i=0;i<indices.length;i++){
      surface.fromBufferAttribute(mesh.geometry.attributes.position,indices[i]).applyMatrix4(mesh.matrixWorld);
      world.fromBufferAttribute(g.getAttribute('surfaceWorld'),i);
      assert.ok(world.distanceTo(surface)/MM_TO_WORLD<.00002,'Each deposit vertex must register to its actual source vertex.');
      world.fromBufferAttribute(g.attributes.position,i).applyMatrix4(layer.matrix);
      const lift=world.distanceTo(surface)/MM_TO_WORLD;
      minimumLiftMm=Math.min(minimumLiftMm,lift);maximumLiftMm=Math.max(maximumLiftMm,lift);
      assert.ok(lift>=.0199 && lift<=.0361,'Surface coating lift is 20–36 µm, never a floating mass.');
      const distance=raw.pathDistanceMm[i],arc=raw.nearestArcMm[i];
      path.sweepThreshold(distance,arc,threshold);
      if(raw.edgeWeight[i]<.001)continue;
      if(distance>=dimensions.bristleRadius){
        residual++;assert.equal(path.removedFraction(1,threshold),0,'Unreachable coating must survive even at full cleaning.');
      }else if(path.removedFraction(1,threshold)>.001)reached++;
      for(const c of [0,.2,.45,.75,1]){
        const removed=path.removedFraction(c,threshold);
        if(removed>0)assert.ok(arc+dimensions.bareTipLength<=path.tipArcMm(.1+.9*c)+1e-6,'Removal must not lead the furthest bristle.');
      }
    }
  }
  assert.ok(residual>0 && reached>0);
  let prevRemoved=0,maxBent=0,minimumFibrePlaneGap=Infinity;
  const saved=new Map(),out={};let spin=null;
  for(let i=0;i<=500;i++){
    const s=sampleDentalStory(i/500,out);
    brush.setPose(s.brushPose);
    film.setState({visible:true,opacity:s.plaqueDeposition,progress:s.cleaningProgress,lesionProgress:s.lesionProgress});
    const br=brush.report(),pl=film.report();
    if(br.visible){
      const expected=path.sample(path.tipArcMm(s.brushInsertion,s.brushAlignment),sample);
      assert.ok(brush.object.position.distanceTo(expected.position)<1e-8);
      assert.ok(br.tipArcMm-path.dimensions.ferruleBackMm<=site.brush.maxFerruleNoseArcMm+.00001);
      if(!spin)spin=brush.object.quaternion.clone();
      assert.ok(1-Math.abs(spin.dot(brush.object.quaternion))<1e-8,'No drilling rotation around the wire.');
      maxBent=Math.max(maxBent,br.bentFilaments);
      if(br.approxMinFibreGapToSampledTangentPlanesMm!==null)
        minimumFibrePlaneGap=Math.min(minimumFibrePlaneGap,br.approxMinFibreGapToSampledTangentPlanesMm);
    }
    assert.ok(pl.patches.every(d=>d.outsideRemovedWeight===0));
    const w=pl.patches.reduce((sum,d)=>sum+d.currentWeightedRemoval,0);
    if(s.lesionProgress===1){assert.ok(w+1e-7>=prevRemoved,'Partial retraction cannot repaint previously reached plaque.');prevRemoved=w;}
    if(i%10===0)saved.set(i,{pose:brush.object.position.toArray(),removed:w});
  }
  assert.ok(maxBent>0 && minimumFibrePlaneGap>=-.0001,'Local filament-plane deflection is active and bounded.');
  for(let i=500;i>=0;i-=10){
    const s=sampleDentalStory(i/500,out);brush.setPose(s.brushPose);
    film.setState({visible:true,opacity:s.plaqueDeposition,progress:s.cleaningProgress,lesionProgress:s.lesionProgress});
    const w=film.report().patches.reduce((sum,d)=>sum+d.currentWeightedRemoval,0);
    assert.deepEqual(brush.object.position.toArray(),saved.get(i).pose);
    assert.equal(w,saved.get(i).removed,'Backscroll must reproduce the original patch mask exactly.');
  }
  const final=sampleDentalStory(1,out);
  film.setState({visible:true,progress:final.cleaningProgress,opacity:final.plaqueDeposition,lesionProgress:final.lesionProgress});
  assert.equal(film.report().lesionProgress,1);
  assert.ok(film.report().initialDensityProfile.peripheral>0 && film.report().initialDensityProfile.peripheral<1);
  assert.ok(film.report().patches.every(d=>d.outsideWeight>0 && d.outsideRemovedWeight===0));
  results.push({compact,minimumLiftMm,maximumLiftMm,reached,residual,maxBent,minimumFibrePlaneGap,
    weightedRemoval:film.report().patches.map(d=>[d.fdi,d.currentWeightedRemoval])});
  brush.dispose();film.dispose();brush.dispose();film.dispose();
  for(const {mesh}of teeth.values())mesh.geometry.dispose();shared.dispose();
}
console.log(JSON.stringify({passed:true,path:path.report(),results,
  scope:'Actual registered source positions, swept hard-wire certificate, local filament/support-plane checks; not biological simulation.'},null,2));
