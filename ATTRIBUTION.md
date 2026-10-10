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

The native 4096 × 4096 normal-map bytes remain unchanged. An authored 4K calibrated color texture uses the original UVs, painted crown/root boundary and restrained native color relief. It gives the enamel a warm off-white shade, the roots a pale cream shade and softens the cervical color transition. The native vertex-color multiplier is disabled to avoid double-darkening; its original bytes remain in the buffer. Tissue-dependent PBR maps supply roughness, restrained clearcoat, enamel transmission and illustrative optical thickness. Exact generated parameters, processing and geometry hashes are documented in the preparation script and provenance file.

The studio reflection environment is generated in linear light with broad graded diffusers and front/lower bounce cards. Neutral tone mapping and restrained exposure preserve the ivory shade and bright surface detail. No external photographic references or HDR images are redistributed. Optical reference: https://pubmed.ncbi.nlm.nih.gov/19566303/. The volume approximation follows https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_volume.

This is an educational CT-informed reconstruction, not a raw microCT scan. The source is an outer surface without measured enamel/dentin segmentation or photographic PBR measurements. Added colors and optical properties are visualization approximations. Single-surface transmission and absorption do not reproduce full subsurface scattering or separate enamel/dentin layers. No additional geometry was introduced in the material update. Clinical validation is not claimed.

## Software and other assets

- Viewer code and original processing scripts: MIT, see `LICENSE`.
- Three.js: MIT, https://github.com/mrdoob/three.js/blob/dev/LICENSE
- Vite: MIT, https://github.com/vitejs/vite/blob/main/LICENSE
- Khronos glTF Validator (development validation only): Apache-2.0, https://github.com/KhronosGroup/glTF-Validator
- Studio environment and shadow passes are generated in code; no external HDRI or paid assets.

The earlier D46/Diaz et al. model remains credited in Git history. It is no longer displayed or included in the current deployed model.

Reuse on another website must retain appropriate author credit, the CC BY 4.0 link, and a description of modifications.
