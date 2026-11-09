import { PerspectiveCamera, Vector3 } from 'three';

/** A pure scroll pose. The scene owner controls rendering and any final orbit. */
export function createJourneyCamera({ timeline, alternateTimeline, config, camera: suppliedCamera, sampleOnly=false }) {
  const settings = config?.camera ?? config ?? {};
  const camera = suppliedCamera ?? new PerspectiveCamera();
  camera.fov = timeline.fov ?? settings.fov;
  camera.near = timeline.near ?? settings.near;
  camera.far = timeline.far ?? settings.far;
  camera.up.set(0, 1, 0);
  const target = new Vector3();
  const pose = { position: new Vector3(), target: new Vector3() };
  const alternatePose = alternateTimeline && { position: new Vector3(), target: new Vector3() };
  let progress = 0, reducedMotion = false, disposed = false;
  let alternateWeight = 0;
  let sensorWidth=camera.aspect,sensorHeight=1;

  function setProgress(next, options) {
    if (disposed) return null;
    if (options?.reducedMotion !== undefined) reducedMotion = Boolean(options.reducedMotion);
    if (alternateTimeline && options?.alternateWeight !== undefined) alternateWeight=options.alternateWeight;
    const active=alternateWeight===1 ? alternateTimeline : timeline;
    active.sampleInto(pose, next, camera.aspect, reducedMotion);
    if (alternateWeight>0 && alternateWeight<1) {
      alternateTimeline.sampleInto(alternatePose,next,camera.aspect,reducedMotion);
      pose.position.lerp(alternatePose.position,alternateWeight);
      pose.target.lerp(alternatePose.target,alternateWeight);
      for (const key of ['screenX','screenY','opticalZoom']) pose[key]+=(alternatePose[key]-pose[key])*alternateWeight;
    }
    const offsetX=(.5-(pose.screenX??.5))*sensorWidth;
    const offsetY=(.5-(pose.screenY??.5))*sensorHeight;
    const zoom=pose.opticalZoom??1, sensor=camera.view;
    if(!sensor?.enabled||sensor.fullWidth!==sensorWidth||sensor.fullHeight!==sensorHeight||
       sensor.offsetX!==offsetX||sensor.offsetY!==offsetY||camera.zoom!==zoom) {
      camera.zoom=zoom;
      // Shift the principal point of the full-size sensor. The model's
      // world-space inspection target and the verified camera rays stay put.
      camera.setViewOffset(sensorWidth,sensorHeight,offsetX,offsetY,sensorWidth,sensorHeight);
    }
    progress = pose.progress;
    target.copy(pose.target);
    if(!sampleOnly){camera.position.copy(pose.position);camera.lookAt(target);camera.updateMatrixWorld();}
    return pose;
  }

  function resize(width, height) {
    if (disposed || !(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) return null;
    sensorWidth=width;sensorHeight=height;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    return setProgress(progress);
  }

  camera.updateProjectionMatrix();
  setProgress(0);
  return { camera, target,pose, resize, setProgress, dispose() { disposed = true; } };
}
