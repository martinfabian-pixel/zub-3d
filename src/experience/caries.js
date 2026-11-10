import { Float32BufferAttribute, Color, Vector2, Vector3 } from 'three';
import { refineCavitySurface } from './cavity-surface.js';

const smooth=(a,b,p)=>{const t=Math.max(0,Math.min(1,(p-a)/(b-a)));return t*t*(3-2*t);};
function inject(source,anchor,code){if(!source.includes(anchor))throw new Error('Missing cavity shader hook '+anchor);return source.replace(anchor,anchor+'\n'+code);}

function validFrame(frame) {
  const finite=(value,n)=>Array.isArray(value)&&value.length===n&&value.every(Number.isFinite);
  return frame&&[frame.originMetres,frame.uMmPerMetre,frame.vMmPerMetre].every(value=>finite(value,3))
    &&finite(frame.profileRadiiMm,2)&&frame.profileRadiiMm.every(x=>x>0)&&Number.isFinite(frame.rotationRadians);
}

/** Precomputed inward deformation of the native exterior. The original mesh
 * and the contralateral 46 never acquire morph buffers or tissue attributes.
 */
export function createCaries({arch,data,config,clay=false}) {
  const mesh=arch.teeth.get(36)?.mesh;
  if(!mesh||mesh.geometry.attributes.position.count!==data.refinement?.sourceVertexCount)throw new Error('Caries asset does not match the native FDI36 surface.');
  const count=data.indices.length;
  if(!validFrame(data.materialFrame)||data.positionDelta.length!==count*3||data.normalDelta.length!==count*3||
    data.region.length!==count*4||!data.positionDelta.every(Number.isFinite)||!data.normalDelta.every(Number.isFinite)||
    !data.region.every(x=>x>=0&&x<=1))throw new Error('Cavity material and morph data are incomplete.');
  const original=mesh.geometry,geometry=refineCavitySurface(original,data);
  const positions=new Float32Array(data.vertexCount*3),normals=new Float32Array(data.vertexCount*3),regions=new Float32Array(data.vertexCount*4);
  for(let i=0;i<data.indices.length;i++) {
    const vertex=data.indices[i];
    if(!Number.isInteger(vertex)||vertex<0||vertex>=data.vertexCount)throw new Error('Invalid sparse lesion vertex.');
    for(let k=0;k<3;k++){positions[3*vertex+k]=data.positionDelta[3*i+k];normals[3*vertex+k]=data.normalDelta[3*i+k];}
    for(let k=0;k<4;k++)regions[4*vertex+k]=data.region[4*i+k];
  }
  geometry.morphTargetsRelative=true;
  geometry.morphAttributes.position=[new Float32BufferAttribute(positions,3)];
  geometry.morphAttributes.normal=[new Float32BufferAttribute(normals,3)];
  geometry.setAttribute('lesionRegion',new Float32BufferAttribute(regions,4));
  mesh.geometry=geometry;mesh.updateMorphTargets();
  const material=mesh.material,baseCompile=material.onBeforeCompile,baseKey=material.customProgramCacheKey();
  const settings=config.caries;
  const uniforms={
    lesionProgress:{value:0},lesionChalk:{value:new Color(settings.chalk)},
    lesionFloor:{value:new Color(settings.floor)},lesionMargin:{value:new Color(settings.margin)},
    lesionOrigin:{value:new Vector3().fromArray(data.materialFrame.originMetres)},
    lesionU:{value:new Vector3().fromArray(data.materialFrame.uMmPerMetre)},
    lesionV:{value:new Vector3().fromArray(data.materialFrame.vMmPerMetre)},
    lesionRadii:{value:new Vector2().fromArray(data.materialFrame.profileRadiiMm)},
    lesionAngle:{value:data.materialFrame.rotationRadians},
  };
  if(!clay)material.onBeforeCompile=(shader,renderer)=>{
    baseCompile.call(material,shader,renderer);Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=inject(shader.vertexShader,'#include <common>',
      'attribute vec4 lesionRegion; varying vec4 vLesion; varying vec2 vLesionMm; uniform vec3 lesionOrigin,lesionU,lesionV;');
    shader.vertexShader=inject(shader.vertexShader,'#include <begin_vertex>',
      'vLesion=lesionRegion; vLesionMm=vec2(dot(position-lesionOrigin,lesionU),dot(position-lesionOrigin,lesionV));');
    shader.fragmentShader=inject(shader.fragmentShader,'#include <common>',`
      varying vec4 vLesion; varying vec2 vLesionMm;
      uniform float lesionProgress,lesionAngle; uniform vec2 lesionRadii;
      uniform vec3 lesionChalk,lesionFloor,lesionMargin;
      float cavityGrain(vec2 p){
        vec2 cell=floor(p), t=fract(p);
        t=t*t*(3.0-2.0*t);
        // Smooth, deterministic material mottling in local millimetres.
        vec4 key=vec4(dot(cell,vec2(51.7,137.3)))+vec4(0.0,51.7,137.3,189.0);
        vec4 value=fract(sin(key)*15731.743);
        return mix(mix(value.x,value.y,t.x),mix(value.z,value.w,t.x),t.y)-0.5;
      }
      float cavityRadius(vec2 p){
        float c=cos(lesionAngle), s=sin(lesionAngle);
        vec2 q=vec2(c*p.x+s*p.y,-s*p.x+c*p.y);
        vec2 uv=vec2(q.x-0.062*sin(3.1*q.y),q.y+0.095*q.x-0.055*sin(3.3*q.x))/lesionRadii;
        float theta=atan(uv.y,uv.x);
        float outline=1.0+0.103*sin(3.0*theta+0.42)+0.059*cos(5.0*theta-0.52)+0.027*sin(7.0*theta+1.08);
        float r=length(uv)/outline;
        return r+0.019*sin(12.0*theta+0.58)*smoothstep(0.45,0.76,r);
      }`);
    shader.fragmentShader=inject(shader.fragmentShader,'diffuseColor.rgb += (toothRegion.b - 0.5) * toothColorVariation;',`
      float chalkStage=smoothstep(0.0,0.28,lesionProgress)*(1.0-smoothstep(0.35,0.8,lesionProgress));
      float matureStage=smoothstep(0.22,1.0,lesionProgress);
      // Differentiate the continuous local coordinates before branching;
      // unlike derivatives of a conditional radius these are stable at the
      // boundary. Skip the expensive irregular outline on healthy enamel.
      float pixelWidth=clamp(length(fwidth(vLesionMm)/lesionRadii),0.002,0.04);
      float cavityR=2.0;
      if(vLesion.r>0.0001 && lesionProgress>0.0) cavityR=cavityRadius(vLesionMm);
      float cavityEdge=1.0-smoothstep(0.963-pixelWidth,0.986+pixelWidth,cavityR);
      // Vertex weights are a smooth deformation guide, not an edge mask.
      // Using them directly as opacity washes the wall into the enamel over
      // hundreds of pixels in a macro view.  Keep their spatial eligibility,
      // then resolve the irregular rim per fragment in the authored frame.
      float supported=smoothstep(0.005,0.045,vLesion.g+vLesion.b);
      float wall=cavityEdge*supported;
      float lip=smoothstep(0.87,0.97,cavityR)*(1.0-smoothstep(1.0,1.065+pixelWidth,cavityR))*supported;
      diffuseColor.rgb=mix(diffuseColor.rgb,lesionChalk,0.72*chalkStage*vLesion.r);
      diffuseColor.rgb=mix(diffuseColor.rgb,lesionChalk,0.23*matureStage*lip*vLesion.r);
      float grit=0.0;
      float footprint=max(fwidth(vLesionMm.x),fwidth(vLesionMm.y));
      if(wall*matureStage>0.001){
        // Layer two filtered, non-repeating mineral tones only on the exposed
        // basin; the enamel itself stays smooth. Screen derivatives suppress
        // details below a pixel instead of aliasing on mobile.
        grit=0.68*cavityGrain(vLesionMm*3.8)*(1.0-smoothstep(0.11,0.20,footprint))
            +0.32*cavityGrain(vLesionMm*9.1+4.31)*(1.0-smoothstep(0.05,0.10,footprint));
      }
      vec3 innerEnamel=mix(diffuseColor.rgb,lesionMargin,0.46);
      // Read the steep inner wall separately from the rougher basin. Both
      // follow the precomputed depression rather than a flat colour decal.
      float basin=smoothstep(0.16,0.78,vLesion.g);
      vec3 tissue=mix(innerEnamel,lesionFloor,0.27+0.73*basin);
      tissue*=mix(1.02,0.88,basin);
      tissue*=1.0+0.22*(vLesion.a-0.5*vLesion.r)+0.62*grit*(0.35+0.65*basin);
      diffuseColor.rgb=mix(diffuseColor.rgb,tissue,matureStage*wall);
    `);
    shader.fragmentShader=inject(shader.fragmentShader,'roughnessFactor = clamp(roughnessFactor, toothRoughnessLimits.x, toothRoughnessLimits.y);',`
      roughnessFactor=mix(roughnessFactor,0.62,0.78*vLesion.r*chalkStage);
      roughnessFactor=mix(roughnessFactor,0.56+0.18*vLesion.g+0.06*grit,matureStage*wall);
    `);
    shader.fragmentShader=inject(shader.fragmentShader,'reflectedLight.indirectDiffuse *= toothAO;',`
      reflectedLight.indirectDiffuse*=1.0-0.26*vLesion.g*matureStage;
    `);
  };
  if(!clay)material.customProgramCacheKey=()=>baseKey+'-proximal-cavity-detail-v3';material.needsUpdate=true;
  // The unchanged healthy buffer was already uploaded for the first frame.
  // Its CPU data remain available as the protected source; free its old GPU VBO.
  let shared=false;arch.object.traverse(other=>{if(other!==mesh&&other.geometry===original)shared=true;});
  if(!shared)original.dispose();
  let progress=0,disposed=false;
  return {
    setProgress(value){progress=Math.max(0,Math.min(1,value));uniforms.lesionProgress.value=progress;mesh.morphTargetInfluences[0]=smooth(.25,1,progress);},
    report(){return{fdi:36,progress,morphInfluence:mesh.morphTargetInfluences[0],sparseVertices:data.indices.length,maximumDepthMm:data.audit?.maximumMeasuredDepressionMm??data.audit?.maximumDepthMm,isolated:arch.teeth.get(46)?.mesh.geometry!==geometry,geometryUuid:geometry.uuid};},
    dispose(){if(disposed)return;disposed=true;mesh.geometry=original;mesh.updateMorphTargets();geometry.dispose();material.onBeforeCompile=baseCompile;material.customProgramCacheKey=()=>baseKey;material.needsUpdate=true;},
  };
}
