# Model attribution

The displayed tooth is adapted from **Maxillary First Molar (Left)**, an anatomical model of the permanent upper left first molar (FDI 26 / UL6), by **University of Dundee, School of Dentistry**.

- Created by **Emily McDougall**, in ZBrush using CT data.
- Content expert: **Dr. Andrew Mason**.
- Initial 3D preparation: **Mark Roughley**.
- Original source: https://sketchfab.com/3d-models/maxillary-first-molar-e719a474ef7e4bd7abec508f85f1e984
- Author: https://sketchfab.com/DundeeDental
- License: **Creative Commons Attribution 4.0 International (CC BY 4.0)**, https://creativecommons.org/licenses/by/4.0/
- Obtained through public educational redistribution by **VAMO / inVisu inc.**: https://vamo.invisu.ca/vamo/dentaire/molaire_maxillaire.html
- Source resource directory: https://vamo.invisu.ca/vamo/objets3D/sketchfab/maxillary_first_molar/

The source glTF embeds the same author, source URL and license in its asset metadata. Primary Sketchfab metadata independently confirms the model's identity and CC BY 4.0 license. Exact downloaded files and SHA256 checksums are recorded in `assets/source/` and `public/models/provenance.json`. The displayed adaptation is also provided under CC BY 4.0. No endorsement is implied.

## Adaptation

The original upper molar replaces the earlier mandibular D46 model entirely. Its three roots are native to the source. The original mesh positions, normals, UVs, tangents, and anatomical proportions are preserved; only a rigid orientation and uniform presentation scale are applied. There is no root addition, deformation, subdivision, or topology smoothing. Nominal GLB height of 21 mm is an illustrative presentation scale, not a specimen measurement.

The source's native 4096 × 4096 base color and normal maps are retained as the basis of the appearance. The normal map bytes remain unchanged. Base color grading slightly lightens and desaturates the roots and adds small warm/cool enamel variations. Additional material maps and optical settings distinguish glossy enamel from matte roots, with restrained enamel transmission, surface variation and texture seam padding. The original texture's enamel/root transition guides the material mask. Exact generated parameters and processing are documented in the preparation script and provenance file.

This is an educational CT-informed reconstruction, not a raw microCT scan. The source is an outer surface without measured enamel/dentin segmentation or photographic PBR measurements. Added optical properties and microstructure are artistic approximations. Clinical validation is not claimed.

## Software and other assets

- Viewer code and original processing scripts: MIT, see `LICENSE`.
- Three.js: MIT, https://github.com/mrdoob/three.js/blob/dev/LICENSE
- Vite: MIT, https://github.com/vitejs/vite/blob/main/LICENSE
- Khronos glTF Validator (development validation only): Apache-2.0, https://github.com/KhronosGroup/glTF-Validator
- Studio environment and shadow passes are generated in code; no external HDRI or paid assets.

The earlier D46/Diaz et al. model remains credited in Git history. It is no longer displayed or included in the current deployed model.

Reuse on another website must retain appropriate author credit, the CC BY 4.0 link, and a description of modifications.
