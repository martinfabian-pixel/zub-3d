# Model and asset attribution

The displayed tooth is adapted from **Maxillary First Molar (Left)**, the permanent upper left first molar **FDI 26 / UL6**, by **University of Dundee, School of Dentistry**.

- Created by **Emily McDougall**, in ZBrush using CT data.
- Content expert: **Dr. Andrew Mason**.
- Initial 3D preparation: **Mark Roughley**.
- Original: https://sketchfab.com/3d-models/maxillary-first-molar-e719a474ef7e4bd7abec508f85f1e984
- Author: https://sketchfab.com/DundeeDental
- Source and displayed adaptation: **CC BY 4.0**, https://creativecommons.org/licenses/by/4.0/
- Acquired through **VAMO / inVisu** public educational redistribution: https://vamo.invisu.ca/vamo/dentaire/molaire_maxillaire.html

The original glTF contains matching author, source and license metadata. The untouched source files and checksums are retained in `assets/source/dundee/`. The displayed adaptation retains its attribution in the GLB copyright metadata and the viewer credit link. No endorsement by Dundee or clinical validation is implied.

## Adaptation

The source has three native roots; none was added to a mandibular tooth. Its anatomical silhouette, cusp arrangement and oblique ridge remain the basis of this adaptation. The new pipeline integrates a small amount of native normal-map relief and deepens existing occlusal concavities by a bounded maximum of 0.14 mm. It does not introduce a generic cross-shaped groove or replace the tooth with procedural primitives. Linear subdivision provides samples for this refinement; it is not evidence of new scan resolution.

The exterior is partitioned at its source crown/root boundary. A closed enamel shell and an inset dentin core supply separate optical surfaces. Cementum represents the outer root surface. The variable enamel thickness, dentin geometry and cervical boundary are **authored visualization approximations**, not measured histological segmentation. The source contains no measured enamel/dentin interface. Nominal total height of 21 mm is illustrative, not a calibrated specimen measurement.

Authored color, roughness and thickness maps use the source UV coordinates and restrained native variation. The source normal map is retained or downsampled for the relevant web variant. Local geometric occlusion is baked in Cycles from the exterior only and packed with roughness. PBR optics use transmission, refraction and absorption over the dentin core; the web dentin shader wraps 18% of punctual/directional diffuse lighting. Area-light LTC and IBL contributions remain unchanged. This is not a full volumetric subsurface scattering simulation or a photographic measurement of tooth appearance. Exact parameters, geometry changes and export hashes are recorded in `public/models/provenance.json` and `scripts/professional_model.py`.

The editable Blender scene and its tissue maps are in `assets/source/professional/`. The adapted model and tissue textures are distributed under CC BY 4.0. Processing and viewer code are MIT.

## Studio environment

**Studio Small 09**, by **Sergej Majboroda**, from **Poly Haven**:

- Asset: https://polyhaven.com/a/studio_small_09
- License: **CC0**, https://polyhaven.com/license
- Original 1K HDR: https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr
- Local unmodified file: `public/environment/studio-small-09-1k.hdr`
- SHA256: `e7cfda5f4e98e623db12b8bfd0184e048488e4855d9c83e2751fb44a32e80c45`

This local HDR supplies the reflection environment. Supplementary area lights, fallback environment and contact shadow are generated in viewer code. The visible background stays white. No paid asset or service is used.

## References and software

The comparison and primary anatomical/optical references are listed in [docs/MODEL_REVIEW.md](docs/MODEL_REVIEW.md). Book pages, research papers, third-party photographs and candidate preview images were consulted for review only; they are not included as deployed textures or redistributed in this repository. No Melbourne, Aichi, UFSC or ToothFairy mesh is incorporated.

- Viewer and processing scripts: MIT, see `LICENSE`.
- Three.js: MIT, https://github.com/mrdoob/three.js/blob/dev/LICENSE
- Vite: MIT, https://github.com/vitejs/vite/blob/main/LICENSE
- Khronos glTF Validator: Apache-2.0, https://github.com/KhronosGroup/glTF-Validator
- Blender 4.5 LTS, used as an external modeling/export tool: GPL, https://www.blender.org/about/license/

The earlier D46/Diaz et al. model remains credited in Git history and is not included in the current deployed tooth. Reuse must retain appropriate credit, the CC BY 4.0 link and a description of modifications.
