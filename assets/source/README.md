# Original anatomy asset

This directory contains the unchanged source files for **Maxillary First Molar** by the University of Dundee, School of Dentistry: a permanent upper LEFT first molar (FDI 26 / UL6), created in ZBrush using CT data.

- Creator: Emily McDougall
- Content expert: Dr. Andrew Mason
- Initial 3D preparation: Mark Roughley
- [Original model](https://sketchfab.com/3d-models/maxillary-first-molar-e719a474ef7e4bd7abec508f85f1e984)
- [CC BY 4.0 license](https://creativecommons.org/licenses/by/4.0/)
- [Public VAMO/inVisu redistribution](https://vamo.invisu.ca/vamo/dentaire/molaire_maxillaire.html)

`dundee/scene.gltf`, `dundee/scene.bin` and both `dundee/textures/` images remain unchanged. Their original URLs and SHA-256 hashes are in `dundee/source-provenance.json`.

The adapted `public/models/molar.glb` retains the original positions, indices, UVs, normals, tangents and normal-map bytes. The current material update also preserves every existing node transform and scene. Original vertex-color bytes remain in the buffer, but their material multiplier is disabled to avoid double-darkening. Authored calibrated color and PBR maps create warm off-white enamel, pale cream roots and a soft cervical transition without any geometry changes. Exact settings, geometry hashes and limits are recorded in `public/models/provenance.json`.

This is a CT-informed educational reconstruction, not an untouched high-resolution micro-CT scan or a clinically validated tissue segmentation.
