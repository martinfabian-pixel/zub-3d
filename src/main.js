import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';

const canvas = document.querySelector('#tooth-canvas');
const status = document.querySelector('#status');
const statusMessage = document.querySelector('#status-message');
const controlsElement = document.querySelector('#controls');
const retry = document.querySelector('#retry');
retry.addEventListener('click', () => window.location.reload());

function showError(message, error) {
  console.error(error);
  status.hidden = false;
  status.classList.add('error');
  status.setAttribute('role', 'alert');
  statusMessage.textContent = message;
  retry.hidden = false;
  controlsElement.hidden = true;
}

// A neutral studio light rig is generated locally; no remote HDR dependency.
function studioEnvironment(renderer) {
  const room = new THREE.Scene();
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(24, 24, 24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(0.10), side: THREE.BackSide }),
  );
  room.add(walls);

  const panel = (width, height, position, intensity, tint = 0xffffff) => {
    const light = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    light.position.set(...position);
    light.lookAt(0, 0, 0);
    room.add(light);
  };
  // Large neutral cards produce broad reflections instead of point-light glints.
  // Dark spaces between them preserve curvature and readable enamel highlights.
  panel(6, 9, [-6, 5, 6], 5.0, 0xfffcf7);
  panel(5, 7, [7, 2, 4], 1.65, 0xf5f8ff);
  panel(7, 6, [0, 9, -2], 3.8);
  panel(2.5, 7, [-3, 1, -7], 2.2);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const result = pmrem.fromScene(room, 0.025);
  room.traverse((object) => {
    object.geometry?.dispose();
    object.material?.dispose();
  });
  pmrem.dispose();
  return result;
}

