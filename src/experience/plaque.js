import { BufferGeometry, Color, Float32BufferAttribute, Group, Matrix3, Matrix4, Mesh, MeshStandardMaterial, Vector2, Vector3, Vector4 } from 'three';
import { MM_TO_WORLD as mm, saturate } from './cleaning-path.js';

// Thin surface-bound disclosed biofilm, not a volume around the contact. The
// nonclinical contrast tint is intentionally independent of enamel and caries.
const fragmentDeclarations=`
uniform float deposit,cleaned,lesionAmount;
uniform vec3 plaqueTint,plaqueWarm,spineOrigin,spineDirection;
uniform vec2 spineSize;
uniform vec4 sweepDomain;
uniform vec3 depositProfile;
varying vec4 vFilm;
varying vec2 vBoundary;
varying vec3 vSurfaceWorld;
float filmHash(vec3 v){
  v=fract(v*.1031); v+=dot(v,v.yzx+33.33); return fract((v.x+v.y)*v.z);
}
float filmNoise(vec3 p){
  vec3 i=floor(p),w=fract(p); w=w*w*(3.-2.*w);
  float a=mix(filmHash(i),filmHash(i+vec3(1,0,0)),w.x);
  float b=mix(filmHash(i+vec3(0,1,0)),filmHash(i+vec3(1,1,0)),w.x);
  float c=mix(filmHash(i+vec3(0,0,1)),filmHash(i+vec3(1,0,1)),w.x);
  float d=mix(filmHash(i+vec3(0,1,1)),filmHash(i+vec3(1,1,1)),w.x);
  return mix(mix(a,b,w.y),mix(c,d,w.y),w.z);
}
`;
function makeFilmMaterial(uniforms) {
  const material=new MeshStandardMaterial({name:'Disclosed adherent biofilm',color:0xffffff,roughness:.67,metalness:0,
    transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      attribute vec4 filmSweep; attribute vec2 filmBoundary; attribute vec3 surfaceWorld;
      varying vec4 vFilm; varying vec2 vBoundary; varying vec3 vSurfaceWorld;`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        vFilm=filmSweep; vBoundary=filmBoundary; vSurfaceWorld=surfaceWorld;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+fragmentDeclarations)
      .replace('#include <color_fragment>',`#include <color_fragment>
        float coarse=filmNoise(vSurfaceWorld*24.0);
        float fine=filmNoise(vSurfaceWorld*98.0);
        // The irregular edge is fixed to the source tooth in world-scale units.
        float edge=smoothstep(0.,.06,vBoundary.x)*smoothstep(.018,.36,vBoundary.x+(.6*coarse+.4*fine-.5)*.16);
        float depositFront=(1.-vBoundary.x)*.66+(coarse-.5)*.16;
        float formed=smoothstep(depositFront-.07,depositFront+.18,deposit)*smoothstep(0.,.13,deposit);
        float axial=dot(vSurfaceWorld-spineOrigin,spineDirection);
        float station=clamp(axial,0.,spineSize.x);
        float radial=length(vSurfaceWorld-(spineOrigin+station*spineDirection));
        // Fixed initial contrast distribution of this illustrative deposit.
        // It does not change with the brush, time, cleaning, or stroke depth.
        float initialDensity=mix(1.,depositProfile.z,smoothstep(depositProfile.x,depositProfile.y,radial));
        // Per-fragment hard support: interpolating vertex reach alone could
        // clean over the edge of the physical swept cylinder on a large face.
        float within=1.-smoothstep(spineSize.y*.94,spineSize.y,radial);
        float pastTip=mix(sweepDomain.x,sweepDomain.y,cleaned)-axial;
        float insideSweep=step(sweepDomain.z,axial)*smoothstep(0.,sweepDomain.w,pastTip);
        float wiped=within*insideSweep*smoothstep(vFilm.x,vFilm.y,cleaned);
        float exclude=vBoundary.y*lesionAmount;
        diffuseColor.rgb=mix(plaqueTint,plaqueWarm,.16+.34*coarse)*(.92+.15*fine);
        diffuseColor.a*=initialDensity*edge*formed*(1.-wiped)*(1.-exclude)*(.76+.19*coarse);
        if(diffuseColor.a<.003)discard;`);
  };
  material.customProgramCacheKey=()=>'adherent-interdental-film-r186-v1';
  return material;
}
function validPatch(raw) {
  const n=raw.positions?.length/3;
  if(!Number.isInteger(n)||n<3||raw.normals?.length!==3*n||!raw.indices?.length||
    raw.indices.length%3!==0||raw.indices.some(i=>!Number.isInteger(i)||i<0||i>=n)||
    raw.edgeWeight?.length!==n||raw.pathDistanceMm?.length!==n||raw.nearestArcMm?.length!==n)
    throw new Error('Invalid source-surface plaque patch for FDI '+raw.fdi);
  return n;
}
function agreesWithMesh(patch,mesh) {
  if(!mesh||!patch.sourceVertexIndices)return false;
  const source=mesh.geometry?.getAttribute('position');
  if(!source)return false;
  for(let i=0;i<patch.sourceVertexIndices.length;i++) {
    const j=patch.sourceVertexIndices[i],k=i*3;
    if(j>=source.count||Math.abs(source.getX(j)-patch.positions[k])>1e-6||
      Math.abs(source.getY(j)-patch.positions[k+1])>1e-6||Math.abs(source.getZ(j)-patch.positions[k+2])>1e-6)return false;
  }
  return true;
}

export function createPlaque({site,path,arch,compact=false,profile,options={}}) {
  const rawPatches=site?.plaque?.patches;
  if(!Array.isArray(rawPatches)||!rawPatches.length)throw new Error('Measured plaque surface patches are missing.');
  const object=new Group();object.name='36–37 · attached interdental biofilm';object.userData.kind='plaque';
  const innerMm=options.coreDensityRadiusMm??.55,outerMm=options.outerDensityRadiusMm??.72;
  const peripheral=options.peripheralDensity??.12;
  if(!(innerMm>=0 && outerMm>innerMm && peripheral>0 && peripheral<=1))throw new Error('Invalid coating density profile.');
  function densityAt(distanceMm){
    const t=saturate((distanceMm-innerMm)/(outerMm-innerMm));
    return 1-(1-peripheral)*t*t*(3-2*t);
  }
  const uniforms={
    deposit:{value:0},cleaned:{value:0},lesionAmount:{value:0},plaqueTint:{value:new Color(options.tint??'#a16b83')},
    plaqueWarm:{value:new Color(options.warmTint??'#b18774')},
    spineOrigin:{value:path.startWorld},spineDirection:{value:path.directionWorld},
    spineSize:{value:new Vector2(path.totalMm*mm,path.dimensions.bristleRadiusMm*mm)},
    depositProfile:{value:new Vector3(innerMm*mm,outerMm*mm,peripheral)},
    sweepDomain:{value:new Vector4(
      (path.tipArcMm(.1)-path.firstArcMm-path.dimensions.tipMarginMm)*mm,
      (path.tipArcMm(1)-path.firstArcMm-path.dimensions.tipMarginMm)*mm,
      (path.tipArcMm(0)-path.firstArcMm-path.dimensions.tipMarginMm-path.dimensions.bristledLengthMm)*mm,.06*mm)},
  };
  const material=makeFilmMaterial(uniforms),patches=[],threshold={},near={};
  let disposed=false;
  try {
    for(const base of rawPatches) {
      const fdi=Number(base.fdi),item=arch?.teeth?.get(fdi),mesh=item?.mesh;
      let raw=base;
      if(fdi===37 && site.plaque.mobile37 && (mesh
        ? !agreesWithMesh(base,mesh)&&agreesWithMesh(site.plaque.mobile37,mesh)
        : profile?.compact??compact))raw=site.plaque.mobile37;
      const n=validPatch(raw);
      if(mesh&&!agreesWithMesh(raw,mesh))throw new Error('Plaque patch does not match its host mesh vertices: FDI '+fdi);
      const registration=site.displayedMatrixColumnMajor?.[String(fdi)];
      if(!mesh&&!item?.matrix&&!registration)throw new Error('Plaque patch has no registered tooth transform: '+fdi);
      mesh?.updateWorldMatrix(true,false,true);
      const world=mesh?.matrixWorld?.clone()??item?.matrix?.clone()??new Matrix4().fromArray(registration);
      const inverse=world.clone().invert(),normalMatrix=new Matrix3().getNormalMatrix(world);
      const pos=new Float32Array(3*n),surface=new Float32Array(3*n),sweep=new Float32Array(4*n),edge=new Float32Array(2*n);
      const p=new Vector3(),normal=new Vector3();
      let reachable=0,unreachable=0,reachableWeight=0,outsideWeight=0,maxRegistrationErrorMm=0;
      for(let i=0;i<n;i++){
        const k=3*i,e=saturate(raw.edgeWeight[i]),ex=saturate(raw.lesionExclusion?.[i]??0);
        p.fromArray(raw.positions,k).applyMatrix4(world);p.toArray(surface,k);
        path.nearest(p,near);
        maxRegistrationErrorMm=Math.max(maxRegistrationErrorMm,Math.abs(near.distanceMm-raw.pathDistanceMm[i]));
        path.sweepThreshold(raw.pathDistanceMm[i],raw.nearestArcMm[i],threshold);
        sweep.set([threshold.start,threshold.end,threshold.reach,raw.pathDistanceMm[i]],4*i);edge.set([e,ex],2*i);
        if(e>.001) {
          const r=path.removedFraction(1,threshold);
          const density=densityAt(raw.pathDistanceMm[i]);
          if(r>0){reachable++;reachableWeight+=e*density*r;}else {unreachable++;outsideWeight+=e*density;}
        }
        // Deposit follows the correctly transformed source normal, in physical
        // units despite the authored object's local-metre-to-world-cm scaling.
        normal.fromArray(raw.normals,k).applyMatrix3(normalMatrix).normalize();
        const variation=.5+.5*Math.sin(17*p.x+29*p.y-43*p.z);
        const filmMm=.020+.016*e*variation;
        p.addScaledVector(normal,filmMm*mm).applyMatrix4(inverse).toArray(pos,k);
      }
      if(maxRegistrationErrorMm>.04)throw new Error('Plaque surface/path registration differs by more than 0.04 mm: FDI '+fdi);
      const g=new BufferGeometry();
      g.setAttribute('position',new Float32BufferAttribute(pos,3));
      g.setAttribute('normal',new Float32BufferAttribute(raw.normals,3));
      g.setAttribute('filmSweep',new Float32BufferAttribute(sweep,4));
      g.setAttribute('filmBoundary',new Float32BufferAttribute(edge,2));
      g.setAttribute('surfaceWorld',new Float32BufferAttribute(surface,3));g.setIndex(raw.indices);
      g.computeBoundingSphere();
      const layer=new Mesh(g,material);
      layer.name='FDI '+fdi+' · disclosed surface deposit';layer.userData.kind='plaque';layer.userData.hostFDI=fdi;
      layer.matrixAutoUpdate=false;layer.matrix.copy(world);layer.matrixWorldNeedsUpdate=true;layer.renderOrder=4;
      layer.receiveShadow=true;layer.castShadow=false;object.add(layer);
      patches.push({fdi,geometry:g,sweep,edge,reachable,unreachable,reachableWeight,outsideWeight,maxRegistrationErrorMm,vertices:n,triangles:raw.indices.length/3});
    }
  } catch(error){for(const patch of patches)patch.geometry.dispose();material.dispose();throw error;}
  object.visible=false;
  function setState({visible=true,opacity=1,progress=0,lesionProgress=0}={}) {
    if(disposed)return;
    uniforms.deposit.value=saturate(opacity);
    uniforms.cleaned.value=saturate(progress);
    uniforms.lesionAmount.value=saturate(lesionProgress);
    object.visible=Boolean(visible)&&uniforms.deposit.value>.0001;
  }
  function report() {
    const cleaned=uniforms.cleaned.value,lesion=uniforms.lesionAmount.value;
    return {visible:object.visible,deposition:uniforms.deposit.value,cleaningProgress:cleaned,lesionProgress:lesion,
      maxFilmThicknessMm:.036,initialDensityProfile:{innerMm,outerMm,peripheral},disposed,patches:patches.map(d=>{
        let totalWeight=0,removedWeight=0,outsideRemoved=0;
        for(let i=0;i<d.vertices;i++){
          threshold.start=d.sweep[4*i];threshold.end=d.sweep[4*i+1];threshold.reach=d.sweep[4*i+2];
          const weight=d.edge[2*i]*densityAt(d.sweep[4*i+3])*(1-d.edge[2*i+1]*lesion);
          const fraction=path.removedFraction(cleaned,threshold);totalWeight+=weight;removedWeight+=weight*fraction;
          if(d.sweep[4*i+3]>=path.dimensions.bristleRadiusMm)outsideRemoved+=weight*fraction;
        }
        return {fdi:d.fdi,vertices:d.vertices,triangles:d.triangles,reachableVertices:d.reachable,unreachableVertices:d.unreachable,
          potentialReachWeight:d.reachableWeight,outsideWeight:d.outsideWeight,maxRegistrationErrorMm:d.maxRegistrationErrorMm,
          // A reproducible vertex-weight diagnostic, not a clinical percentage.
          currentWeightedRemoval:totalWeight?removedWeight/totalWeight:0,outsideRemovedWeight:outsideRemoved};
      })};
  }
  function dispose(){if(disposed)return;disposed=true;object.removeFromParent();for(const p of patches)p.geometry.dispose();material.dispose();object.clear();patches.length=0;}
  return {object,setState,report,dispose};
}
