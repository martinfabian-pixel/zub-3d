"""CPU-only Blender BVH worker for run-audit.mjs. Reads published assets, writes only this review's new report."""

import hashlib
import itertools
import json
import math
import struct
import subprocess
import sys
from pathlib import Path

import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
PUB = ROOT / "public"
DENT = PUB / "dentition-assets"
STORY = PUB / "story-assets"
TMP = Path(sys.argv[-1])
BASE = "f3257d1"
META = json.loads((TMP / "descriptor.json").read_bytes())
SITE = json.loads((STORY / "site.json").read_bytes())
SHAPE = json.loads((STORY / "caries-36.json").read_bytes())
MAN = json.loads((DENT / "manifest.json").read_bytes())
srcgit = lambda p: subprocess.check_output(
    ["git", "-C", str(ROOT), "show", BASE + ":" + p.relative_to(ROOT).as_posix()]
)
oldsite = json.loads(srcgit(STORY / "site.json"))
oldshape = json.loads(srcgit(STORY / "caries-36.json"))
sha = lambda b: hashlib.sha256(b).hexdigest()
canon = lambda v: sha(
    json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
)
unit = lambda a: a / np.maximum(np.linalg.norm(a, axis=-1, keepdims=True), 1e-28)


def tx(M, p):
    return p @ M[:3, :3].T + M[:3, 3]


def glb(path):
    b = path.read_bytes()
    n = struct.unpack_from("<I", b, 12)[0]
    j = json.loads(b[20 : 20 + n])
    blob = b[28 + n :]
    result = {}

    def acc(i):
        a = j["accessors"][i]
        v = j["bufferViews"][a["bufferView"]]
        dt = np.dtype(
            {5121: "u1", 5123: "<u2", 5125: "<u4", 5126: "<f4"}[a["componentType"]]
        )
        sz = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
        return np.ndarray(
            (a["count"], sz),
            dt,
            blob,
            v.get("byteOffset", 0) + a.get("byteOffset", 0),
            (v.get("byteStride", sz * dt.itemsize), dt.itemsize),
        ).copy()

    for node in j["nodes"]:
        if "mesh" not in node:
            continue
        assert not set(node).intersection(["scale", "rotation", "translation", "matrix"])
        pr = j["meshes"][node["mesh"]]["primitives"][0]
        attrs = {
            k: acc(i) for k, i in {**pr["attributes"], "INDICES": pr["indices"]}.items()
        }
        result[node["name"]] = {
            "attrs": attrs,
            "hashes": {k: sha(v.tobytes()) for k, v in attrs.items()},
        }
    return result


def tree(p, f):
    return {
        "b": BVHTree.FromPolygons(p.tolist(), f.tolist(), all_triangles=True, epsilon=0),
        "min": p.min(0),
        "max": p.max(0),
    }


def pairs(a, b):
    return (
        []
        if np.any(a["max"] < b["min"]) or np.any(b["max"] < a["min"])
        else a["b"].overlap(b["b"])
    )


def crosses(p, f):
    return np.cross(p[f[:, 1]] - p[f[:, 0]], p[f[:, 2]] - p[f[:, 0]])


def volume(p, f):
    t = (p - p.mean(0))[f]
    return float(np.sum(t[:, 0] * np.cross(t[:, 1], t[:, 2])) / 6)


def fields(shape, p):
    ids = np.asarray(shape["indices"])
    assert len(np.unique(ids)) == len(ids) and min(ids) >= 0 and max(ids) < len(p)
    d = np.zeros_like(p)
    d[ids] = np.asarray(shape["positionDelta"]).reshape(-1, 3)
    r = np.zeros((len(p), 4))
    r[ids] = np.asarray(shape["region"]).reshape(-1, 4)
    return d, r


