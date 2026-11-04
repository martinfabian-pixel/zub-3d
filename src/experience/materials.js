import { MeshDepthMaterial } from 'three';
import { prepareMaterial } from '../prototype/materials.js';

/** The approved opaque material, with ordinary alpha composition only during
 * introduction. Writing a white opaque fragment would incorrectly erase an
 * existing tooth behind it. At full reveal the surface is opaque, depth-writing
 * PBR again. Depth is retained during the sorted introduction pass to resolve
 * these closed surfaces consistently near alpha=1. Introduction alpha is not
 * an enamel translucency/SSS model.
 */
export function prepareJourneyMaterial(mesh, config, profile, renderer, clay = false) {
  prepareMaterial(mesh, config, profile, renderer, clay);
  const material = mesh.material;
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
