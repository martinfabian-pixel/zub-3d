import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** Camera and input own no scene objects or renderer lifetime. */
export function createCameraRig({ canvas, renderer, config, requestRender }) {
  const settings = config.camera;
  const interaction = config.interaction;
  const camera = new THREE.PerspectiveCamera(settings.fov, 1, settings.near, settings.far);
  const controls = new OrbitControls(camera, canvas);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  controls.enablePan = false;
  controls.enableDamping = interaction.damping && !reducedMotion.matches;
  controls.dampingFactor = interaction.dampingFactor;
  controls.rotateSpeed = interaction.rotateSpeed;
  controls.zoomSpeed = interaction.zoomSpeed;
  controls.minPolarAngle = interaction.minPolarAngle;
  controls.maxPolarAngle = interaction.maxPolarAngle;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;

  const target = new THREE.Vector3();
  const modelBounds = new THREE.Box3();
  const homeDirection = configuredDirection(settings.homeDirection);
  const crownDirection = configuredDirection(settings.crownDirection);
  const offset = new THREE.Vector3();
  let projections = null;
  let width = Math.max(1, canvas.clientWidth);
  let height = Math.max(1, canvas.clientHeight);
  let framingHeightRatio = 1;
  let minimumDistance = settings.near;
  let referenceDistance = config.model.height;
  let currentPreset = 'home';
  let disposed = false;

  camera.position.copy(homeDirection).multiplyScalar(referenceDistance);
  controls.update();
  controls.addEventListener('change', onChange);
  canvas.addEventListener('keydown', onKeyDown);
  reducedMotion.addEventListener('change', onMotionPreference);

  function configuredDirection(value) {
    const direction = new THREE.Vector3().fromArray(value);
    if (!direction.lengthSq()) throw new Error('Camera direction must be nonzero.');
    const spherical = new THREE.Spherical().setFromVector3(direction);
    spherical.phi = THREE.MathUtils.clamp(spherical.phi, interaction.minPolarAngle, interaction.maxPolarAngle);
    return direction.setFromSpherical(spherical).normalize();
  }

  function onChange() {
    if (!disposed) requestRender();
  }

  // Flush residual motion before applying an exact pose. The caller preserves
  // the desired position first, so consuming the remaining delta cannot jump it.
  function clearMotion() {
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = damping;
  }

  function onMotionPreference() {
    if (disposed) return;
    offset.copy(camera.position).sub(controls.target);
    clearMotion();
    camera.position.copy(controls.target).add(offset);
    controls.enableDamping = interaction.damping && !reducedMotion.matches;
    controls.update();
    requestRender();
  }

  function fitDistance(projection) {
    const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const horizontal = tanY * camera.aspect;
    const vertical = tanY * framingHeightRatio;
    let distance = minimumDistance;
    for (let i = 0; i < projection.length; i += 3) {
      distance = Math.max(distance,
        projection[i + 2] + projection[i] * settings.fitPadding / horizontal,
        projection[i + 2] + projection[i + 1] * settings.fitPadding / vertical);
    }
    return distance;
  }

  function updateLimits() {
    controls.minDistance = minimumDistance;
    controls.maxDistance = Math.max(minimumDistance, referenceDistance * settings.maxDistanceFactor);
  }

  function applyPreset(preset) {
    if (disposed || !projections) return;
    currentPreset = preset;
    referenceDistance = fitDistance(projections[preset]);
    clearMotion();
    updateLimits();
    controls.target.copy(target);
    camera.position.copy(preset === 'crown' ? crownDirection : homeDirection)
      .multiplyScalar(referenceDistance).add(target);
    controls.update();
    requestRender();
  }

  function fit(model) {
    if (disposed) return;
    model.updateWorldMatrix(true, true);
    modelBounds.setFromObject(model, true);
    if (modelBounds.isEmpty()) throw new Error('Cannot frame an empty model.');
    modelBounds.getCenter(target).add(new THREE.Vector3().fromArray(settings.targetOffset));

    const meshes = [];
    let vertexCount = 0;
    model.traverseVisible((object) => {
      const positions = object.isMesh && object.geometry?.getAttribute('position');
      if (!positions) return;
      meshes.push(object);
      vertexCount += positions.count;
    });
    if (!vertexCount) throw new Error('Cannot frame a model without mesh positions.');
    const home = new Float32Array(vertexCount * 3);
    const crown = new Float32Array(vertexCount * 3);
    const homeRight = new THREE.Vector3().crossVectors(camera.up, homeDirection).normalize();
    const homeUp = new THREE.Vector3().crossVectors(homeDirection, homeRight).normalize();
    const crownRight = new THREE.Vector3().crossVectors(camera.up, crownDirection).normalize();
    const crownUp = new THREE.Vector3().crossVectors(crownDirection, crownRight).normalize();
    const point = new THREE.Vector3();
    let index = 0;
    let radiusSquared = 0;
    for (const mesh of meshes) {
      const positions = mesh.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i += 1) {
        mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).sub(target);
        if (![point.x, point.y, point.z].every(Number.isFinite)) {
          throw new Error('Cannot frame a model with invalid positions.');
        }
        home[index] = Math.abs(point.dot(homeRight));
        home[index + 1] = Math.abs(point.dot(homeUp));
        home[index + 2] = point.dot(homeDirection);
        crown[index] = Math.abs(point.dot(crownRight));
        crown[index + 1] = Math.abs(point.dot(crownUp));
        crown[index + 2] = point.dot(crownDirection);
        radiusSquared = Math.max(radiusSquared, point.lengthSq());
        index += 3;
      }
    }
    // The actual vertex envelope is tighter than an AABB sphere while keeping
    // the camera outside the tooth at every orbit angle, including its near plane.
    const radius = Math.sqrt(radiusSquared);
    minimumDistance = Math.max(radius * settings.minimumDistanceScale + settings.minimumDistanceGap,
      radius + camera.near);
    projections = { home, crown };
    resize(width, height);
    applyPreset('home');
    controls.saveState();
    return modelBounds.clone();
  }

  function resize(nextWidth, nextHeight) {
    if (disposed || !(nextWidth > 0 && nextHeight > 0)) return;
    width = nextWidth;
    height = nextHeight;
    const reserve = width <= settings.footerBreakpoint
      ? Math.min(settings.footerReservePx, height * settings.footerReserveMaxFraction) : 0;
    framingHeightRatio = (height - reserve) / height;
    camera.aspect = width / height;
    // Offset the optical centre upward into the area above the touch controls.
    if (reserve) camera.setViewOffset(width, height, 0, reserve / 2, width, height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    if (projections) {
      offset.copy(camera.position).sub(controls.target);
      const relativeZoom = offset.length() / referenceDistance;
      referenceDistance = fitDistance(projections[currentPreset]);
      const distance = THREE.MathUtils.clamp(referenceDistance * relativeZoom,
        minimumDistance, referenceDistance * settings.maxDistanceFactor);
      clearMotion();
      updateLimits();
      camera.position.copy(offset.normalize().multiplyScalar(distance)).add(target);
      controls.target.copy(target);
      controls.update();
    }
    requestRender();
  }

  function zoom(factor) {
    if (disposed || !projections || !Number.isFinite(factor) || factor <= 0) return;
    offset.copy(camera.position).sub(controls.target);
    const distance = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance);
    clearMotion();
    camera.position.copy(offset.normalize().multiplyScalar(distance)).add(target);
    controls.target.copy(target);
    controls.update();
    requestRender();
  }

  function onKeyDown(event) {
    if (disposed || !projections || event.altKey || event.ctrlKey || event.metaKey) return;
    switch (event.key) {
      case 'Home': applyPreset('home'); break;
      case 'ArrowLeft': controls.rotateLeft(interaction.keyboardAzimuthStep); break;
      case 'ArrowRight': controls.rotateLeft(-interaction.keyboardAzimuthStep); break;
      case 'ArrowUp': controls.rotateUp(interaction.keyboardPolarStep); break;
      case 'ArrowDown': controls.rotateUp(-interaction.keyboardPolarStep); break;
      case '+': case '=': zoom(interaction.keyboardZoomFactor); break;
      case '-': case '_': zoom(1 / interaction.keyboardZoomFactor); break;
      default: return;
    }
    event.preventDefault();
    requestRender();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener('keydown', onKeyDown);
    reducedMotion.removeEventListener('change', onMotionPreference);
    controls.removeEventListener('change', onChange);
    controls.dispose();
    projections = null;
  }

  resize(width, height);
  return { camera, controls, fit, resize, reset: () => applyPreset('home'), crown: () => applyPreset('crown'), zoom, dispose };
}
