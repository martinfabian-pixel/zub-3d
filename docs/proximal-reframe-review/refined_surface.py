"""Expand a midpoint recipe and prove its healthy geometry partitions original faces.

Shared by the Blender surface and smile-sweep audits. The assertions use original
vertex ancestry and barycentric triangle coverage, not a nearest-surface fit.
"""

from collections import Counter, defaultdict

import numpy as np


def _integers(values, name):
    result = np.asarray(values)
    if not np.issubdtype(result.dtype, np.integer):
        raise ValueError(f"{name} must contain only integers")
    return result.astype(np.int64, copy=False)


def _unit(vector):
    length = np.linalg.norm(vector)
    if length < 1e-12:
        raise ValueError("Cannot interpolate opposite unit vectors")
    return vector / length


def expand_surface(attributes, faces, damage):
    """Return (attributes, faces, audit). No caller-owned arrays are mutated."""
    source_count = len(attributes["POSITION"])
    faces = np.asarray(faces, dtype=np.int64)
    recipe = damage.get("refinement")
    if recipe is None:
        assert damage["vertexCount"] == source_count and damage["triangleCount"] == len(
            faces
        )
        return attributes, faces, {"refined": False}

    assert recipe["sourceVertexCount"] == source_count
    assert recipe["sourceTriangleCount"] == len(faces)
    midpoints = _integers(recipe["edgeMidpoints"], "edgeMidpoints").reshape(-1, 2)
    removed = _integers(recipe["replacedFaces"], "replacedFaces").reshape(-1)
    children = _integers(recipe["triangles"], "triangles").reshape(-1, 3)
    total_count = source_count + len(midpoints)
    assert total_count == damage["vertexCount"]
    assert len(np.unique(removed)) == len(removed) and np.all(
        (removed >= 0) & (removed < len(faces))
    )
    assert np.all((children >= 0) & (children < total_count))
    assert len(faces) - len(removed) + len(children) == damage["triangleCount"]

    result = {}
    for name, source in attributes.items():
        target = np.empty((total_count, source.shape[1]), dtype=source.dtype)
        target[:source_count] = source
        result[name] = target

    # At most three nonzero weights are permitted: a midpoint must stay in
    # one native parent triangle. Dyadic weights are exactly representable.
    ancestry = {}
    used_edges = set()

    def weights(i):
        return {i: 1.0} if i < source_count else ancestry[i]

    for i, (a, b) in enumerate(midpoints, start=source_count):
        a, b = int(a), int(b)
        assert 0 <= a < i and 0 <= b < i and a != b
        key = tuple(sorted((a, b)))
        assert key not in used_edges, "Repeated midpoint for the same indexed edge"
        used_edges.add(key)
        coefs = defaultdict(float)
        for vertex in key:
            for parent, w in weights(vertex).items():
                coefs[parent] += w / 2
        assert len(coefs) <= 3
        ancestry[i] = dict(coefs)

        for name, target in result.items():
            # Browser writes the average into Float32Array before normalizing.
            value = (
                ((target[a].astype(float) + target[b]) / 2)
                .astype(target.dtype)
                .astype(float)
            )
            if name == "NORMAL":
                value = _unit(value)
            elif name == "TANGENT":
                value[:3] = _unit(value[:3])
                # Handedness is discrete; intact UV islands must not interpolate
                # across opposite tangent orientations at an authored seam.
                assert target[a, 3] == target[b, 3], (
                    "Midpoint crosses an opposite tangent seam"
                )
                value[3] = target[a, 3]
            target[i] = value

    parent_by_vertices = {tuple(sorted(map(int, faces[i]))): int(i) for i in removed}
    assert len(parent_by_vertices) == len(removed)
    by_parent = defaultdict(list)
    assigned_parents = _integers(recipe["parentFaces"], "parentFaces").reshape(-1)
    assert len(assigned_parents) == len(children)
    for child, declared_parent in zip(children, assigned_parents):
        support = set().union(*(weights(int(i)) for i in child))
        parent = parent_by_vertices.get(tuple(sorted(support)))
        assert parent is not None, (
            "Replacement triangle straddles, or lacks, an original parent"
        )
        assert parent == declared_parent, (
            "Declared parent disagrees with independently computed ancestry"
        )
        by_parent[parent].append(child)
    assert set(by_parent) == set(map(int, removed))
    assert set(map(int, children.ravel())) >= set(ancestry), "Unreferenced new vertex"

    max_area_error = 0.0
    max_parent_residual = 0.0
    for parent, tris in by_parent.items():
        vertices = list(map(int, faces[parent]))
        parent_points = attributes["POSITION"][vertices].astype(float)
        partition_area = 0.0
        edge_counts = Counter()
        directed_counts = Counter()
        coords = {}
        for tri in tris:
            ids = list(map(int, tri))
            for i in ids:
                if i not in coords:
                    coords[i] = np.array([weights(i).get(v, 0.0) for v in vertices])
                    assert np.min(coords[i]) >= 0 and coords[i].sum() == 1
                    residual = np.linalg.norm(
                        coords[i] @ parent_points - result["POSITION"][i]
                    )
                    max_parent_residual = max(max_parent_residual, float(residual))
            # In parent barycentric coordinates the signed determinant is the
            # child/parent area ratio; all child windings must match the parent.
            bc = np.array([coords[i] for i in ids])
            a, b = bc[1, 1:] - bc[0, 1:], bc[2, 1:] - bc[0, 1:]
            ratio = a[0] * b[1] - a[1] * b[0]
            assert ratio > 0
            partition_area += ratio
            for a, b in zip(ids, ids[1:] + ids[:1]):
                edge = tuple(sorted((a, b)))
                edge_counts[edge] += 1
                directed_counts[edge] += 1 if (a, b) == edge else -1

        boundary = defaultdict(list)
        for (a, b), count in edge_counts.items():
            shared_zero = np.flatnonzero((coords[a] == 0) & (coords[b] == 0))
            if not len(shared_zero):
                assert count == 2 and directed_counts[a, b] == 0, (
                    "Unmatched internal child edge"
                )
                continue
            assert len(shared_zero) == 1 and count == 1
            side = int(shared_zero[0])
            k = (side + 1) % 3
            boundary[side].append(sorted([coords[a][k], coords[b][k]]))
        for side in range(3):
            last = 0.0
            for lo, hi in sorted(boundary[side]):
                assert lo == last and hi > lo, "Gap or overlapping child boundary interval"
                last = hi
            assert last == 1.0
        max_area_error = max(max_area_error, abs(1 - partition_area))

    assert max_area_error < 1e-10 and max_parent_residual < 2e-8
    keep = np.ones(len(faces), dtype=bool)
    keep[removed] = False
    stitched = np.concatenate([faces[keep], children])
    assert all(np.array_equal(result[k][:source_count], a) for k, a in attributes.items())
    return (
        result,
        stitched,
        {
            "refined": True,
            "originalAttributePrefixExact": True,
            "nativeVertices": source_count,
            "nativeFaces": len(faces),
            "newMidpoints": len(midpoints),
            "replacedNativeFaces": len(removed),
            "replacementTriangles": len(children),
            "refinedHealthyVertices": total_count,
            "refinedHealthyFaces": len(stitched),
            "unmodifiedNativeFaces": int(keep.sum()),
            "maxChildCoverageAreaRatioError": max_area_error,
            "maxHealthyPointOffsetFromParentMetres": max_parent_residual,
            "allNativeParentsHaveOrientedCompleteBoundaryPartitions": True,
        },
    )
