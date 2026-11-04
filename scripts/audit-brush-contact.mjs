// Optional release audit, against the *rendered surfaces* rather than only the
// ideal wire axis. Requires Blender 4.5+ (BLENDER_BIN or a blender executable
// on PATH). Does not change any source, GLB, or published file.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {access,mkdtemp,readFile,realpath,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Matrix4,Vector3} from 'three';
import {createCleaningPath} from '../src/experience/cleaning-path.js';
import {createInterdentalBrush} from '../src/experience/interdental-brush.js';
import {createPlaque} from '../src/experience/plaque.js';

const root=fileURLToPath(new URL('..',import.meta.url)), assets=path.join(root,'public');
const temporaryRoot=await realpath(tmpdir()), prefix='zub-brush-contact-';
const temp=await mkdtemp(path.join(temporaryRoot,prefix));
const site=JSON.parse(await readFile(path.join(assets,'story-assets/site.json')));
const manifest=JSON.parse(await readFile(path.join(assets,'dentition-assets/manifest.json')));
const guide=createCleaningPath(site), point=new Vector3(), instance=new Matrix4(), world=new Matrix4();
// Test both extrema of the slight contact-induced axial bending. Also include
// the pre-alignment position outside the mouth. This is a finite sample audit.
const poses=[{visibility:1,alignment:0,insertion:0,stroke:0}];
for(const stroke of [0,1])for(let i=0;i<=40;i++)poses.push({visibility:1,alignment:1,insertion:i/40,stroke});
const descriptor={steps:poses.length,parts:[]};
async function save(label,vertices,indices) {
  await writeFile(path.join(temp,label+'.f32'),Buffer.from(vertices.buffer,vertices.byteOffset,vertices.byteLength));
  await writeFile(path.join(temp,label+'.i32'),Buffer.from(indices.buffer,indices.byteOffset,indices.byteLength));
}
async function exportBrush(lod,brush,kind,meshes) {
  const instances=m=>m.isInstancedMesh?m.count:1;
  const n=meshes.reduce((sum,m)=>sum+instances(m)*m.geometry.attributes.position.count,0);
  const triangles=meshes.reduce((sum,m)=>sum+instances(m)*m.geometry.index.count/3,0);
  const positions=new Float32Array(poses.length*n*3),indices=new Int32Array(triangles*3);
  for(const [step,pose] of poses.entries()) {
    brush.setPose(pose);brush.object.updateMatrixWorld(true);
    let vertex=0,index=0;
    for(const mesh of meshes)for(let k=0;k<instances(mesh);k++) {
      if(mesh.isInstancedMesh){mesh.getMatrixAt(k,instance);world.multiplyMatrices(mesh.matrixWorld,instance);}
      else world.copy(mesh.matrixWorld);
      const {position}=mesh.geometry.attributes,idx=mesh.geometry.index;
      for(let i=0;i<position.count;i++)point.fromBufferAttribute(position,i).applyMatrix4(world)
        .multiplyScalar(10).toArray(positions,3*(step*n+vertex+i));
      if(step===0)for(let i=0;i<idx.count;i++)indices[index++]=vertex+idx.getX(i);
      vertex+=position.count;
    }
  }
  await save(lod+'-'+kind,positions,indices);descriptor.parts.push({lod,kind,vertices:n,triangles});
}
async function exportTooth(lod,fdi) {
  const suffix=lod==='mobile'?'-mobile':'',hero=fdi===36;
  const data=await readFile(path.join(assets,'dentition-assets',(hero?'hero-36':'dentition')+suffix+'.glb'));
  const jsonSize=data.readUInt32LE(12),doc=JSON.parse(data.toString('utf8',20,20+jsonSize));
  const prim=doc.meshes.find(m=>m.name===(hero?'ToothExterior':'FDI_'+fdi)).primitives[0];
  function attribute(id) {
    const a=doc.accessors[id],v=doc.bufferViews[a.bufferView];
    const components=a.type==='SCALAR'?1:3, componentBytes=a.componentType===5123?2:4;
    const out=components===3?new Float32Array(a.count*3):new Int32Array(a.count);
    const offset=28+jsonSize+(v.byteOffset??0)+(a.byteOffset??0);
    for(let i=0;i<a.count;i++)for(let j=0;j<components;j++) {
      const k=offset+i*(v.byteStride??components*componentBytes)+j*componentBytes;
      out[i*components+j]=a.componentType===5126?data.readFloatLE(k):componentBytes===2?data.readUInt16LE(k):data.readUInt32LE(k);
    }
    return out;
  }
  const vertices=attribute(prim.attributes.POSITION),indices=attribute(prim.indices);
  const transform=manifest.teeth.find(t=>t.fdi===fdi).matrix;
  world.fromArray(transform);
  // Infer the displayed jaw translation from its registered FDI 36 (same jaw);
  // do not apply any pose correction twice.
  const raw36=manifest.teeth.find(t=>t.fdi===36).matrix,display36=site.displayedMatrixColumnMajor['36'];
  for(let j=12;j<=14;j++)world.elements[j]+=display36[j]-raw36[j];
  for(let i=0;i<vertices.length;i+=3)point.fromArray(vertices,i).applyMatrix4(world).multiplyScalar(10).toArray(vertices,i);
  await save(lod+'-'+fdi,vertices,indices);
}

