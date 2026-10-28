import * as THREE from 'three';

// A static, distance-weighted projection of THIS exterior; never an ellipse stamp.
// It is just a subtle grounding cue. Directional shadow supplies self-occlusion.
export function createContactShadow(renderer, model, bounds, config, profile) {
  const settings = config.lighting.shadow;
  const extent = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) + settings.extentPadding;
  const floorY = bounds.min.y - settings.gap;
  const resolution = config.quality[profile.compact ? 'compact' : 'desktop'].contactSize;
  const options = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false };
  const capture = new THREE.WebGLRenderTarget(resolution, resolution, { ...options, depthBuffer: true });
  const horizontal = new THREE.WebGLRenderTarget(resolution, resolution, options);
  const final = new THREE.WebGLRenderTarget(resolution, resolution, options);
  const oldTarget = renderer.getRenderTarget();
  const oldClear = renderer.getClearColor(new THREE.Color());
  const oldAlpha = renderer.getClearAlpha();
  const oldShadows = renderer.shadowMap.enabled;
  const depthScene = new THREE.Scene();
  depthScene.add(model.clone(true)); // Geometry is shared, not duplicated or disposed here.
  const depthMaterial = new THREE.ShaderMaterial({
    uniforms: { floorY: { value: floorY }, falloff: { value: settings.falloff } },
    vertexShader: `uniform float floorY; varying float h; void main(){ vec4 p=modelMatrix*vec4(position,1.0); h=max(0.0,p.y-floorY); gl_Position=projectionMatrix*viewMatrix*p; }`,
    fragmentShader: `uniform float falloff; varying float h; void main(){ gl_FragColor=vec4(vec3(exp(-h*falloff)),1.0); }`,
    toneMapped: false,
  });
  depthScene.overrideMaterial = depthMaterial;
  const camera = new THREE.OrthographicCamera(-extent / 2, extent / 2, extent / 2, -extent / 2, 0.005, 8);
  camera.position.set(0, floorY, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, floorY + 1, 0);
  const quadGeometry = new THREE.PlaneGeometry(2, 2);
  const blur = new THREE.ShaderMaterial({
    uniforms: { source: { value: capture.texture }, direction: { value: new THREE.Vector2() } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`,
    fragmentShader: `uniform sampler2D source; uniform vec2 direction; varying vec2 vUv; void main(){
      vec4 v=texture2D(source,vUv)*0.2270270270;
      v+=texture2D(source,vUv+direction*1.3846153846)*0.3162162162;
      v+=texture2D(source,vUv-direction*1.3846153846)*0.3162162162;
      v+=texture2D(source,vUv+direction*3.2307692308)*0.0702702703;
      v+=texture2D(source,vUv-direction*3.2307692308)*0.0702702703;
      gl_FragColor=v; }`,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const blurScene = new THREE.Scene();
  blurScene.add(new THREE.Mesh(quadGeometry, blur));
  const blurCamera = new THREE.Camera();
  try {
    renderer.shadowMap.enabled = false;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(capture);
    renderer.render(depthScene, camera);
    blur.uniforms.direction.value.set(settings.spread / extent, 0);
    renderer.setRenderTarget(horizontal);
    renderer.render(blurScene, blurCamera);
    blur.uniforms.source.value = horizontal.texture;
    blur.uniforms.direction.value.set(0, settings.spread / extent);
    renderer.setRenderTarget(final);
    renderer.render(blurScene, blurCamera);
  } catch (error) { final.dispose(); throw error; }
  finally {
    renderer.setRenderTarget(oldTarget);
    renderer.setClearColor(oldClear, oldAlpha);
    renderer.shadowMap.enabled = oldShadows;
    capture.dispose(); horizontal.dispose(); depthMaterial.dispose(); blur.dispose(); quadGeometry.dispose();
  }
  const material = new THREE.MeshBasicMaterial({ color: settings.color, alphaMap: final.texture, opacity: settings.opacity, transparent: true, depthWrite: false, toneMapped: false });
  final.texture.repeat.x = -1;
  final.texture.offset.x = 1;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(extent, extent), material);
  plane.name = 'Subtle static contact shadow';
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = floorY;
  let disposed = false;
  return { object: plane, dispose() { if (disposed) return; disposed = true; plane.removeFromParent(); plane.geometry.dispose(); material.dispose(); final.dispose(); } };
}
