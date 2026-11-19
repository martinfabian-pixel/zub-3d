import { MeshDepthMaterial, Vector2 } from 'three';
import { prepareMaterial } from '../prototype/materials.js';

/** The approved opaque material, with ordinary alpha composition only during
 * introduction. Writing a white opaque fragment would incorrectly erase an
 * existing tooth behind it. At full reveal the surface is opaque, depth-writing
 * PBR again. Depth is retained during the sorted introduction pass to resolve
 * these closed surfaces consistently near alpha=1. Introduction alpha is not
 * an enamel translucency/SSS model.
 */
export function prepareJourneyMaterial(mesh, config, profile, renderer, clay = false, crownFdi = null) {
  prepareMaterial(mesh, config, profile, renderer, clay);
  const material = mesh.material;
  if(crownFdi!==null&&!clay) {
    mesh.geometry.computeBoundingBox();
    const {min,max}=mesh.geometry.boundingBox;
    const extent={value:new Vector2(min.y,1/(max.y-min.y))},incisor={value:crownFdi%10<=2?1:0};
    // The lower arch is seated 0.69 cm behind the upper at the midline.
    const frontDepth = { value: crownFdi < 30 ? 2.42 : 1.73 };
    const compile=material.onBeforeCompile, key=material.customProgramCacheKey();
    material.onBeforeCompile=function(shader,renderer) {
      compile.call(this,shader,renderer);
      shader.uniforms.crownExtent=extent;shader.uniforms.crownIncisor=incisor;
      shader.uniforms.crownFrontDepth = frontDepth;
      shader.vertexShader=shader.vertexShader
        .replace('#include <common>','#include <common>\nuniform vec2 crownExtent; varying float vCrownHeight; varying float vMesiodistalNormal;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nvCrownHeight=(position.y-crownExtent.x)*crownExtent.y;\nvMesiodistalNormal=normal.x;');
      shader.fragmentShader=shader.fragmentShader
        .replace('#include <common>','#include <common>\nuniform float crownIncisor, crownFrontDepth; varying float vCrownHeight; varying float vMesiodistalNormal;')
        .replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
          diffuseColor.rgb *= mix(vec3(1.,.993,.979),vec3(1.),smoothstep(.02,.38,vCrownHeight));`)
        .replace('#include <transmission_fragment>',`#include <transmission_fragment>
          // A seated neighbour shields part of the studio environment along
          // each proximal face. Retain the broad labial reflection and the
          // brighter return of light through the last part of the incisal edge.
          float flank = smoothstep(.50,.96,abs(vMesiodistalNormal));
          flank *= mix(1.,.57,smoothstep(.83,.99,vCrownHeight));
          totalDiffuse -= reflectedLight.indirectDiffuse * flank * mix(.26,.42,crownIncisor);
          #ifdef USE_ENVMAP
          // A diffuse approximation of light entering the thin incisal edge.
          // The enamel still writes a solid, correctly occluding depth surface.
          if(crownIncisor>.5 && vCrownHeight>.68) {
            float thin=smoothstep(.68,.97,vCrownHeight);
            vec3 reverseLight=getIBLIrradiance(-normal)*RECIPROCAL_PI;
            totalDiffuse=mix(totalDiffuse,reverseLight*vec3(.83,.96,1.03),.13*thin);
          }
          #endif
          // The smile rig faces +Z. Let light fall away continuously behind
          // the front teeth as both limbs of the arch recede into the mouth.
          float depth = max(0., crownFrontDepth-vToothPosition.z);
          float bounce = 1./(1.+depth*(.40+.105*depth));
          // Soft studio fill reaches the exposed labial surfaces; the side
          // walls retain their contact shadow. Keep the HDR's luminance detail.
          float labial = smoothstep(.14,.94,inverseTransformDirection(normal,viewMatrix).z);
          totalDiffuse += reflectedLight.indirectDiffuse * (.13+.48*labial) * (1.-flank);
          totalDiffuse = mix(vec3(luminance(totalDiffuse)),totalDiffuse,.21);
          totalDiffuse *= vec3(.88,.89,.90)*bounce;
          // A broad frontal strip reflected by the polished enamel. Evaluate
          // the reflection in studio space so it travels across the curvature
          // as the observer moves. The authored roughness softens its edges.
          vec3 reflected = inverseTransformDirection(reflect(-normalize(vViewPosition),normal),viewMatrix);
          vec2 strip = (reflected.xy-vec2(-.20,.19))/(vec2(.21,.35)+.38*material.roughness);
          float sheen = exp(-dot(strip,strip))*smoothstep(.38,.8,reflected.z);
          totalSpecular += .8*reflectedLight.directSpecular + vec3(.94,.96,.98)*sheen;
          totalSpecular *= mix(.22,1.,bounce);`);
    };
    material.customProgramCacheKey=()=>key+'-cervical-incisal';
  }
  // r186 PCF uses a native depth texture. Built-in hashed coverage makes the
  // *shadow* grow with the reveal instead of switching on at a hard threshold.
  // The visible physical surface never uses an alpha-hashed grain pattern.
  const introductionDepth=new MeshDepthMaterial({alphaHash:true});
  let reveal = 0;
  return {
    material,
    setReveal(value) {
      reveal = value;
      const fading=value<1;
      if(material.transparent!==fading){material.transparent=fading;material.needsUpdate=true;}
      material.opacity=value;
      material.depthWrite=true;
      introductionDepth.opacity=value;
      mesh.customDepthMaterial=fading?introductionDepth:undefined;
      mesh.visible = value > 0.00001;
      mesh.castShadow = mesh.visible;
    },
    getReveal: () => reveal,
    dispose() {introductionDepth.dispose();mesh.customDepthMaterial=undefined;},
  };
}

// Both opaque representations sample the same coverage at each screen pixel.
// A pixel belongs to exactly one representation, even where their surfaces overlap.
export function addSmileDissolve(material, mix, crown) {
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  const reject = crown ? 'coverage >= smileMix' : 'coverage < smileMix';
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    shader.uniforms.smileMix = mix;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float smileMix;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (smileMix > 0.0 && smileMix < 1.0) {
          float coverage = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (${reject}) discard;
        }
      `);
  };
  material.customProgramCacheKey = () => `${key}-smile-${crown ? 'crown' : 'root'}`;
  material.needsUpdate = true;
}
