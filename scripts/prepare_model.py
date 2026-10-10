"""Convert the licensed D46 surface to a portable, self-contained PBR GLB.

Usage: python scripts/prepare_model.py
Install scripts/requirements-model.txt first. No Blender is required.

This is presentation processing of a coarse source surface. Subdivision cannot
recover missing anatomy; the cervical material boundary and all color/optical
properties below are visual approximations, not measured tissue segmentation.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
import struct

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
import trimesh


ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = "https://data.mendeley.com/datasets/97c3pf8h2h/1"
SOURCE_LICENSE = "https://creativecommons.org/licenses/by/4.0/"


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def cervical_boundary(theta):
    # Visually estimated on the original, unsegmented D46 surface (source mm).
    return 8.0 + 0.42 * np.cos(theta * 2) + 0.16 * np.sin(theta * 3)


def tissue_weight(y, theta):
    return smoothstep(-0.65, 0.85, y - cervical_boundary(theta))


def linear_rgb(srgb):
    return np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)


def tangent_basis(positions, normals, uv, faces):
    """Area-weighted UV tangent frame with Gram-Schmidt orthogonalization."""
    tri = positions[faces].astype(float)
    tex = uv[faces]
    edge1, edge2 = tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]
    duv1, duv2 = tex[:, 1] - tex[:, 0], tex[:, 2] - tex[:, 0]
    determinant = duv1[:, 0] * duv2[:, 1] - duv1[:, 1] * duv2[:, 0]
    valid = np.abs(determinant) > 1e-15
    reciprocal = np.zeros(len(faces))
    reciprocal[valid] = 1 / determinant[valid]
    area = np.linalg.norm(np.cross(edge1, edge2), axis=1)
    tangent = (edge1 * duv2[:, 1, None] - edge2 * duv1[:, 1, None]) * (reciprocal * area)[:, None]
    bitangent = (edge2 * duv1[:, 0, None] - edge1 * duv2[:, 0, None]) * (reciprocal * area)[:, None]
    total_t, total_b = np.zeros_like(positions, dtype=float), np.zeros_like(positions, dtype=float)
    for corner in range(3):
        np.add.at(total_t, faces[:, corner], tangent)
        np.add.at(total_b, faces[:, corner], bitangent)
    total_t -= normals * np.sum(normals * total_t, axis=1)[:, None]
    length = np.linalg.norm(total_t, axis=1)
    missing = length < 1e-15
    fallback = np.zeros_like(total_t[missing])
    fallback[:, 0] = 1
    fallback[np.abs(normals[missing, 0]) > .9] = [0, 0, 1]
    total_t[missing] = np.cross(normals[missing], fallback)
    total_t /= np.linalg.norm(total_t, axis=1)[:, None]
    sign = np.where(np.sum(np.cross(normals, total_t) * total_b, axis=1) < 0, -1, 1)
    return np.column_stack([total_t, sign]).astype("<f4")


class GLB:
    def __init__(self):
        self.data = bytearray()
        self.doc = {
            "asset": {"version": "2.0", "generator": "ZUB licensed scan presentation pipeline"},
            "scene": 0, "scenes": [{"nodes": [0]}],
            "nodes": [{"name": "D46 · mandibular right first molar", "mesh": 0}],
            "bufferViews": [], "accessors": [], "images": [], "textures": [],
            "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 33071}],
        }

    def view(self, data, target=None):
        while len(self.data) % 4:
            self.data.append(0)
        out = {"buffer": 0, "byteOffset": len(self.data), "byteLength": len(data)}
        if target is not None:
            out["target"] = target
        self.data.extend(data)
        self.doc["bufferViews"].append(out)
        return len(self.doc["bufferViews"]) - 1

    def accessor(self, array, component_type, shape, *, normalized=False, bounds=False):
        array = np.ascontiguousarray(array)
        acc = {"bufferView": self.view(array.tobytes(), 34963 if shape == "SCALAR" else 34962),
               "componentType": component_type, "count": len(array), "type": shape}
        if normalized:
            acc["normalized"] = True
        if bounds:
            acc["min"] = array.min(axis=0).tolist()
            acc["max"] = array.max(axis=0).tolist()
        self.doc["accessors"].append(acc)
        return len(self.doc["accessors"]) - 1

    def texture(self, name, pixels):
        stream = io.BytesIO()
        Image.fromarray(np.uint8(np.clip(pixels, 0, 255))).save(stream, format="PNG", optimize=True)
        self.doc["images"].append({"name": name, "mimeType": "image/png", "bufferView": self.view(stream.getvalue())})
        self.doc["textures"].append({"sampler": 0, "source": len(self.doc["images"]) - 1})
        return {"index": len(self.doc["textures"]) - 1}

    def save(self, path):
        self.doc["buffers"] = [{"byteLength": len(self.data)}]
        raw = json.dumps(self.doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        raw += b" " * (-len(raw) % 4)
        self.data.extend(b"\0" * (-len(self.data) % 4))
        length = 12 + 8 + len(raw) + 8 + len(self.data)
        path.write_bytes(struct.pack("<III", 0x46546C67, 2, length)
                         + struct.pack("<II", len(raw), 0x4E4F534A) + raw
                         + struct.pack("<II", len(self.data), 0x004E4942) + self.data)


def prepare(source, output):
    original = trimesh.load_mesh(source, process=True)
    if not isinstance(original, trimesh.Trimesh) or not original.is_watertight:
        raise ValueError("The expected source is one closed triangle surface.")
    original.fix_normals()
    before_bounds = original.bounds.copy()
    # Two Loop passes interpolate a smooth presentation surface. This changes
    # positions slightly and introduces no additional measured scan detail.
    vertices, faces = trimesh.remesh.subdivide_loop(original.vertices, original.faces, iterations=2)
    mesh = trimesh.Trimesh(vertices, faces, process=False)
    # Rotate, never mirror: (source X,Y,Z) -> (Y,Z,X). Original +Z is crown-up.
    # This places the visible separation of the two roots along viewer X.
    v = mesh.vertices[:, [1, 2, 0]].copy()
    crown = v[:, 1] > 10.0
    axis = np.mean(v[crown][:, [0, 2]], axis=0)
    theta = np.arctan2(v[:, 2] - axis[1], v[:, 0] - axis[0])
    ymin, ymax = v[:, 1].min(), v[:, 1].max()
    uv = np.column_stack([(theta + np.pi) / (2 * np.pi), (v[:, 1] - ymin) / (ymax - ymin)])
    enamel = tissue_weight(v[:, 1], theta)
    roots = np.array([0.805, 0.754, 0.655])
    ivory = np.array([0.936, 0.923, 0.876])
    colors = roots + enamel[:, None] * (ivory - roots)
    # Low-amplitude, deterministic color variation; no painted decay or lesions.
    variation = (np.sin(v[:, 0] * 1.41 + v[:, 1] * 0.78) * np.sin(v[:, 2] * 1.68 - v[:, 1] * .54)
                 + .35 * np.cos(v[:, 0] * 3.7 + v[:, 2] * 4.1)) * .006
    colors += variation[:, None] * [1, .85, .65]
    neck = np.exp(-((v[:, 1] - cervical_boundary(theta) - .7) / 1.5) ** 2)
    colors -= neck[:, None] * [.005, .013, .024]
    # A restrained warm tint follows existing concave, upward-facing crown
    # grooves only. It does not introduce a fissure, crack, or decay geometry.
    edges = mesh.edges_unique
    delta = np.zeros_like(mesh.vertices)
    square = np.zeros(len(v))
    displacement = mesh.vertices[edges[:, 1]] - mesh.vertices[edges[:, 0]]
    np.add.at(delta, edges[:, 0], displacement)
    np.add.at(delta, edges[:, 1], -displacement)
    length_squared = np.sum(displacement ** 2, axis=1)
    np.add.at(square, edges[:, 0], length_squared)
    np.add.at(square, edges[:, 1], length_squared)
    curvature = np.sum(delta * mesh.vertex_normals, axis=1) / np.maximum(square, 1e-12)
    groove = (smoothstep(.08, .48, curvature) * smoothstep(10.4, 12.2, v[:, 1])
              * smoothstep(.25, .70, mesh.vertex_normals[:, 2]))
    colors -= groove[:, None] * [.024, .028, .031]
    rgba = np.column_stack([np.rint(linear_rgb(np.clip(colors, 0, 1)) * 255), np.full(len(v), 255)]).astype("uint8")

    # Smooth vertex normals from the interpolated surface, rotated consistently.
    normals = mesh.vertex_normals[:, [1, 2, 0]].astype("<f4")
    # Center a tooth whose source coordinates belong to a whole-jaw assembly;
    # convert source millimetres to glTF metres without changing proportions.
    center = (v.min(axis=0) + v.max(axis=0)) / 2
    positions = ((v - center) * .001).astype("<f4")

    # Duplicate only the cylindrical UV seam. Keep all original triangle winding.
    seam = np.ptp(uv[faces, 0], axis=1) > .5
    faces = faces.copy()
    duplicates = {}
    for face_index in np.flatnonzero(seam):
        for corner in range(3):
            old = int(faces[face_index, corner])
            if uv[old, 0] < .5:
                if old not in duplicates:
                    duplicates[old] = len(positions) + len(duplicates)
                faces[face_index, corner] = duplicates[old]
    ids = np.array(list(duplicates), dtype=int)
    if len(ids):
        positions = np.concatenate([positions, positions[ids]])
        normals = np.concatenate([normals, normals[ids]])
        rgba = np.concatenate([rgba, rgba[ids]])
        uv = np.concatenate([uv, uv[ids] + [1, 0]])

    builder = GLB()
    attributes = {
        "POSITION": builder.accessor(positions, 5126, "VEC3", bounds=True),
        "NORMAL": builder.accessor(normals, 5126, "VEC3"),
        "TANGENT": builder.accessor(tangent_basis(positions, normals, uv, faces), 5126, "VEC4"),
        "TEXCOORD_0": builder.accessor(uv.astype("<f4"), 5126, "VEC2"),
        "COLOR_0": builder.accessor(rgba, 5121, "VEC4", normalized=True),
    }
    indices = builder.accessor(faces.astype("<u4").reshape(-1), 5125, "SCALAR")

    size = 1024
    t = (np.arange(size) + .5) / size
    angle, height = np.meshgrid(t * np.pi * 2 - np.pi, ymin + t * (ymax - ymin))
    weight = tissue_weight(height, angle)
    rng = np.random.default_rng(46)
    field = gaussian_filter(rng.normal(size=(size, size)), (2.3, 3.5), mode=("reflect", "wrap"))
    field /= np.std(field)
    fine = gaussian_filter(rng.normal(size=(size, size)), .65, mode=("reflect", "wrap"))
    fine /= np.std(fine)
    rough = np.clip(.51 - weight * .265 + field * .011 + fine * .004, .19, .59)
    mr = np.stack([np.ones_like(weight), rough, np.zeros_like(weight)], axis=-1) * 255
    mr_texture = builder.texture("Synthetic tissue-dependent roughness", mr)
    coating = np.stack([.025 + weight * .205, np.full_like(weight, .20), np.zeros_like(weight)], axis=-1) * 255
    coating_texture = builder.texture("Synthetic enamel polish", coating)
    transmission_texture = builder.texture("Subtle enamel transmission mask", np.repeat((weight * .035 * 255)[..., None], 3, axis=-1))

    # Extremely restrained, synthetic microroughness. The original dataset has
    # no measured color or normal textures. Do not describe this as scan detail.
    dy, dx = np.gradient(field)
    strength = .038 - weight * .026
    nx, ny = -dx * strength, -dy * strength
    nz = np.sqrt(np.clip(1 - nx * nx - ny * ny, 0, 1))
    normal_texture = builder.texture("Synthetic subpixel surface texture", (np.stack([nx, ny, nz], axis=-1) * .5 + .5) * 255)
    builder.doc["materials"] = [{
        "name": "Ivory enamel and warmer matte roots · visual approximation",
        "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0,
                                 "roughnessFactor": 1, "metallicRoughnessTexture": mr_texture},
        "normalTexture": {**normal_texture, "scale": .65},
        "extensions": {
            "KHR_materials_ior": {"ior": 1.52},
            "KHR_materials_clearcoat": {"clearcoatFactor": 1, "clearcoatTexture": coating_texture,
                                        "clearcoatRoughnessFactor": .20},
            "KHR_materials_transmission": {"transmissionFactor": 1, "transmissionTexture": transmission_texture},
        },
        "extras": {"segmentation": "Visually estimated cervical transition; not tissue segmentation.",
                   "appearance": "Synthetic PBR colors and microtexture; no measured texture available."},
    }]
    builder.doc["extensionsUsed"] = ["KHR_materials_ior", "KHR_materials_clearcoat", "KHR_materials_transmission"]
    builder.doc["meshes"] = [{"name": "D46 interpolated source surface", "primitives": [{
        "attributes": attributes, "indices": indices, "material": 0, "mode": 4,
    }]}]
    metadata = {
        "model": "D46, mandibular right first molar (FDI 46)",
        "source": {"url": SOURCE_URL, "dataset": "Data of 3D models of human jaw with teeth, ligaments, and bone structures",
                   "doi": "10.17632/97c3pf8h2h.1",
                   "authors": ["CRISTIAN DIAZ", "Carlos andres Ferro Sanchez", "Oscar Campo"],
                   "year": 2024, "version": 1, "file": "D46.stl",
                   "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                   "license": "CC BY 4.0", "license_url": SOURCE_LICENSE,
                   "vertices": len(original.vertices), "triangles": len(original.faces),
                   "bounds_mm": before_bounds.tolist(), "watertight": bool(original.is_watertight)},
        "processing": ["Weld coincident STL vertices and orient outward normals.",
                       "Apply two Loop surface-subdivision passes; interpolation adds no measured detail.",
                       "Rotate (X,Y,Z) to (Y,Z,X), placing crown +Y and roots -Y; no mirroring.",
                       "Center bounding box and convert source millimetres to glTF metres.",
                       "Calculate smooth normals and UV tangent frames; duplicate cylindrical UV seam only.",
                       "Add synthetic ivory-to-root vertex color and embedded roughness, micro-normal, polish and transmission textures.",
                       "Apply a very subtle synthetic tint to existing upward-facing concave crown grooves.",
                       "Place a softly blended, visually estimated cervical material boundary at source Z approximately 8 mm."],
        "output": {"vertices_including_uv_seam": len(positions), "triangles": len(faces),
                   "bounds_metres": [positions.min(axis=0).tolist(), positions.max(axis=0).tolist()],
                   "texture_resolution": [size, size], "textures": 4},
        "limitations": ["Source anatomy is a combined clinical reconstruction, remeshed at approximately 0.25 mm, not a high-resolution micro-CT tooth.",
                        "The source contains softened fissures and local reconstruction irregularities.",
                        "Subdivision only interpolates the existing surface.",
                        "No measured enamel/root color, enamel thickness, or tissue segmentation is available.",
                        "Optical appearance and cervical boundary are illustrative; no clinical validation is claimed."],
    }
    builder.doc["asset"]["copyright"] = "CRISTIAN DIAZ; Carlos andres Ferro Sanchez; Oscar Campo (2024). CC BY 4.0. Presentation adaptation: ZUB project."
    builder.doc["asset"]["extras"] = {"source": SOURCE_URL, "license": SOURCE_LICENSE, "presentation": "Synthetic appearance, interpolated anatomical surface."}
    output.parent.mkdir(parents=True, exist_ok=True)
    builder.save(output)
    metadata["output"]["bytes"] = output.stat().st_size
    metadata["output"]["sha256"] = hashlib.sha256(output.read_bytes()).hexdigest()
    (output.parent / "provenance.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata["output"], indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / "assets/source/D46.stl")
    parser.add_argument("--output", type=Path, default=ROOT / "public/models/molar.glb")
    args = parser.parse_args()
    prepare(args.source, args.output)
