# ZUB-3D — jeden horný prvý molár

**Nová fáza: [súvislý 3D zážitok s 28 zubami](https://martinfabian-pixel.github.io/zub-3d/experience/)**. Jeden zub → susedia → horný oblúk → celý chrup, riadené bežným scrollom. [Spustenie, architektúra, testy a obmedzenia](docs/EXPERIENCE.md) · [Pôvod 14 odlišných anatomických predlôh a licencie](docs/DENTITION_SOURCES.md). Pôvodná stránka nižšie a [schválený samostatný prototyp](https://martinfabian-pixel.github.io/zub-3d/prototype/) zostávajú zachované.

[Otvoriť interaktívne demo](https://martinfabian-pixel.github.io/zub-3d/)

Horná ľavá prvá trvalá stolička **FDI 26 / UL6**, s tromi pôvodnými koreňmi. Jeden zub bez ďasien, biele pozadie a ovládanie myšou, dotykom aj klávesnicou. Ťahanie otáča pohľad, koliesko alebo gesto dvoma prstami približuje. Tlačidlo so šípkou a kláves Home obnovia pohľad.

## Čo sa prepracovalo

Z jednej farebnej vonkajšej siete vznikol model so samostatnou sklovinou, dentínovým jadrom a povrchom cementu koreňov. Uzavretá sklovina má premenlivú hrúbku nad teplejším dentínom. Nové farebné, roughness a thickness mapy dodávajú miestnu variáciu; lom, prenos svetla a absorpcia pracujú s vnútornými plochami. Webový dentín má obmedzenú aproximáciu rozptylu svetla, bez emisívneho zosvetľovania.

Pôvodná anatómia Dundee je podkladom geometrických úprav. Jemný natívny normálový reliéf sa čiastočne preniesol do geometrie. Existujúce okluzálne konkavity sa prepracovali s ohraničenou hĺbkou do 0,14 mm; nevytvára sa generická krížová ryha cez šikmý hrebeň. Pridané vzorky siete umožňujú tento reliéf zobraziť, nenahrádzajú chýbajúce meranie z mikro-CT.

Skutočné lokálne **HDR prostredie Studio Small 09** dopĺňa veľký čelný plošný zdroj a slabší protisvetelný reflektor. PBR, Neutral tone mapping a biele pozadie oddeľujú optické prostredie od farby stránky. Kontaktný tieň vychádza z tvaru zuba. Ovládanie a jednoduchý vzhľad prehliadača ostávajú zachované.

Mobil používa ľahší GLB, menšie textúry a obmedzené rozlíšenie refrakčného renderu. Predvolená kamera vypočítava rámovanie zo skutočných vrcholov, rezervuje miesto ovládaniu a väčšmi využíva šírku mobilnej obrazovky. Kreslí sa iba pri potrebe zmeny pohľadu; nepridali sa automatické animácie.

## Pôvod a licencia

Základ: [Maxillary First Molar](https://sketchfab.com/3d-models/maxillary-first-molar-e719a474ef7e4bd7abec508f85f1e984), **University of Dundee, School of Dentistry**. Model vytvorila Emily McDougall v ZBrush podľa CT, odborný obsah Dr. Andrew Mason, počiatočná príprava Mark Roughley. Súbory boli získané z verejnej vzdelávacej distribúcie [VAMO / inVisu](https://vamo.invisu.ca/vamo/dentaire/molaire_maxillaire.html).

Zdrojový aj upravený model: **[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)**. HDR: **[Studio Small 09](https://polyhaven.com/a/studio_small_09)**, Sergej Majboroda / Poly Haven, **[CC0](https://polyhaven.com/license)**. Kód: MIT. Bez platených assetov alebo služieb. Podrobnosti: [ATTRIBUTION.md](ATTRIBUTION.md), presné exporty: [provenance.json](public/models/provenance.json).

[Porovnanie anatomických zdrojov a primárne referencie](docs/MODEL_REVIEW.md) vysvetľujú výber Dundee. Jemnejší Melbourne FDI26 je perspektívny bezplatný microCT model s CC BY 4.0, ale oprávnený export vyžaduje prihlásenie na Sketchfab; v tejto verzii sa jeho sieť nepoužíva.

## Kvalita a konkrétne hranice

Ide o CT-informovanú anatomickú rekonštrukciu s upravenou vizualizáciou. **Nie je to novo získaný mikro-CT sken ani klinicky validovaný digitálny odtlačok.** Vonkajšia geometria má anatomický podklad; nové vnútorné tkanivové vrstvy a hrúbka skloviny sú výtvarná aproximácia. Zdroj neposkytuje histologickú segmentáciu ani merané PBR vlastnosti. Nominálna výška 21 mm slúži na ilustratívne optické jednotky, nie na tvrdenie o rozmeroch vzorky.

Three.js/glTF volume simuluje lom a absorpciu. Doplnený shader dentínu prerozdeľuje 18 % priameho difúzneho svetla bodových/smerových zdrojov; plošné LTC osvetlenie a IBL nemení. **Nesimuluje úplný objemový podpovrchový rozptyl**. Kontrolné Cycles rendery preto nie sú dôkazom rovnakého renderovania na webe. Pri extrémnom makro priblížení je ďalej hranicou jemnosť zdrojovej anatómie a dostupnosť fotograficky kalibrovaných materiálov. Fotorealizmus na úrovni nerozoznateľnej fotografie sa netvrdí.

## Spustenie a publikovanie

Node.js 22.12+ a pnpm 10:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Produkčná zostava: `pnpm build`; lokálny produkčný náhľad: `pnpm preview`. GitHub Actions na vetve `main` validuje oba GLB a publikuje `dist` na GitHub Pages. Bežný build nepotrebuje Blender ani Python. Modely, HDR a skripty sa načítajú z rovnakej domény, bez CDN a analytiky. URL modelov obsahujú odtlačok obsahu, aby cache nemiešala nový prehliadač so starým zubom.

## Upraviteľný model a reprodukcia

Neupravené glTF, buffer a mapy s kontrolnými súčtami sú v `assets/source/dundee/`. Upraviteľná scéna Blender 4.5 LTS a odvodené mapy sú v `assets/source/professional/`. HD a mobilná geometria sú v oddelených kolekciách. Reprodukcia vždy číta nemenný zdroj Dundee, nie už upravený výstupný GLB.

Blender 4.5 LTS musí byť v `PATH`, prípadne nastavte `BLENDER_BIN` na absolútnu cestu k spustiteľnému súboru. Plošný bake lokálneho zatienenia sa pri Blender exporte vykoná automaticky z pripravenej vonkajšej siete.

```sh
python -m pip install -r scripts/requirements-model.txt
python scripts/professional_model.py --prepare
blender --background --factory-startup --python scripts/professional_model.py
node scripts/validate-model.mjs
pnpm build
```

Nezávislý offline render zo štyroch smerov:

```sh
blender --background --factory-startup --python scripts/render_review.py -- --model public/models/molar.glb --output review/cycles
```

Pred zásahom bol zachovaný tag `backup/materials-before-professional-2026-10-11` na commite `548d53a`, lokálny Git bundle a pôvodný funkčný GLB. Nepridali sa ďalšie zuby, kaz, kefka, scroll animácie ani textové sekcie do webu. Ďalšia fáza sa začne až po hodnotení vzhľadu používateľom.

## Rozpočet a overenie

Desktop GLB: **388 032 trojuholníkov / 17,57 MB**, mobil: **140 692 / 6,87 MB**. Odhad dekódovaných materiálových textúr s mipmapami je 96/32 MiB; neobsahuje render targets a ďalšiu réžiu GPU. Oba exporty prešli Khronos validátorom bez chýb a varovaní a nezávislým geometrickým auditom. Produkčná zostava prešla.

[Záznam vizuálnych kontrol, snímky a konkrétne obmedzenia](docs/QUALITY_REVIEW.md) oddeľujú skutočné webové screenshoty od offline Cycles renderov. Testované boli pohľady spredu, zboku, zozadu a zhora, myš, zoom, reset a emulované mobilné rozloženia. Fyzický telefón nebol dostupný na testovanie.
