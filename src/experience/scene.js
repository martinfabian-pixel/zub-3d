import { createScene as createApprovedScene, disposeObject } from '../prototype/scene.js';

export { disposeObject };

export function createScene(canvas, config, profile) {
  const state = createApprovedScene(canvas, config, profile);
  // The light rig follows the camera composition while teeth stay fixed.
  // On-demand rendering means these maps are refreshed only on visible change.
  state.renderer.shadowMap.autoUpdate = true;
  return state;
}
