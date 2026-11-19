import {
  ArrowHelper, Box3, ExtrudeGeometry, Group, MathUtils, Mesh, MeshPhysicalMaterial, Raycaster, Shape, Vector3,
} from 'three';

const { clamp, lerp, smoothstep } = MathUtils;
const MODES = {
  21: { upper: [12, 11, 21, 22], lower: [42, 41, 31, 32], antagonist: 31, openGap: .83, closedGap: .038, width: .60, depth: .56, thickness: .28 },
  36: { upper: [25, 26, 27], lower: [35, 36, 37], antagonist: 26, openGap: .86, closedGap: .14, width: .40, depth: .43, thickness: .38 },
};

/** Absolute animation state: neither elapsed time nor the previous frame can
 * alter the bite. Rewinding restores the same jaw, food and fracture. */
export function sampleToothFunction(fdi, progress) {
  const mode = MODES[fdi];
  if (!mode) throw new RangeError('Tooth motion is available for FDI 21 and 36.');
  const p = clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
  const close = smoothstep(p, .13, .61);
  const release = smoothstep(p, .82, 1);
  const closure = close * (1 - release * .76);
  const gap = lerp(mode.openGap, mode.closedGap, closure);
  const cut = fdi === 21 ? clamp((mode.thickness - Math.min(gap, lerp(mode.openGap, mode.closedGap, close))) / (mode.thickness - mode.closedGap), 0, 1) : 0;
  const split = fdi === 21 ? smoothstep(p, .68, .83) : 0;
  const lateral = fdi === 36 ? .14 * Math.sin(Math.PI * smoothstep(p, .50, .88)) : 0;
  const compression = fdi === 36 ? smoothstep(p, .36, .66) : 0;
  const phase = p < .18 ? 'Pripravené sústo' : p < .44 ? 'Približovanie' : p < .68
    ? fdi === 21 ? 'Rezné hrany' : 'Stláčanie' : p < .82
      ? fdi === 21 ? 'Oddelenie sústa' : 'Bočný pohyb' : 'Uvoľnenie';
  return { progress: p, closure, gap, cut, split, lateral, compression, phase };
}

function measureCrown(mesh, matrix, upper) {
  const bounds = new Box3(), point = new Vector3();
  const positions = mesh.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) bounds.expandByPoint(point.fromBufferAttribute(positions, i).applyMatrix4(matrix));
  const tipY = upper ? bounds.min.y : bounds.max.y;
  const edge = new Vector3();
  let count = 0;
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i).applyMatrix4(matrix);
    if (Math.abs(point.y - tipY) < .04) { edge.add(point); count++; }
  }
  edge.divideScalar(count || 1);
  return { bounds, tipY, edge };
}

function copyEnamel(source) {
  // Material.copy JSON-clones userData; the atlas keeps borrowed texture
  // uniforms there. Avoid serialising their image data or changing the source.
  const copySource = Object.create(source);
  copySource.userData = {};
  const material = new MeshPhysicalMaterial().copy(copySource);
  material.userData = { ...source.userData };
  const compile = source.onBeforeCompile;
  const cacheKey = source.customProgramCacheKey();
  // The source's cervical/incisal treatment and current enamel palette remain
  // intact. This copy owns its visibility and does not share story coverage.
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    if (shader.uniforms.smileMix) shader.uniforms.smileMix = { value: 1 };
    // The surrounding anterior arch is absent in this teaching close-up.
    // Remove only its depth-dependent shadow approximation; keep the approved
    // enamel colour, textures, cervical warmth and incisal light treatment.
    shader.fragmentShader = shader.fragmentShader.replace('float depth = max(0., 2.42-vToothPosition.z);', 'float depth = 0.0;');
  };
  material.customProgramCacheKey = () => cacheKey + '-function-motion';
  material.transparent = false;
  material.opacity = 1;
  material.depthWrite = true;
  return material;
}