def visible(p, n, C, arch):
    L = unit(C - p)
    if n @ L <= 0:
        return False, "backface"
    o = p + n * 0.0001
    vec = unit(C - o)
    length = float(np.linalg.norm(C - o))
    hits = []
    for i, t in arch.items():
        hit, _, _, dist = t["b"].ray_cast(Vector(o), Vector(vec), length)
        if hit is not None:
            hits.append((float(dist), int(i)))
    return (False, min(hits)[1]) if hits else (True, None)


def cross2(a, b):
    return a[0] * b[1] - a[1] * b[0]


def hull_radial_lower(coords):
    # Minimum distance from origin to 2D hull: projection of both endpoint triangles encloses the triangle at EVERY intermediate influence.
    v = np.unique(coords, axis=0)
    v = v[np.lexsort((v[:, 1], v[:, 0]))]

    def half(seq):
        a = []
        for x in seq:
            while len(a) > 1 and cross2(a[-1] - a[-2], x - a[-1]) <= 0:
                a.pop()
            a.append(x)
        return a

    hh = np.asarray(half(v)[:-1] + half(v[::-1])[:-1])
    if len(hh) < 2:
        return float(np.linalg.norm(v[0]))
    a = hh
    b = np.roll(hh, -1, axis=0)
    e = b - a
    if len(hh) > 2 and all(cross2(k, -p) >= -1e-12 for k, p in zip(e, a)):
        return 0.0
    t = np.clip(-np.sum(a * e, axis=1) / np.maximum(np.sum(e * e, axis=1), 1e-30), 0, 1)
    return float(np.min(np.linalg.norm(a + t[:, None] * e, axis=1)))


changes = {}
for path in [
    DENT / "manifest.json",
    PUB / "prototype-assets/molar.glb",
    PUB / "prototype-assets/molar-mobile.glb",
    *sorted(DENT.glob("*.glb")),
    ROOT / "assets/source/dentition/mandibular_first_molar.glb",
]:
    now = sha(path.read_bytes())
    was = sha(srcgit(path))
    changes[path.relative_to(ROOT).as_posix()] = {
        "currentSha256": now,
        "f3257d1Sha256": was,
        "byteIdentical": now == was,
    }
