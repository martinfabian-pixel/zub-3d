import { createScene as createApprovedScene, disposeObject } from '../prototype/scene.js';

export { disposeObject };

/** r186 uploads three physical-lighting LUTs outside mesh texture ownership.
 * This page owns one renderer. Release its uploaded LUTs before material and
 * renderer teardown; Texture.dispose keeps their shared CPU data reusable.
 * Keep this small version-specific adapter here, outside frame/render logic.
 */
export function releaseRendererLuts(renderer,root) {
  if(!renderer||!root)return;
  const textures=new Set();
  root.traverse(object=>{
    for(const material of object.material?(Array.isArray(object.material)?object.material:[object.material]):[]) {
      const uniforms=renderer.properties.get(material).uniforms;
      for(const name of ['dfgLUT','ltc_1','ltc_2'])if(uniforms?.[name]?.value?.isTexture)textures.add(uniforms[name].value);
    }
  });
  for(const texture of textures)texture.dispose();
}

export function createScene(canvas, config, profile) {
  const state = createApprovedScene(canvas, config, profile);
  // The light rig follows the camera composition while teeth stay fixed.
  // On-demand rendering means these maps are refreshed only on visible change.
  state.renderer.shadowMap.autoUpdate = true;
  return state;
}
