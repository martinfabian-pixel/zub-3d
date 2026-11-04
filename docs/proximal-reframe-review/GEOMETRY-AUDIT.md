# Independent proximal-geometry check

From the repository root, run `node docs/proximal-reframe-review/run-audit.mjs` after installing the repository’s Node dependencies. The command requires Git history containing `f3257d1` and Blender 4.5 with its bundled NumPy. Set `BLENDER_BIN` to your Blender executable if it is not in the project workspace’s local tools directory.

`run-audit.mjs` constructs the checked-in Three.js brush, expands every instance into its transformed triangles, and samples the pre-alignment pose plus 41 insertion stations at both flexion extrema. It passes temporary binary arrays to `geometry-worker.py`, which runs Blender’s CPU BVH checks on both shipped LODs. No browser, GPU renderer or modifications to published assets are required. `independent-geometry.json` contains the full results and returns `passed: true` only if its named checks succeed. The older, healthy-surface reference test is separately reproducible with `node scripts/audit-brush-contact.mjs`; its output is in `brush-healthy.json`.

The audit compares the original and enlarged morphs on the same indexed, nominal-scale FDI 36 surface. Bytes for individual meshes and the arch manifest are checked against the baseline commit. FDI 36 and FDI 46 use a **shared native source**, not two separate anatomical specimens: their fixed world transforms and placed-position hashes are reported separately, and only the left tooth receives morph deltas. Pair counts cover all 28 teeth at five weights; self-intersection counts exclude faces sharing a welded vertex.

`actualAuthoredCameraKeyframes` tests the three landmark centers and directions returned by the real `createStoryCameraConfig` at the specified minimum distances. It calls the function with `compact: false` for desktop and `compact: true` for mobile. `capturedProductionCameras` independently replays the six frozen camera/target pairs in [browser-camera-inputs.json](browser-camera-inputs.json). These were taken from the final production-build browser review, which contains 18 states and 36 JPGs (full page plus canvas crop per state); 6 states and their 12 image hashes are selected here. The input file also identifies the capture report, capture driver and exact served JavaScript bundles by SHA-256. Re-running the CPU audit does not require the browser or the JPGs.

| Profile / scene | Window CSS px | Canvas CSS px | Authored minimum cm | Captured distance cm | Projected floor box CSS px |
|---|---:|---:|---:|---:|---:|
| Desktop cavity | 1366×900 | 811×550 | 1.94 | 1.978 | 57.8×41.5 |
| Desktop brush | 1366×900 | 811×550 | 3.35 | 3.350 | 29.8×23.9 |
| Desktop result | 1366×900 | 811×550 | 2.17 | 2.170 | 50.2×38.1 |
| Mobile cavity | 390×844 | 374×431 | 1.69 | 1.731 | 52.8×37.0 |
| Mobile brush | 390×844 | 374×359 | 3.35 | 3.350 | 19.2×15.4 |
| Mobile result | 390×844 | 374×424 | 1.89 | 1.890 | 44.4×33.7 |

At every authored and captured pose all 59 tested floor triangle centroids, the deepest floor vertex, and the buccal guide entrance are unobstructed by the full 28-tooth assembly. Only 3 teeth were actually shown in these browser frames. This geometric result is not a claim about all rendered pixels or tool/UI occlusion. The projected box is the browser's bounding rectangle of vertices above its floor-color threshold, not an unobscured pixel count. Canvas dimensions differ from window dimensions, and the cavity capture was taken near progress 0.475 rather than precisely at the 0.47 author key. Viewport fitting and interpolation can therefore change the actual camera distance.

The 83 tool poses per LOD are discrete. Separately, the radial bound projects the six healthy/mature vertex endpoints of each affected face onto the plane normal to the straight wire axis. The resulting convex hull encloses every intermediate morphed triangle. Its distance from the axis, combined with the measured radial and axial extent of each actual tool part, bounds the clearance from the designated cavity floor. This tests the authored illustration, not clinical brush selection or tissue safety.