rep = {
    "baselineCommit": subprocess.check_output(["git", "-C", str(ROOT), "rev-parse", BASE])
    .decode()
    .strip(),
    "assetComparison": changes,
    "changedStoryJson": {
        p.name: {"baselineSha256": sha(srcgit(p)), "currentSha256": sha(p.read_bytes())}
        for p in [STORY / "site.json", STORY / "caries-36.json"]
    },
    "unchangedRegistration": {
        k: {
            "currentCanonicalSha256": canon(x),
            "baselineCanonicalSha256": canon(y),
            "identical": x == y,
        }
        for k, x, y in [
            (
                "brushCenterline",
                SITE["brush"]["centerline"],
                oldsite["brush"]["centerline"],
            ),
            ("wholeBrushGuide", SITE["brush"], oldsite["brush"]),
            (
                "displayedMatrices",
                SITE["displayedMatrixColumnMajor"],
                oldsite["displayedMatrixColumnMajor"],
            ),
            (
                "closestProximalPair",
                SITE["closestProximalPair"],
                oldsite["closestProximalPair"],
            ),
        ]
    },
    "runtimeBrush": META["brush"],
    "sampledPoses": len(META["poses"]),
    "toolRuntimeSha256": META["runtimeSha256"],
    "units": "Nominal mm internally. Displayed XYZ = manifest.matrix then one jaw offset (+.32cm upper; −.48cm lower). No tooth motion. Educational geometry only.",
    "lods": {},
}
S = np.asarray(SITE["brush"]["controlPointsWorldCm"][0]) * 10
E = np.asarray(SITE["brush"]["controlPointsWorldCm"][-1]) * 10
axis = unit(E - S)
bx = unit(np.cross(axis, [0, 1, 0.0]))
bz = unit(np.cross(axis, bx))
frame = np.stack([bx, bz], axis=1)
# Resolve each delivered scene independently. FDI 46 keeps its healthy reflected
# geometry for the entire audit; only FDI 36 is replaced in the BVH collection.
for lod, suf in [("desktop", ""), ("mobile", "-mobile")]:
    meshes = {
        "a": glb(DENT / ("dentition" + suf + ".glb")),
        "h": glb(DENT / ("hero-36" + suf + ".glb")),
        "u": glb(PUB / "prototype-assets" / ("molar" + suf + ".glb")),
    }
    arch = {}
    mats = {}
    raw = {}
    ind = {}
    for it in MAN["teeth"]:
        fdi = it["fdi"]
        source = it["source"]
        g = meshes["h" if source == 36 else "u" if source == 26 else "a"][
            "ToothExterior" if source in [26, 36] else it["node"]
        ]
        m = np.asarray(it["matrix"], float).reshape(4, 4).T.copy()
        m[1, 3] += 0.32 if fdi < 30 else -0.48
        p = g["attrs"]["POSITION"]
        f = g["attrs"]["INDICES"].reshape(-1, 3)
        if np.linalg.det(m[:3, :3]) < 0:
            f = f[:, ::-1]
        wp = tx(m, p.astype(float)) * 10
        arch[fdi] = tree(wp, f)
        mats[fdi] = m
        raw[fdi] = wp
        ind[fdi] = f
        if fdi == 36:
            hero = g
            p0 = p.copy()
            face = f
            w0 = wp.copy()
            M = m.copy()
    assert hero["hashes"] == SHAPE["sourceGeometrySha256"]
    assert (
        sha((DENT / ("hero-36" + suf + ".glb")).read_bytes()) == SHAPE["sourceSha256"][lod]
    )
    assert np.allclose(
        M,
        np.asarray(SITE["displayedMatrixColumnMajor"]["36"]).reshape(4, 4).T,
        rtol=0,
        atol=1e-9,
    )
    d, r = fields(SHAPE, p0)
    oldd, oldr = fields(oldshape, p0)
    healthy = arch[36]
    current = tx(M, (p0 + d).astype(float)) * 10
    old = tx(M, (p0 + oldd).astype(float)) * 10
    dep = np.linalg.norm(current - w0, axis=1)
    affected = (dep[face] > 0.005).any(1)
    floors = r[face, 1].mean(1) > 0.55
    deep = int(np.argmax(dep))
    d0 = crosses(w0, face)
    ulen = np.linalg.norm(d0, axis=1)
    _, first, inv = np.unique(p0, axis=0, return_index=True, return_inverse=True)
    wf = inv[face]
    edges = np.sort(np.vstack([wf[:, [0, 1]], wf[:, [1, 2]], wf[:, [2, 0]]]), axis=1)
    _, counts = np.unique(edges, axis=0, return_counts=True)
    area = np.linalg.norm(crosses(current, face), axis=1) / 2
    applyB = np.asarray(SITE["lesion"]["basisWorld"]["buccalLingualTangentBuccalPositive"])
    applyU = np.asarray(
        SITE["lesion"]["basisWorld"]["occlusalGingivalTangentOcclusalPositive"]
    )

    def shape_numbers(w, r):
        depth = np.linalg.norm(w - w0, axis=1)
        mask = depth > 0.005
        dots = (d0 * crosses(w, face)).sum(1) / np.maximum(
            ulen * np.linalg.norm(crosses(w, face), axis=1), 1e-30
        )
        local = mask[face].any(1)
        turn = np.degrees(np.arccos(np.clip(dots, -1, 1)))
        return {
            "over5umVertices": int(mask.sum()),
            "over5umAffectedFaces": int(local.sum()),
            "floorFaces": int((r[face, 1].mean(1) > 0.55).sum()),
            "originalFrameExtentAt5umMm": np.ptp(
                np.stack([w0[mask] @ applyB, w0[mask] @ applyU], axis=1), axis=0
            ).tolist(),
            "maxDepthMm": float(depth.max()),
            "removedVolumeMm3": volume(w0, face) - volume(w, face),
            "deformedPatchFaceNormalsChangedVsHealthyDegP50P95Max": np.percentile(
                turn[local], [50, 95, 100]
            ).tolist(),
            "deepestOriginalVertex": int(np.argmax(depth)),
        }

    info = {
        "healthyNamedSource": {
            "both36And46CanonicalSource": ("hero-36" + suf + ".glb"),
            "sourceNote": "One real left source, distinct independently fitted reflected right instance. No claim of two distinct cadaver specimens. Only 36 is deformed.",
            "sourceAttributeSha256": hero["hashes"],
            "healthy36WorldPositionF32Sha256": sha(w0.astype("<f4").tobytes()),
            "untouched46WorldPositionF32Sha256": sha(raw[46].astype("<f4").tobytes()),
            "placed36And46UseDifferentMatrix": not np.array_equal(mats[36], mats[46]),
            "source36And46AreSameRegisteredShape": True,
        },
        "baselineOriginalLesion": shape_numbers(old, oldr),
        "newLesion": shape_numbers(current, r),
        "topology": {
            "weldedVertexCount": len(first),
            "boundaryEdges": int(np.sum(counts == 1)),
            "nonmanifoldEdges": int(np.sum(counts > 2)),
        },
        "stages": {},
        "visibility": [],
    }
    rep["lods"][lod] = info
    # Test global self-intersection as well as local orientation; the latter alone
    # cannot detect non-neighboring parts of a surface passing through each other.
    for a in [0.0, 0.25, 0.5, 0.75, 1.0]:
        w = tx(M, (p0 + np.float32(a) * d).astype(float)) * 10
        fn = crosses(w, face)
        len1 = np.linalg.norm(fn, axis=1)
        tr = tree(w, face)
        arch[36] = tr
        weld = tree(w[first], wf)
        selfhits = [
            (x, y)
            for x, y in weld["b"].overlap(weld["b"])
            if x < y and not set(wf[x]).intersection(wf[y])
        ]
        inter = []
        n = 0
        for i, j in itertools.combinations(sorted(arch), 2):
            n += 1
            over = pairs(arch[i], arch[j])
            if over:
                inter.append({"pair": [i, j], "facePairs": len(over)})
        info["stages"][str(a)] = {
            "all28PairsTested": n,
            "interToothHits": inter,
            "nonadjacentSelfIntersectionPairs": len(selfhits),
            "firstSelfPairs": selfhits[:8],
            "flippedFaces": int(np.sum((fn * d0).sum(1) <= 0)),
            "degenerateFacesBelow1eMinus12Mm2": int((len1 < 2e-12).sum()),
            "minAreaRatio": float((len1 / ulen).min()),
            "seamCrackMm": float(np.linalg.norm(w - w[first][inv], axis=1).max()),
            "outsideSparseMutationCount": int(
                np.sum((w != w0).any(1) & (np.linalg.norm(d, axis=1) == 0))
            ),
        }
    localn = hero["attrs"]["NORMAL"].copy()
    localn[np.asarray(SHAPE["indices"])] += np.asarray(SHAPE["normalDelta"]).reshape(-1, 3)
    wn = unit(localn @ np.linalg.inv(M[:3, :3]))
    dir = unit(
        np.asarray(oldsite["lesion"]["macroCamera"]["directionFromLesionToCameraWorld"])
    )
    focus = np.asarray(SITE["lesion"]["centerWorldCm"]) * 10
    fc = current[face].mean(1)
    fn = unit(crosses(current, face))
    ids = np.flatnonzero(floors)
    fid = info["newLesion"]
    fid.update(
        {
            "deepestFloorMatureWorldCm": (current[deep] / 10).tolist(),
            "deepestHealthyWorldCm": (w0[deep] / 10).tolist(),
        }
    )
    for distance in [18.5, 21.5, 31.0]:
        for yaw in [0.0, -4.0, -6.0, 6.0]:
            theta = np.deg2rad(yaw)
            rot = np.array(
                [
                    [np.cos(theta), 0, np.sin(theta)],
                    [0, 1, 0],
                    [-np.sin(theta), 0, np.cos(theta)],
                ]
            )
            C = focus + distance * (rot @ dir)
            ok, who = visible(current[deep], wn[deep], C, arch)
            vis = [visible(fc[k], fn[k], C, arch) for k in ids]
            mask = np.asarray([a for a, _ in vis])
            blocked = {}
            for yes, by in vis:
                if not yes:
                    blocked[str(by)] = blocked.get(str(by), 0) + 1
            info["visibility"].append(
                {
                    "originalMacroDirectionWorldYawDeg": yaw,
                    "distanceMm": distance,
                    "cameraWorldCm": (C / 10).tolist(),
                    "floorVisible": int(mask.sum()),
                    "floorProbes": len(ids),
                    "floorAreaFractionByVisibleCentroids": float(
                        area[ids][mask].sum() / area[ids].sum()
                    ),
                    "deepestVertexVisible": ok,
                    "deepestOccluder": who,
                    "blockedFloorCentroidsBy": blocked,
                }
            )
    def audit_camera(pose, scope):
        C = np.array(pose["cameraWorldCm"]) * 10
        ids = np.flatnonzero(floors)
        vis = [visible(fc[k], fn[k], C, arch) for k in ids]
        mask = np.array([ok for ok, _ in vis])
        dv, dby = visible(current[deep], wn[deep], C, arch)
        # For a point in free space, start the ray exactly at the calibrated buccal path entrance (no surface offset).
        view = unit(C - S)
        length = float(np.linalg.norm(C - S))
        hits = []
        for i, tr in arch.items():
            ray, _, _, dist = tr["b"].ray_cast(Vector(S), Vector(view), length)
            if ray is not None:
                hits.append((dist, i))
        return (
            {
                **pose,
                "scope": scope,
                "testedFloorCentroids": len(mask),
                "visibleFloorCentroids": int(mask.sum()),
                "visibleAreaFraction": float(area[ids][mask].sum() / area[ids].sum()),
                "deepestVertexVisible": dv,
                "deepestOccludingTooth": dby,
                "buccalCenterlineEntryVisible": not bool(hits),
                "entryOccluderFdi": min(hits)[1] if hits else None,
                "cameraToNearestHardSurfaceMm": min(
                    float(tr["b"].find_nearest(Vector(C))[3]) for tr in arch.values()
                ),
            }
        )

    author_scope = (
        "Per-profile createStoryCameraConfig: landmark center + authored direction × "
        "minimum distance. Viewport fit and scroll interpolation may alter the rendered pose."
    )
    capture_scope = (
        "Actual production renderer camera and target from the frozen browser capture. "
        "All 28 teeth tested, though only three were visible in these story frames. "
        "Hard-surface visibility only; does not measure brush or interface coverage."
    )
    info["actualAuthoredCameraKeyframes"] = [
        audit_camera(pose, author_scope) for pose in META["authoredCameraProfiles"][lod]
    ]
    captured = [pose for pose in META["browserCapture"]["poses"] if pose["lod"] == lod]
    assert {pose["name"] for pose in captured} == {"lesion", "brush", "result"}
    assert len(captured) == 3
    info["capturedProductionCameras"] = [audit_camera(pose, capture_scope) for pose in captured]
    # Continuous conservative bound: entire triangle affine movement projects within hull of six projected endpoint vertices.
    ids = np.flatnonzero(affected | floors)
    proj0 = (w0 - S) @ frame
    proj1 = (current - S) @ frame
    lower = {
        int(k): hull_radial_lower(np.vstack([proj0[face[k]], proj1[face[k]]])) for k in ids
    }
    floorR = min(lower[int(k)] for k in np.flatnonzero(floors))
    patchR = min(lower[int(k)] for k in np.flatnonzero(affected))
    info["continuousMorphPathBound"] = {
        "fullAxisToAffectedFaceHullMm": patchR,
        "fullAxisToCoreFloorHullMm": floorR,
        "method": "Per-row minimum distance from infinite straight shaft axis to the convex 2D projection of all six healthy/mature endpoints. Encloses each corresponding whole triangle throughout continuous linear morph. Includes both tangent walls and arbitrary intermediate blends; does not approximate by vertex distances alone.",
    }
    floorsurf = tree(current, face[floors])
    originFloorArc = np.stack(
        [((w0 - S) @ axis)[face[floors]], ((current - S) @ axis)[face[floors]]]
    )
    floorArc = [float(originFloorArc.min()), float(originFloorArc.max())]
    coat = {}
    for i in [36, 37]:
        k = lod + "-film" + str(i)
        pp = np.fromfile(TMP / (k + ".f32"), "<f4").reshape(-1, 3)
        ff = np.fromfile(TMP / (k + ".u32"), "<u4").reshape(-1, 3)
        coat[i] = tree(pp, ff)
    print(
        lod,
        "new",
        info["newLesion"],
        "continuous floor/entire affected radius bound",
        floorR,
        patchR,
        flush=True,
    )
    info["brushContact"] = {}
    for group in ["grip", "wire", "nylon"]:
        k = lod + "-" + group
        header = META["groups"][k]
        steps = header["steps"]
        nv = header["vertices"]
        pp = np.memmap(TMP / (k + ".f32"), dtype="<f4", mode="r", shape=(steps, nv, 3))
        ff = np.fromfile(TMP / (k + ".u32"), "<u4").reshape(-1, 3)
        hits = []
        hhealthy = 0
        floorhits = 0
        filmframes = {36: set(), 37: set()}
        filmtr = {36: set(), 37: set()}
        bound = 1e30
        maxR = 0.0
        for q, w in enumerate(pp):
            tr = tree(w, ff)
            floorhits += len(pairs(tr, floorsurf))
            hhealthy += len(pairs(tr, healthy))
            for i, t in arch.items():
                ov = pairs(tr, t)
                if ov:
                    hits.append({"pose": q, "fdi": i, "facePairs": len(ov)})
            for i, t in coat.items():
                ov = pairs(tr, t)
                if ov:
                    filmframes[i].add(q)
                    filmtr[i].update(b for _, b in ov)
            rr = float(np.linalg.norm((w - S) @ frame, axis=1).max())
            maxR = max(maxR, rr)
            ss = (w - S) @ axis
            axgap = max(0, floorArc[0] - float(ss.max()), float(ss.min()) - floorArc[1])
            bound = min(bound, math.hypot(axgap, max(0, floorR - rr)))
        info["brushContact"][group] = {
            "poses": steps,
            "verticesPerPose": nv,
            "trianglesPerPose": len(ff),
            "all28CohortPairTests": steps * 28,
            "matureHardSurfaceIntersections": hits,
            "healthy36IntersectionPairs": hhealthy,
            "matureFloorTriangleHits": floorhits,
            "filmContactPoses": {i: len(v) for i, v in filmframes.items()},
            "touchedFilmTriangles": {i: len(v) for i, v in filmtr.items()},
            "maxActualRadialExtentMm": maxR,
            "allSampledToolPosesVsAllMorphStagesConservativeFloorSeparationMm": max(
                0, bound - 0.001
            ),
            "boundMethod": "Whole transformed tool triangles project inside endpoint radial cylinder and axial range; radial/axial ranges hold over every point of each triangle. Compare with whole continuous-morph floor hull bound, using 0.001 mm numerical reserve. Finite tool pose sampling, not a universal clinical claim.",
        }
        print(
            lod,
            group,
            "hard",
            len(hits),
            "floor",
            floorhits,
            "lower bound",
            bound,
            "film",
            {i: len(v) for i, v in filmframes.items()},
            flush=True,
        )
