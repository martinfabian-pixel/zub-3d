import { Matrix4, Mesh, Vector3 } from 'three';

// A viewing ray opens FDI 37 only if the registered working corridor is
// behind its surface. The capsule lives in the tooth's coordinates. Rotating
// the camera can expose the far wall naturally without making that wall fade.
const fragment = `
  uniform vec3 windowEntry, windowEnd;
  uniform float windowRadius, windowAmount;
  float cleaningCoverage(vec3 surface) {
    vec3 ray = normalize(surface);
    vec3 span = windowEnd - windowEntry;
    vec3 lateral = span - ray * dot(span, ray);
    vec3 offset = windowEntry - ray * dot(windowEntry, ray);
    float at = clamp(-dot(lateral, offset) / max(dot(lateral, lateral), 1e-8), 0., 1.);
    vec3 focus = windowEntry + span * at;
    float distanceToRay = length(offset + lateral * at);
    float behind = dot(focus - surface, ray);
    return windowAmount * (1. - smoothstep(windowRadius * .55, windowRadius, distanceToRay))
      * smoothstep(-.004, .045, behind);
  }
`;

function windowMaterial(source, uniforms, veil) {
  // Material.copy serializes userData, which would encode the original
  // tooth's region texture into an image twice just to construct this view.
  // The original already owns those shader uniforms and texture resources.
  const borrowed=Object.create(source);
  borrowed.userData={};
  const material=new source.constructor().copy(borrowed), compile=source.onBeforeCompile, key=source.customProgramCacheKey();
  // The two passes are the same enamel. The map locator can tint the host
  // while this temporary material is installed, including on reverse scroll.
  material.color=source.color;
  material.transparent=veil;
  material.depthWrite=!veil;
  material.opacity=1;
  material.name=veil?'FDI 37 · okraj priehľadu':'FDI 37 · lokálny priehľad';
  material.customProgramCacheKey=()=>key+'-cleaning-window-'+veil;
  material.onBeforeCompile=function(shader,renderer){
    compile.call(this,shader,renderer);
    Object.assign(shader.uniforms,uniforms);
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>','#include <common>\n'+fragment)
      .replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
        float windowCoverage = cleaningCoverage(-vViewPosition);
        if (${veil?'windowCoverage < .001':'windowCoverage >= .001'}) discard;
      `);
    if(veil)shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      float grazing = 1. - abs(dot(normalize(vNormal), normalize(vViewPosition)));
      diffuseColor.a *= mix(1., .045 + .39 * pow(clamp(grazing,0.,1.),3.), windowCoverage);
      #include <opaque_fragment>
    `);
  };
  return material;
}

export function createCleaningWindow(item, path) {
  const host=item.mesh;
  const original=host.material;
  // Loading can finish during the opening flight. Register using the surveyed
  // seat, then carry the two endpoints with the actual tooth at render time.
  const toLocal=item.seatedMatrix.clone().invert(), toEye=new Matrix4();
  const uniforms={windowEntry:{value:new Vector3()},windowEnd:{value:new Vector3()},
    windowRadius:{value:path.dimensions.bristleRadiusMm*.1*2.65},windowAmount:{value:0}};
  const entry=path.sample(path.contactRangeMm[0]-1.1).position.applyMatrix4(toLocal);
  const end=path.sample(path.tipRangeMm[1]+.45).position.applyMatrix4(toLocal);
  const opaque=windowMaterial(original,uniforms,false),thin=windowMaterial(original,uniforms,true);
  const ghost=new Mesh(host.geometry,thin);
  ghost.renderOrder=8;
  ghost.receiveShadow=host.receiveShadow;
  ghost.raycast=()=>{};
  ghost.visible=false;
  host.add(ghost);
  let amount=0,last=0;
  function show(visible){
    host.material=visible?opaque:original;
    ghost.visible=visible;
  }
  return {
    update(camera, enabled, now, instant=false) {
      const target=enabled?1:0;
      const dt=last?Math.min(.05,(now-last)*.001):1/60;
      amount=instant?target:target+(amount-target)*Math.exp(-dt*18);
      if(Math.abs(target-amount)<.002)amount=target;
      uniforms.windowAmount.value=amount;
      if(ghost.visible!==(amount>0))show(amount>0);
      if(amount>0){
        toEye.multiplyMatrices(camera.matrixWorldInverse,host.matrixWorld);
        uniforms.windowEntry.value.copy(entry).applyMatrix4(toEye);
        uniforms.windowEnd.value.copy(end).applyMatrix4(toEye);
      }
      last=amount===target?0:now;
      return amount!==target;
    },
    prewarm(renderer,camera,scene){
      show(true);
      try{return renderer.compileAsync(host,camera,scene);}
      finally{show(false);}
    },
    get amount(){return amount;},
    dispose(){show(false);ghost.removeFromParent();opaque.dispose();thin.dispose();},
  };
}
