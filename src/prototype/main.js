import * as THREE from 'three';
import { toothConfig } from './config.js';
import { createScene, disposeObject } from './scene.js';
import { loadTooth } from './model.js';
import { createLighting } from './lighting.js';
import { createCameraRig } from './camera.js';
import { chooseQuality, createAdaptiveQuality } from './quality.js';
import { createContactShadow } from './shadow.js';
import './style.css';

export function createPrototype(config = toothConfig) {
  const canvas = document.querySelector('#prototype-canvas');
  const status = document.querySelector('#prototype-status');
  const message = document.querySelector('#prototype-message');
  const buttons = document.querySelector('#prototype-controls');
  const retry = document.querySelector('#prototype-retry');
  const listeners = new AbortController();
  const profile = chooseQuality(config);
  let renderer;
  let scene;
  let rig;
  let adaptive;
  let lighting;
  let tooth;
  let shadow;
  let observer;
  let frame = 0;
  let disposed = false;
  let ready = false;
  let active = false;
  let lastFrame = 0;
  let renderedFrames = 0;
  let shaderError = false;
  const query = new URLSearchParams(location.search);
  const clay = query.get('material') === 'clay';
  const signal = listeners.signal;
  status.hidden = false;
  status.classList.remove('error');
  status.setAttribute('role', 'status');
  message.textContent = 'Pripravujem 3D zub…';
  buttons.hidden = true;
  retry.hidden = true;
  canvas.dataset.ready = 'false';
  delete canvas.dataset.disposed;
  delete canvas.dataset.error;

  function showError(text, error) {
    if (disposed) return;
    status.hidden = false;
    status.classList.add('error');
    status.setAttribute('role', 'alert');
    message.textContent = text;
    retry.hidden = false;
    buttons.hidden = true;
    canvas.dataset.ready = 'false';
    canvas.dataset.error = error?.message ?? text;
  }
  function requestRender() { if (!disposed && ready && !document.hidden && !frame) frame = requestAnimationFrame(render); }
  function report() {
    if (!renderer || !rig) return;
    canvas.dataset.frameCount = String(renderedFrames);
    canvas.dataset.drawCalls = String(renderer.info.render.calls);
    canvas.dataset.renderTriangles = String(renderer.info.render.triangles);
    canvas.dataset.pixelRatio = String(renderer.getPixelRatio());
    canvas.dataset.bufferSize = `${canvas.width}x${canvas.height}`;
    canvas.dataset.camera = rig.camera.position.toArray().map((n) => n.toFixed(4)).join(',');
    canvas.dataset.distance = rig.camera.position.distanceTo(rig.controls.target).toFixed(4);
    canvas.dataset.minDistance = String(rig.controls.minDistance);
    canvas.dataset.shaderErrors = String(shaderError || renderer.info.programs?.some((p) => p.diagnostics?.runnable === false) ? 1 : 0);
    canvas.dataset.gpuTextures = String(renderer.info.memory.textures);
    canvas.dataset.gpuGeometries = String(renderer.info.memory.geometries);
  }
  function render(now) {
    frame = 0;
    if (disposed || document.hidden || !ready) { lastFrame = 0; return; }
    const changing = rig.controls.update();
    if ((active || changing) && lastFrame) adaptive.recordFrame(now - lastFrame);
    lastFrame = now;
    try {
      renderer.info.reset();
      renderer.render(scene, rig.camera);
      renderedFrames++;
      if (shaderError) throw new Error('Tooth material shader failed to compile.');
    } catch (error) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      adaptive.dispose();
      rig.controls.enabled = false;
      showError('Zub sa nepodarilo vykresliť. Skúste obnoviť 3D zobrazenie.', error);
      ready = false;
      return;
    }
    if (changing || active) { adaptive.beginInteraction(); requestRender(); }
    else { adaptive.endInteraction(); lastFrame = 0; report(); }
  }
  function resize() {
    if (disposed || !renderer || !rig) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    rig.resize(width, height);
    requestRender();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    ready = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    listeners.abort();
    observer?.disconnect();
    adaptive?.dispose();
    rig?.dispose();
    shadow?.dispose();
    lighting?.dispose();
    disposeObject(tooth?.object);
    renderer?.renderLists.dispose();
    renderer?.dispose();
    canvas.dataset.ready = 'false';
    canvas.dataset.disposed = 'true';
    canvas.dataset.frameCount = String(renderedFrames);
  }
  retry.addEventListener('click', () => location.reload(), { signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (frame) cancelAnimationFrame(frame); frame = 0; lastFrame = 0; active = false; adaptive?.endInteraction(); }
    else { lastFrame = 0; requestRender(); }
  }, { signal });
  window.addEventListener('pagehide', (event) => { if (!event.persisted) dispose(); }, { signal });
  canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); if (frame) cancelAnimationFrame(frame); frame = 0; ready = false; adaptive?.dispose(); if (rig) rig.controls.enabled = false; showError('3D zobrazenie sa prerušilo. Obnovte ho tlačidlom nižšie.', new Error('WebGL context lost')); }, { signal });

  const initialization = (async () => {
  try {
    ({ renderer, scene } = createScene(canvas, config, profile));
    renderer.debug.onShaderError = (gl, program, vertex, fragment) => { shaderError = true; console.error('Tooth shader:', gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)); };
    rig = createCameraRig({ canvas, renderer, config, requestRender });
    adaptive = createAdaptiveQuality({ renderer, profile, requestRender, config });
    rig.controls.addEventListener('start', () => { active = true; lastFrame = 0; adaptive.beginInteraction(); requestRender(); });
    rig.controls.addEventListener('end', () => { active = false; requestRender(); });
    observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    // Settle both promises, so one late result cannot leak after an early error.
    const results = await Promise.allSettled([
      loadTooth(config, profile, renderer, (percent) => { if (!disposed) message.textContent = percent === null ? 'Načítavam zub…' : `Načítavam zub… ${percent} %`; }, clay, signal),
      createLighting(scene, renderer, config, profile, signal),
    ]);
    if (results[0].status === 'fulfilled') tooth = results[0].value;
    if (results[1].status === 'fulfilled') lighting = results[1].value;
    if (disposed) { disposeObject(tooth?.object); lighting?.dispose(); return { dispose }; }
    for (const result of results) if (result.status === 'rejected') throw result.reason;
    scene.add(tooth.object);
    rig.fit(tooth.object);
    resize();
    shadow = createContactShadow(renderer, tooth.object, tooth.bounds, config, profile);
    scene.add(shadow.object);
    renderer.shadowMap.needsUpdate = true;
    ready = true;
    rig.reset();
    if (query.get('view') === 'crown') rig.crown();
    status.hidden = true;
    buttons.hidden = false;
    Object.assign(canvas.dataset, { ready: 'true', revision: config.revision, profile: profile.name, model: tooth.variant, modelMeshes: String(tooth.meshes), assetTriangles: String(tooth.triangles), material: clay ? 'clay' : 'continuous dielectric', environment: lighting.label, metalness: '0', opacity: '1', transmission: String(config.material.transmission) });
    document.querySelector('#prototype-reset').addEventListener('click', rig.reset, { signal });
    document.querySelector('#prototype-crown').addEventListener('click', rig.crown, { signal });
    document.querySelector('#prototype-zoom-in').addEventListener('click', () => rig.zoom(config.interaction.keyboardZoomFactor), { signal });
    document.querySelector('#prototype-zoom-out').addEventListener('click', () => rig.zoom(1 / config.interaction.keyboardZoomFactor), { signal });
    // Optional test hooks stay local and opt-in; the public UI has only 4 buttons.
    if (query.has('qa')) window.__toothPrototype = { dispose, report, camera: rig.camera, controls: rig.controls, renderer, scene, profile, tooth, ready: true };
    requestRender();
    return { dispose };
  } catch (error) {
    showError(/WebGL|context|Error creating/i.test(error.message)
      ? 'Tento prehliadač nemá dostupné WebGL 2. Skúste aktuálny prehliadač s hardvérovou akceleráciou.'
      : '3D model sa nepodarilo načítať. Skontrolujte pripojenie a skúste to znova.', error);
    // Clean GPU resources while keeping the error panel and retry available.
    observer?.disconnect(); adaptive?.dispose(); rig?.dispose(); shadow?.dispose(); lighting?.dispose(); disposeObject(tooth?.object); renderer?.dispose();
    return { dispose };
  }
  })();
  const controller = { dispose, ready: initialization };
  if (query.has('qa')) window.__toothLifecycle = controller;
  return controller;
}

const prototype = createPrototype();
if (import.meta.hot) import.meta.hot.dispose(() => prototype.dispose());
