import { Float32BufferAttribute, Color } from 'three';

const smooth=(a,b,p)=>{const t=Math.max(0,Math.min(1,(p-a)/(b-a)));return t*t*(3-2*t);};
function inject(source,anchor,code){if(!source.includes(anchor))throw new Error('Missing cavity shader hook '+anchor);return source.replace(anchor,anchor+'\n'+code);}

/** Precomputed inward deformation of the native exterior. The original mesh
 * and the contralateral 46 never acquire morph buffers or tissue attributes.
 */
export function createCaries({arch,data,config,clay=false}) {
  const mesh=arch.teeth.get(36)?.mesh;
  if(!mesh||mesh.geometry.attributes.position.count!==data.vertexCount)throw new Error('Caries asset does not match the native FDI36 surface.');
  const original=mesh.geometry,geometry=original.clone();
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
  };
  if(!clay)material.onBeforeCompile=(shader,renderer)=>{
    baseCompile.call(material,shader,renderer);Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=inject(shader.vertexShader,'#include <common>','attribute vec4 lesionRegion; varying vec4 vLesion;');
    shader.vertexShader=inject(shader.vertexShader,'#include <begin_vertex>','vLesion=lesionRegion;');
    shader.fragmentShader=inject(shader.fragmentShader,'#include <common>',`varying vec4 vLesion; uniform float lesionProgress; uniform vec3 lesionChalk; uniform vec3 lesionFloor; uniform vec3 lesionMargin;`);
    shader.fragmentShader=inject(shader.fragmentShader,'diffuseColor.rgb += (toothRegion.b - 0.5) * toothColorVariation;',`
      float chalkStage=smoothstep(0.0,0.28,lesionProgress)*(1.0-smoothstep(0.35,0.8,lesionProgress));
      float matureStage=smoothstep(0.22,1.0,lesionProgress);
      diffuseColor.rgb=mix(diffuseColor.rgb,lesionChalk,0.72*chalkStage*vLesion.r);
      vec3 damagedTissue=mix(lesionMargin,lesionFloor,clamp(vLesion.g,0.0,1.0));
      damagedTissue*=1.0+0.045*(vLesion.a-0.5*vLesion.r);
      diffuseColor.rgb=mix(diffuseColor.rgb,damagedTissue,matureStage*clamp(vLesion.g+0.26*vLesion.b,0.0,1.0));
    `);
    shader.fragmentShader=inject(shader.fragmentShader,'roughnessFactor = clamp(roughnessFactor, toothRoughnessLimits.x, toothRoughnessLimits.y);',`
      roughnessFactor=mix(roughnessFactor,0.62,clamp(vLesion.r*smoothstep(0.0,0.35,lesionProgress)*0.8,0.0,1.0));
    `);
    shader.fragmentShader=inject(shader.fragmentShader,'reflectedLight.indirectDiffuse *= toothAO;',`
      reflectedLight.indirectDiffuse*=1.0-0.20*vLesion.g*smoothstep(0.22,1.0,lesionProgress);
    `);
  };
  if(!clay)material.customProgramCacheKey=()=>baseKey+'-native-proximal-cavity-v1';material.needsUpdate=true;
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