function halfAppleShape(width, depth, skin = false) {
  const shape = new Shape();
  shape.moveTo(width, 0);
  shape.absellipse(0, 0, width, depth, 0, Math.PI, false);
  if (skin) {
    const rim = .027;
    shape.lineTo(-width + rim, 0);
    shape.absellipse(0, 0, width - rim, depth - rim, Math.PI, 0, true);
  }
  shape.closePath();
  return shape;
}

function createApple(mode) {
  const object = new Group(); object.name = 'Apple slice';
  const flesh = new MeshPhysicalMaterial({ color: '#fff0bd', roughness: .60, metalness: 0, clearcoat: .06 });
  const peel = new MeshPhysicalMaterial({ color: '#bb2432', roughness: .34, clearcoat: .34, clearcoatRoughness: .35,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const halves = [];
  for (const front of [false, true]) {
    const group = new Group(); group.name = front ? 'Detached apple bite' : 'Held apple slice';
    object.add(group);
    const parts = [];
    for (const skin of [false, true]) {
      // A thin rind at the lower perimeter leaves the broad cut face pale.
      // Wrapping the whole thickness in red would read as an opaque red puck
      // from the deliberately low side view and hide the incision itself.
      const rindHeight = .045;
      const geometry = new ExtrudeGeometry(halfAppleShape(mode.width + (skin ? .002 : 0), mode.depth + (skin ? .002 : 0), skin), {
        depth: skin ? rindHeight : mode.thickness, steps: 1, bevelEnabled: false, curveSegments: 22,
      });
      geometry.rotateX(Math.PI / 2);
      geometry.translate(0, skin ? -mode.thickness / 2 + rindHeight : mode.thickness / 2, 0);
      if (!front) geometry.rotateY(Math.PI);
      const mesh = new Mesh(geometry, skin ? peel : flesh);
      mesh.name = `${front ? 'Front' : 'Rear'} apple ${skin ? 'red peel' : 'pale flesh'}`;
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
      parts.push({ mesh, original: geometry.attributes.position.array.slice() });
    }
    halves.push({ group, parts, front });
  }
  return {
    object,
    deform(state, topY, supportOffset = 0) {
      const { thickness, depth } = mode;
      const foodGap = state.gap + supportOffset;
      const compressed = Math.min(lerp(thickness, mode.closedGap + supportOffset - .016, state.compression), foodGap - .016);
      // During chewing the bite rests on the actual lower cusp supports, then
      // stays on that jaw when it reopens. Its permanent compressed shape is
      // deterministic even after the grinding stroke is reversed.
      const baseCenter = topY - thickness / 2 - .008
        + (mode === MODES[36] ? compressed + .016 - foodGap : 0);
      object.position.y = baseCenter;
      for (const { group, parts, front } of halves) {
        // Carry the detached bite in front of the measured lower labial
        // envelope before it drops. Dropping while it is still above the
        // incisal edge would sweep the back face through the lower crowns.
        const drop = smoothstep(state.progress, .79, .94);
        group.position.set(0, front ? -.30 * state.split * drop : 0, front ? .32 * state.split : 0);
        group.rotation.x = front ? -.22 * state.split * drop : 0;
        for (const { mesh, original } of parts) {
          const a = mesh.geometry.attributes.position;
          for (let i = 0; i < a.count; i++) {
            const x = original[3 * i], y = original[3 * i + 1], z = original[3 * i + 2];
            let px = x, py = y, pz = z;
            if (state.cut || state.split) {
              const notch = (1 - smoothstep(Math.abs(z), 0, .24)) * state.cut;
              // The upper and lower incisal supports bound the two sides of
              // the notch. The uncut apple keeps its original thickness.
              const remaining = lerp(thickness, mode.closedGap - .016, state.cut);
              const cutY = thickness / 2 - remaining / 2 + y * remaining / thickness;
              py = lerp(y, cutY, notch > 0 ? 1 - smoothstep(Math.abs(z), 0, .24) : 0);
            }
            if (state.compression) {
              const bulge = 1 + .20 * state.compression;
              px = x * bulge - (y / thickness + .5) * state.lateral * .72;
              pz = z * (1 + .12 * state.compression);
              py = thickness / 2 - compressed / 2 + y * compressed / thickness;
              // A broad, shallow fold remains after the lateral stroke.
              py -= .026 * state.compression * Math.sin((x / mode.width + 1) * Math.PI) * Math.cos(z / depth);
            }
            a.setXYZ(i, px, py, pz);
          }
          a.needsUpdate = true;
          mesh.geometry.computeVertexNormals();
          mesh.geometry.computeBoundingSphere();
        }
      }
    },
    dispose() {
      for (const { parts } of halves) for (const { mesh } of parts) mesh.geometry.dispose();
      flesh.dispose(); peel.dispose();
    },
  };
}

/** A scene overlay borrowing the atlas's actual crown geometry. Both arches
 * remain internally rigid. A separating horizontal support plane, measured
 * from every visible real vertex, prevents opposing enamel intersections for
 * the whole animation, including the lateral stroke (not just sampled frames).
 */
export function createToothFunctionMotion({ arch }) {
  const object = new Group(); object.name = 'Tooth function in motion'; object.visible = false;
  const upper = new Group(); upper.name = 'Fixed upper crowns';
  const lower = new Group(); lower.name = 'Moving lower crowns';
  object.add(upper, lower);
  const arrowDirection = new Vector3(0, 1, 0);
  const arrow = new ArrowHelper(arrowDirection, new Vector3(), .44, '#285e6d', .11, .085);
  arrow.name = 'Direction of lower jaw motion';
  arrow.line.material.toneMapped = arrow.cone.material.toneMapped = false;
  object.add(arrow);
  const records = new Map();
  const contact = new Vector3(), registration = new Vector3();
  const upperBounds = new Box3(), lowerBounds = new Box3();
  let fdi = null, mode = null, apple = null, state = null;
  let upperTip = 0, lowerTip = 0, minHardSurfaceGap = 0, foodSupportOffset = 0;

  function release() {
    for (const { mesh } of records.values()) { mesh.removeFromParent(); mesh.material.dispose(); }
    records.clear();
    if (apple) { apple.object.removeFromParent(); apple.dispose(); apple = null; }
  }
  function start(nextFdi) {
    const nextMode = MODES[nextFdi];
    if (!nextMode || [...nextMode.upper, ...nextMode.lower].some(id => !arch.teeth.get(id)?.crown)) return false;
    release(); fdi = Number(nextFdi); mode = nextMode;
    upperBounds.makeEmpty(); lowerBounds.makeEmpty();
    upper.position.set(0, 0, 0); lower.position.set(0, 0, 0);
    for (const id of [...mode.upper, ...mode.lower]) {
      const item = arch.teeth.get(id);
      const mesh = new Mesh(item.crown.geometry, copyEnamel(item.crown.material));
      mesh.name = `Motion FDI ${id}`; mesh.userData.fdi = id;
      mesh.matrixAutoUpdate = false; mesh.matrix.copy(item.smilePose.matrix);
      mesh.castShadow = true; mesh.receiveShadow = true;
      (item.upper ? upper : lower).add(mesh);
      const measure = measureCrown(mesh, mesh.matrix, item.upper);
      (item.upper ? upperBounds : lowerBounds).union(measure.bounds);
      records.set(id, { mesh, ...measure });
    }
    const top = records.get(fdi === 21 ? 21 : 26);
    const bottom = records.get(fdi === 21 ? 31 : 36);
    upperTip = top.tipY; lowerTip = bottom.tipY;
    registration.set(fdi === 21 ? 0 : top.edge.x - bottom.edge.x, 0, top.edge.z - bottom.edge.z);
    contact.copy(top.edge); contact.y = upperTip - mode.thickness / 2;
    foodSupportOffset = 0;
    if (fdi === 36) {
      // A whole-crown maximum is sufficient to separate hard surfaces but is
      // not the occlusal height below this apple. Sample the actual triangle
      // at the bite centre, including the groove between the highest cusps.
      object.updateMatrixWorld(true);
      const probe = new Raycaster(new Vector3(bottom.edge.x, lowerBounds.max.y + 1, bottom.edge.z), new Vector3(0, -1, 0));
      const surface = probe.intersectObject(bottom.mesh, false)[0];
      if (surface) foodSupportOffset = clamp(lowerTip - surface.point.y, 0, .12);
    }
    apple = createApple(mode); apple.object.position.set(contact.x, 0, contact.z); object.add(apple.object);
    object.visible = true; setProgress(0); return true;
  }
  function setProgress(progress) {
    if (!mode) return null;
    state = sampleToothFunction(fdi, progress);
    lower.position.set(registration.x + state.lateral, upperTip - lowerTip - state.gap, registration.z);
    minHardSurfaceGap = upperBounds.min.y - (lowerBounds.max.y + lower.position.y);
    apple.object.position.x = contact.x + state.lateral;
    apple.deform(state, upperTip, foodSupportOffset);
    if (state.progress >= .82) arrowDirection.set(0, -1, 0);
    else if (fdi === 36 && state.progress >= .52) arrowDirection.set(state.progress < .69 ? 1 : -1, 0, 0);
    else arrowDirection.set(0, 1, 0);
    arrow.setDirection(arrowDirection);
    object.updateMatrixWorld(true);
    return state;
  }
  function cameraPose({ aspect = 1, compact = false, fov = 32, progress = state?.progress ?? 0 } = {}) {
    if (!mode) return null;
    const aim = contact.clone();
    // Camera movement ends before contact. Caller may freeze this guide once
    // a visitor starts orbiting; scrubbing does not require camera changes.
    const tilt = fdi === 36 ? lerp(.92, .17, smoothstep(progress, 0, .20)) : .20;
    const direction = new Vector3(fdi === 36 ? 1.25 : 1.55, tilt, fdi === 36 ? .48 : .85).normalize();
    const right = new Vector3().crossVectors(new Vector3(0, 1, 0), direction).normalize();
    const up = new Vector3().crossVectors(direction, right);
    const tan = Math.tan(MathUtils.degToRad(fov / 2));
    const fit = upperBounds.clone();
    fit.union(lowerBounds.clone().translate(new Vector3(registration.x + .14, upperTip - lowerTip - mode.openGap, registration.z)));
    const p = new Vector3();
    let distance = 0;
    for (let i = 0; i < 8; i++) {
      p.set(i & 1 ? fit.max.x : fit.min.x, i & 2 ? fit.max.y : fit.min.y, i & 4 ? fit.max.z : fit.min.z).sub(aim);
      distance = Math.max(distance, p.dot(direction) + Math.max(Math.abs(p.dot(right)) / (tan * aspect * .86), Math.abs(p.dot(up)) / (tan * (compact ? .41 : .65))));
    }
    // Keep the short 3D cue outside the crown silhouette in the authored
    // view, above the mobile slider. It rotates with the model during orbit.
    arrow.position.copy(aim).addScaledVector(right, distance * tan * aspect * .84)
      .addScaledVector(up, -distance * tan * .25);
    return { position: aim.clone().addScaledVector(direction, distance), target: aim,
      screenX: .5, screenY: compact ? .48 : .50, opticalZoom: 1 };
  }
  function report() {
    if (!state) return { active: false, fdi: null };
    return { active: object.visible, fdi, ...state, contact: contact.toArray(),
      lowerTranslation: lower.position.toArray(), upperFixed: true, minHardSurfaceGap,
      foodSupportOffset, direction: arrowDirection.toArray(), visibleTeeth: [...records.keys()] };
  }
  return { object, start, setProgress, cameraPose, report,
    stop() { object.visible = false; },
    dispose() { release(); arrow.line.material.dispose(); arrow.cone.material.dispose(); object.removeFromParent(); object.visible = false; },
  };
}