rep["summary"] = {
    "sourceAssetsAllByteIdenticalToF3257d1": all(
        x["byteIdentical"] for x in rep["assetComparison"].values()
    ),
    "physicalCenterlineUnchanged": rep["unchangedRegistration"]["brushCenterline"][
        "identical"
    ],
    "all28HardToothPairsAcrossStagesAndLods": sum(
        s["all28PairsTested"] for v in rep["lods"].values() for s in v["stages"].values()
    ),
    "toothSelfOrPairHits": sum(
        s["nonadjacentSelfIntersectionPairs"] + len(s["interToothHits"])
        for v in rep["lods"].values()
        for s in v["stages"].values()
    ),
    "toolVsMatureHardHits": sum(
        len(a["matureHardSurfaceIntersections"])
        for v in rep["lods"].values()
        for a in v["brushContact"].values()
    ),
    "anyFloorToolHit": any(
        a["matureFloorTriangleHits"]
        for v in rep["lods"].values()
        for a in v["brushContact"].values()
    ),
    "minimumConservativeGapFloorToToolMmOverSampledPosesAndAllMorphWeights": min(
        a["allSampledToolPosesVsAllMorphStagesConservativeFloorSeparationMm"]
        for v in rep["lods"].values()
        for a in v["brushContact"].values()
    ),
}
print("Summary", rep["summary"])
summary = rep["summary"]
rep["cameraInputProvenance"] = {
    "frozenNumericInputSha256": META["browserCaptureSha256"],
    "sourceBrowserReportSha256": META["browserCapture"]["captureReportSha256"],
    "servedBundleSha256": META["browserCapture"]["servedBundleSha256"],
    "captureCounts": META["browserCapture"]["captureCounts"],
}
checks = {
    "actualAndAuthoredCamerasSeeCavityAndEntry": all(
        pose["deepestVertexVisible"] and pose["buccalCenterlineEntryVisible"]
        and pose["visibleFloorCentroids"] == pose["testedFloorCentroids"]
        for info in rep["lods"].values()
        for key in ("actualAuthoredCameraKeyframes", "capturedProductionCameras")
        for pose in info[key]
    ),
    "referenceMeshesUnchanged": summary["sourceAssetsAllByteIdenticalToF3257d1"],
    "registrationAndPathUnchanged": all(
        x["identical"] for x in rep["unchangedRegistration"].values()
    ),
    "noToothCollisions": summary["toothSelfOrPairHits"] == 0,
    "orientationAndSeamsIntact": all(
        not (
            s["flippedFaces"]
            or s["degenerateFacesBelow1eMinus12Mm2"]
            or s["seamCrackMm"]
            or s["outsideSparseMutationCount"]
        )
        for v in rep["lods"].values()
        for s in v["stages"].values()
    ),
    "actualToolNeverCrossesHardSurface": summary["toolVsMatureHardHits"] == 0
    and all(
        a["healthy36IntersectionPairs"] == 0
        for v in rep["lods"].values()
        for a in v["brushContact"].values()
    ),
    "coreStaysClearOfActualTool": not summary["anyFloorToolHit"]
    and summary["minimumConservativeGapFloorToToolMmOverSampledPosesAndAllMorphWeights"]
    > 0,
    "bristlesReachBothFilms": all(
        all(n > 0 for n in v["brushContact"]["nylon"]["filmContactPoses"].values())
        for v in rep["lods"].values()
    ),
}
rep["checks"] = checks
rep["passed"] = all(checks.values())
(OUT / "independent-geometry.json").write_text(
    json.dumps(rep, indent=2) + "\n", encoding="utf8"
)
if not rep["passed"]:
    raise RuntimeError(
        "Audit checks failed: " + str([k for k, v in checks.items() if not v])
    )
