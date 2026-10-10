# Model attribution

The displayed molar is adapted from **D46.stl**, the mandibular right first permanent molar (FDI 46), in:

> DIAZ, CRISTIAN; Ferro Sanchez, Carlos andres; Campo, Oscar (2024), *Data of 3D models of human jaw with teeth, ligaments, and bone structures*, Mendeley Data, V1, doi:10.17632/97c3pf8h2h.1.

- Original dataset: https://data.mendeley.com/datasets/97c3pf8h2h/1
- DOI: https://doi.org/10.17632/97c3pf8h2h.1
- License: **Creative Commons Attribution 4.0 International (CC BY 4.0)**, https://creativecommons.org/licenses/by/4.0/
- Direct source file: https://data.mendeley.com/public-files/datasets/97c3pf8h2h/files/4690504a-de41-4be1-aa95-9d1cd18f9248/file_downloaded
- Source SHA256: `652e2b364a3b17334d1f1bfd5769600768cee99322ae52febab257a72a2ae809`

The unmodified STL is retained in `assets/source/D46.stl`. The adapted GLB is `public/models/molar.glb`. The anatomical model, including the distributed adaptation, is provided under CC BY 4.0. No endorsement by the dataset authors is implied.

## Adaptation

The source tooth is isolated, reoriented crown-up and centered. Surface interpolation, authored surface colors, UVs and PBR maps, and a visual enamel/root material transition prepare it for the viewer. Exact export settings and changes are recorded in `public/models/provenance.json` and the model generation script in `scripts/`.

The source contains an outer surface without photographic textures or enamel/cementum tissue segmentation. Material colors, roughness, translucency, microstructure and the cervical boundary are artistic approximations, not measurements. The original remeshing limits fine fissure detail. Neither interpolation nor added surface shading recovers missing measured anatomy.

## Software and other assets

- Viewer code and original processing scripts: MIT, see `LICENSE`.
- Three.js: MIT, https://github.com/mrdoob/three.js/blob/dev/LICENSE
- Vite: MIT, https://github.com/vitejs/vite/blob/main/LICENSE
- Khronos glTF Validator (development validation only): Apache-2.0, https://github.com/KhronosGroup/glTF-Validator
- Studio environment is generated in code; no external HDRI or paid assets.

Use of the model on another website must retain appropriate authorship credit, the CC BY 4.0 link, and a description of changes.
