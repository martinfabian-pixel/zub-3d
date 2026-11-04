import { PerspectiveCamera, Vector3 } from 'three';

/** A pure scroll pose. The scene owner controls rendering and any final orbit. */
export function createJourneyCamera({ timeline, config, camera: suppliedCamera, sampleOnly=false }) {
  const settings = config?.camera ?? config ?? {};
  const camera = suppliedCamera ?? new PerspectiveCamera();
  camera.fov = timeline.fov ?? settings.fov;
  camera.near = timeline.near ?? settings.near;
  camera.far = timeline.far ?? settings.far;
  camera.up.set(0, 1, 0);
  const target = new Vector3();
  const pose = { position: new Vector3(), target: new Vector3() };
  let progress = 0, reducedMotion = false, disposed = false;

  function setProgress(next, options) {
    if (disposed) return null;
    if (options?.reducedMotion !== undefined) reducedMotion = Boolean(options.reducedMotion);
    timeline.sampleInto(pose, next, camera.aspect, reducedMotion);
    progress = pose.progress;
    target.copy(pose.target);
    if(!sampleOnly){camera.position.copy(pose.position);camera.lookAt(target);camera.updateMatrixWorld();}
    return pose;
  }

  function resize(width, height) {
    if (disposed || !(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) return null;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    return setProgress(progress);
  }

  camera.updateProjectionMatrix();
  setProgress(0);
  return { camera, target,pose, resize, setProgress, dispose() { disposed = true; } };
}
