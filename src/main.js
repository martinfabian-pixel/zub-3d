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
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(0.17), side: THREE.BackSide }),
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
  panel(5, 9, [-6, 5, 6], 4.5, 0xfff6ec);
  panel(4, 7, [7, 2, 4], 2.5, 0xf0f5ff);
  panel(7, 5, [0, 9, -2], 3.5);
  panel(2, 7, [-3, 1, -7], 2.8);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const result = pmrem.fromScene(room, 0.04);
  room.traverse((object) => {
    object.geometry?.dispose();
    object.material?.dispose();
  });
  pmrem.dispose();
  return result;
}

async function start() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  const environment = studioEnvironment(renderer);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.7;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
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

  const key = new THREE.DirectionalLight(0xfff6e9, 1.9);
  key.position.set(-3.8, 8.8, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -4;
  key.shadow.camera.right = key.shadow.camera.top = 4;
  key.shadow.camera.near = 0.1;
  key.shadow.camera.far = 24;
  key.shadow.normalBias = 0.02;
  key.shadow.bias = -0.0001;
  key.shadow.radius = 4;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xedf3ff, 0.65);
  fill.position.set(4, 1.5, 4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 1.2);
  rim.position.set(2, 4, -4);
  scene.add(rim);

  let ready = false;
  let frame = 0;
  let homeDistance = 8;
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
    const vertical = THREE.MathUtils.degToRad(camera.fov);
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
    // Leave room around the silhouette, including the three-quarter root spread.
    return Math.max((modelHeight * 0.5) / Math.tan(vertical / 2), (modelHeight * 0.38) / Math.tan(horizontal / 2)) * 1.34;
  }

  function resetView() {
    homeDistance = fitDistance();
    controls.target.copy(target);
    camera.position.copy(target).addScaledVector(homeDirection, homeDistance);
    controls.minDistance = homeDistance * 0.42;
    controls.maxDistance = homeDistance * 2.5;
    controls.update();
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
      camera.position.copy(controls.target).add(offset.multiplyScalar(homeDistance / previousHome));
      controls.minDistance = homeDistance * 0.42;
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

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.ShadowMaterial({ opacity: 0.025, depthWrite: false }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -modelHeight / 2 - 0.045;
  ground.receiveShadow = true;
  scene.add(ground);

  // Broad, feathered ambient contact complements the restrained direct shadow.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const shadowContext = shadowCanvas.getContext('2d');
  const gradient = shadowContext.createRadialGradient(64, 64, 3, 64, 64, 63);
  gradient.addColorStop(0, 'rgba(52,43,29,0.17)');
  gradient.addColorStop(0.38, 'rgba(52,43,29,0.09)');
  gradient.addColorStop(0.72, 'rgba(52,43,29,0.025)');
  gradient.addColorStop(1, 'rgba(52,43,29,0)');
  shadowContext.fillStyle = gradient;
  shadowContext.fillRect(0, 0, 128, 128);
  const contactTexture = new THREE.CanvasTexture(shadowCanvas);
  contactTexture.colorSpace = THREE.SRGBColorSpace;
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 2.6),
    new THREE.MeshBasicMaterial({ map: contactTexture, transparent: true, depthWrite: false, toneMapped: false }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(0.2, ground.position.y + 0.005, 0);
  scene.add(contact);

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