// Capture the actual geometry from the floor, then blur the distance-weighted
// silhouette. This is a one-time GPU bake: orbiting never reruns these passes.
function bakeContactShadow(renderer, model, groundY, extent) {
  const resolution = window.matchMedia('(max-width: 600px)').matches ? 512 : 1024;
  const options = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false };
  const capture = new THREE.WebGLRenderTarget(resolution, resolution, { ...options, depthBuffer: true });
  const horizontal = new THREE.WebGLRenderTarget(resolution, resolution, options);
  const blurred = new THREE.WebGLRenderTarget(resolution, resolution, options);
  const previousTarget = renderer.getRenderTarget();
  const previousClear = renderer.getClearColor(new THREE.Color());
  const previousAlpha = renderer.getClearAlpha();
  const previousShadows = renderer.shadowMap.enabled;

  const depthScene = new THREE.Scene();
  depthScene.add(model.clone(true));
  const depthMaterial = new THREE.ShaderMaterial({
    uniforms: { floorY: { value: groundY } },
    vertexShader: `
      uniform float floorY;
      varying float vHeight;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vHeight = max(0.0, world.y - floorY);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      varying float vHeight;
      void main() {
        float contact = exp(-vHeight * 1.8);
        gl_FragColor = vec4(vec3(contact), 1.0);
      }
    `,
    toneMapped: false,
  });
  depthScene.overrideMaterial = depthMaterial;
  const depthCamera = new THREE.OrthographicCamera(-extent / 2, extent / 2, extent / 2, -extent / 2, 0.005, 6);
  depthCamera.position.set(0, groundY, 0);
  depthCamera.up.set(0, 0, -1);
  depthCamera.lookAt(0, groundY + 1, 0);

  const blurMaterial = new THREE.ShaderMaterial({
    uniforms: { source: { value: null }, direction: { value: new THREE.Vector2() } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D source;
      uniform vec2 direction;
      varying vec2 vUv;
      void main() {
        vec4 sum = texture2D(source, vUv) * 0.2270270270;
        sum += texture2D(source, vUv + direction * 1.3846153846) * 0.3162162162;
        sum += texture2D(source, vUv - direction * 1.3846153846) * 0.3162162162;
        sum += texture2D(source, vUv + direction * 3.2307692308) * 0.0702702703;
        sum += texture2D(source, vUv - direction * 3.2307692308) * 0.0702702703;
        gl_FragColor = sum;
      }
    `,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const blurScene = new THREE.Scene();
  const quadGeometry = new THREE.PlaneGeometry(2, 2);
  blurScene.add(new THREE.Mesh(quadGeometry, blurMaterial));
  const blurCamera = new THREE.Camera();

  try {
    renderer.shadowMap.enabled = false;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(capture);
    renderer.render(depthScene, depthCamera);
    // The kernel is specified in world units, keeping its softness consistent
    // across mobile and desktop resolutions. Two passes retain root contours.
    blurMaterial.uniforms.source.value = capture.texture;
    blurMaterial.uniforms.direction.value.set(0.035 / extent, 0);
    renderer.setRenderTarget(horizontal);
    renderer.render(blurScene, blurCamera);
    blurMaterial.uniforms.source.value = horizontal.texture;
    blurMaterial.uniforms.direction.value.set(0, 0.035 / extent);
    renderer.setRenderTarget(blurred);
    renderer.render(blurScene, blurCamera);
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousClear, previousAlpha);
    renderer.shadowMap.enabled = previousShadows;
    capture.dispose();
    horizontal.dispose();
    depthMaterial.dispose();
    blurMaterial.dispose();
    quadGeometry.dispose();
  }

  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(extent, extent),
    new THREE.MeshBasicMaterial({
      color: 0x514d47,
      alphaMap: blurred.texture,
      opacity: 0.30,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  contact.rotation.x = -Math.PI / 2;
  // An upward-looking capture with up=-Z reverses X relative to this plane.
  contact.material.alphaMap.repeat.x = -1;
  contact.material.alphaMap.offset.x = 1;
  contact.position.y = groundY;
  contact.name = 'Baked geometry contact shadow';
  return contact;
}

async function start() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  const environment = studioEnvironment(renderer);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.8;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.7;
  controls.minPolarAngle = 0.04;
  controls.maxPolarAngle = Math.PI - 0.04;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;

  const key = new THREE.DirectionalLight(0xfffcf7, 1.0);
  key.position.set(-3.8, 8.8, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -3;
  key.shadow.camera.right = key.shadow.camera.top = 3;
  key.shadow.camera.near = 0.1;
  key.shadow.camera.far = 24;
  key.shadow.normalBias = 0.006;
  key.shadow.bias = -0.0001;
  key.shadow.radius = 2;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xf5f8ff, 0.28);
  fill.position.set(4, 1.5, 4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.45);
  rim.position.set(2, 4, -4);
  scene.add(rim);

  let ready = false;
  let frame = 0;
  let homeDistance = 8;
  let minimumDistance = 2.2;
  let homeProjection = new Float32Array(0);
  const homeDirection = new THREE.Vector3(0.44, 0.50, 1).normalize();
  const modelHeight = 3.8;
  const target = new THREE.Vector3(0, 0.05, 0);

  function render() {
    frame = 0;
    const changing = controls.update();
    try {
      renderer.render(scene, camera);
    } catch (error) {
      showError('3D zobrazenie sa nepodarilo vykresliť. Skúste prehliadač obnoviť.', error);
      return;
    }
    canvas.dataset.camera = camera.position.toArray().map((value) => value.toFixed(4)).join(',');
    canvas.dataset.distance = camera.position.distanceTo(controls.target).toFixed(4);
    if (changing) requestRender();
  }
  function requestRender() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(render);
  }
  controls.addEventListener('change', requestRender);

  function fitDistance() {
    const tangentY = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const tangentX = tangentY * camera.aspect;
    // The actual tooth silhouette fills roughly 75% of the limiting dimension.
    // Include each vertex's depth; a flat width/height estimate underestimates
    // the nearer cusps and overestimates empty corners around the roots.
    let distance = minimumDistance;
    for (let index = 0; index < homeProjection.length; index += 3) {
      const depth = homeProjection[index + 2];
      distance = Math.max(
        distance,
        depth + homeProjection[index] * 1.31 / tangentX,
        depth + homeProjection[index + 1] * 1.27 / tangentY,
      );
    }
    return distance;
  }

  function resetView() {
    homeDistance = fitDistance();
    // Flush any remaining drag damping before restoring the exact home pose.
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    controls.target.copy(target);
    camera.position.copy(target).addScaledVector(homeDirection, homeDistance);
    controls.minDistance = minimumDistance;
    controls.maxDistance = homeDistance * 2.5;
    controls.update();
    controls.enableDamping = damping;
    controls.saveState();
    requestRender();
  }

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const previousHome = homeDistance;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    if (ready) {
      homeDistance = fitDistance();
      const offset = camera.position.clone().sub(controls.target);
      const nextDistance = Math.max(minimumDistance, offset.length() * homeDistance / previousHome);
      camera.position.copy(controls.target).add(offset.setLength(nextDistance));
      controls.minDistance = minimumDistance;
      controls.maxDistance = homeDistance * 2.5;
    }
    requestRender();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/molar.glb`, (event) => {
    if (event.lengthComputable) statusMessage.textContent = `Načítavam 3D model… ${Math.round(event.loaded / event.total * 100)} %`;
  });

  const model = gltf.scene;
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('The GLB has no visible, non-empty geometry.');
  const center = bounds.getCenter(new THREE.Vector3());
  const normalization = new THREE.Group();
  normalization.scale.setScalar(modelHeight / size.y);
  model.position.sub(center);
  normalization.add(model);

  let meshes = 0;
  model.traverse((object) => {
    if (!object.isMesh) return;
    meshes++;
    object.castShadow = true;
    object.receiveShadow = true;
    // The asset owns anatomical segmentation, textures and enamel/root materials.
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material.map) material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }
  });
  if (!meshes) throw new Error('The GLB does not contain any mesh.');
  scene.add(normalization);
  normalization.updateMatrixWorld(true);
  const normalizedBounds = new THREE.Box3().setFromObject(normalization);
  const normalizedSize = normalizedBounds.getSize(new THREE.Vector3());
  const homeRight = new THREE.Vector3().crossVectors(camera.up, homeDirection).normalize();
  const homeUp = new THREE.Vector3().crossVectors(homeDirection, homeRight);
  let vertexCount = 0;
  normalization.traverse((object) => {
    if (object.isMesh) vertexCount += object.geometry.attributes.position.count;
  });
  homeProjection = new Float32Array(vertexCount * 3);
  const point = new THREE.Vector3();
  let projectionIndex = 0;
  // Project once after all authored transforms and normalization are applied.
  // Resizing only evaluates these scalar coordinates; it preserves the orbit.
  normalization.traverse((object) => {
    if (!object.isMesh) return;
    const positions = object.geometry.attributes.position;
    for (let index = 0; index < positions.count; index++) {
      point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld).sub(target);
      homeProjection[projectionIndex++] = Math.abs(point.dot(homeRight));
      homeProjection[projectionIndex++] = Math.abs(point.dot(homeUp));
      homeProjection[projectionIndex++] = point.dot(homeDirection);
    }
  });
  // Use the actual model envelope, not screen width, to allow the same close
  // inspection on a phone while keeping the camera outside the tooth.
  minimumDistance = normalizedBounds.getBoundingSphere(new THREE.Sphere()).radius * 1.03 + 0.08;
  const shadowExtent = Math.max(normalizedSize.x, normalizedSize.z) + 1.6;
  scene.add(bakeContactShadow(renderer, normalization, normalizedBounds.min.y - 0.025, shadowExtent));
  // Geometry and lighting are static: self shadows need only one update.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  function zoom(factor) {
    const offset = camera.position.clone().sub(controls.target);
    const distance = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(offset.setLength(distance));
    controls.update();
    requestRender();
  }

  document.querySelector('#zoom-in').addEventListener('click', () => zoom(0.84));
  document.querySelector('#zoom-out').addEventListener('click', () => zoom(1 / 0.84));
  document.querySelector('#reset-view').addEventListener('click', resetView);

  canvas.addEventListener('keydown', (event) => {
    if (['+', '=', '-', '_', 'Home', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) event.preventDefault();
    if (event.key === '+' || event.key === '=') zoom(0.88);
    else if (event.key === '-' || event.key === '_') zoom(1 / 0.88);
    else if (event.key === 'Home') resetView();
    else if (event.key.startsWith('Arrow')) {
      const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      if (event.key === 'ArrowLeft') spherical.theta -= 0.12;
      if (event.key === 'ArrowRight') spherical.theta += 0.12;
      if (event.key === 'ArrowUp') spherical.phi -= 0.1;
      if (event.key === 'ArrowDown') spherical.phi += 0.1;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi, controls.minPolarAngle, controls.maxPolarAngle);
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
      controls.update();
      requestRender();
    }
  });

  document.addEventListener('visibilitychange', requestRender);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    if (frame) cancelAnimationFrame(frame);
    showError('Zobrazenie 3D sa prerušilo. Obnovte prehliadač modelu.', new Error('WebGL context lost'));
  });

  ready = true;
  resetView();
  renderer.render(scene, camera);
  status.hidden = true;
  controlsElement.hidden = false;
  // DOM diagnostics support read-only loading, rotation and zoom smoke checks.
  canvas.dataset.ready = 'true';
  canvas.dataset.meshes = String(meshes);
  canvas.dataset.triangles = String(renderer.info.render.triangles);
  canvas.dataset.threeRevision = THREE.REVISION;
}

start().catch((error) => {
  const message = /WebGL|context/i.test(error.message)
    ? '3D zobrazenie nie je dostupné. Skúste aktuálny prehliadač so zapnutou hardvérovou akceleráciou.'
    : 'Model sa nepodarilo načítať. Skontrolujte pripojenie a skúste to znova.';
  showError(message, error);
});