const python=`
from pathlib import Path
import json,numpy as np
from mathutils.bvhtree import BVHTree
p=Path(__file__).resolve().parent
d=json.loads((p/'descriptor.json').read_text())
def mesh(label):
    v=np.fromfile(p/(label+'.f32'),dtype='<f4').reshape(-1,3)
    f=np.fromfile(p/(label+'.i32'),dtype='<i4').reshape(-1,3)
    return BVHTree.FromPolygons(v.tolist(),f.tolist(),all_triangles=True)
result=[]
for lod in ['desktop','mobile']:
    teeth={i:mesh(lod+'-'+str(i)) for i in (35,36,37)}
    coats={i:mesh(lod+'-film'+str(i)) for i in (36,37)}
    for row in [r for r in d['parts'] if r['lod']==lod]:
        base=lod+'-'+row['kind']; hits={i:0 for i in teeth}
        contacts={i:set() for i in coats}; contact_frames={i:0 for i in coats}
        faces=np.fromfile(p/(base+'.i32'),dtype='<i4').reshape(-1,3).tolist()
        vertices=np.memmap(p/(base+'.f32'),dtype='<f4',mode='r',shape=(d['steps'],row['vertices'],3))
        for pose in vertices:
            tree=BVHTree.FromPolygons(pose.tolist(),faces,all_triangles=True)
            for i,surface in teeth.items():hits[i]+=len(tree.overlap(surface))
            for i,surface in coats.items():
                overlap=tree.overlap(surface)
                if overlap:contacts[i].update(tri for _,tri in overlap);contact_frames[i]+=1
        result.append(dict(lod=lod,component=row['kind'],poses=d['steps'],hardTriangleIntersections=hits,
                           touchedFilmTriangles={i:len(s) for i,s in contacts.items()},filmContactPoses=contact_frames))
(p/'result.json').write_text(json.dumps(result))
`;

try {
  for(const compact of [false,true]) {
    const lod=compact?'mobile':'desktop',brush=createInterdentalBrush({path:guide,compact});
    const rigid=[],fibres=[];
    brush.object.traverse(mesh=>{if(mesh.isMesh)(mesh.isInstancedMesh?fibres:rigid).push(mesh);});
    await exportBrush(lod,brush,'rigid',rigid);await exportBrush(lod,brush,'fibres',fibres);brush.dispose();
    for(const fdi of [35,36,37])await exportTooth(lod,fdi);
    const plaque=createPlaque({site,path:guide,compact});plaque.object.updateMatrixWorld(true);
    for(const mesh of plaque.object.children){
      const attr=mesh.geometry.attributes.position,vertices=new Float32Array(attr.count*3);
      for(let i=0;i<attr.count;i++)point.fromBufferAttribute(attr,i).applyMatrix4(mesh.matrixWorld).multiplyScalar(10).toArray(vertices,3*i);
      await save(lod+'-film'+mesh.userData.hostFDI,vertices,Int32Array.from(mesh.geometry.index.array));
    }
    plaque.dispose();
  }
  await writeFile(path.join(temp,'descriptor.json'),JSON.stringify(descriptor));
  const worker=path.join(temp,'contact.py');await writeFile(worker,python);
  const local=path.resolve(root,'../professional-tools/blender-4.5.14-windows-x64/blender.exe');
  let blender=process.env.BLENDER_BIN;
  if(!blender) {try{await access(local);blender=local;}catch{blender='blender';}}
  const run=spawnSync(blender,['--background','--factory-startup','--python-exit-code','1','--python',worker],
    {windowsHide:true,encoding:'utf8',timeout:180000});
  if(run.error||run.status!==0)throw run.error??Error(run.stderr+'\n'+run.stdout);
  const result=JSON.parse(await readFile(path.join(temp,'result.json')));
  for(const row of result){
    assert.ok(Object.values(row.hardTriangleIntersections).every(n=>n===0),'Hard surface collision: '+JSON.stringify(row));
    if(row.component==='fibres')assert.ok(Object.values(row.filmContactPoses).every(n=>n>0),'Both films must be physically reached.');
  }
  console.log(JSON.stringify({passed:true,scope:'Finite BVH triangle-overlap audit; the separate continuous certificate covers the rigid wire along the measured corridor.',result},null,2));
} finally {
  const actual=await realpath(temp);
  if(path.dirname(actual)!==temporaryRoot||!path.basename(actual).startsWith(prefix))throw Error('Unexpected temporary audit directory.');
  await rm(actual,{recursive:true,force:true});
}
