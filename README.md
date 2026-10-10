# PROJEKT ZUB — fáza 1

[Otvoriť 3D demo](https://martinfabian-pixel.github.io/zub-3d/)

**Horná ľavá prvá trvalá stolička, FDI 26, s tromi pôvodnými koreňmi.** Jeden zub bez ďasien, biele pozadie a štúdiové osvetlenie. Three.js načítava samostatný GLB. Ťahanie myšou alebo jedným prstom otáča pohľad; koliesko, gesto dvoma prstami alebo tlačidlá +/− menia priblíženie. Tlačidlo so šípkou obnoví pohľad. Klávesnica: šípky, +/− a Home.

## Model a licencia

Základ: **[Maxillary First Molar](https://sketchfab.com/3d-models/maxillary-first-molar-e719a474ef7e4bd7abec508f85f1e984)** od University of Dundee, School of Dentistry. Emily McDougall vytvorila model v ZBrush podľa CT dát; odborný obsah Dr. Andrew Mason, počiatočná 3D príprava Mark Roughley. Súbory boli získané z verejnej vzdelávacej distribúcie [VAMO / inVisu](https://vamo.invisu.ca/vamo/dentaire/molaire_maxillaire.html), ktorá zachováva pôvod a licenciu.

Model a upravená verzia: **[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)**. Kód: MIT. Podrobnosti v [ATTRIBUTION.md](ATTRIBUTION.md), údaje o úpravách v `public/models/provenance.json`. Nepoužívame platené assety.

## Zmena oproti prvému demu

Pôvodný dolný molár D46 bol nahradený samostatným modelom hornej šestky. Jeho tvar nebol deformovaný ani doplnený tretím koreňom. Nový zdroj má štyri hlavné hrbolčeky, šikmý hrebeň, žuvacie ryhy a tri odlišné korene. Zachovali sme pôvodných 57 008 trojuholníkov, normály, UV súradnice a nezmenenú 4096 × 4096 mapu povrchového detailu. Pôvodná 4K farebná mapa dostala jemné farebné úpravy; svetlejšie korene a malé teplé/studené odchýlky skloviny. Geometria sa nevyhladzuje interpoláciou.

Lesklejšia sklovina má jemné presvitanie a farebné odchýlky; korene majú teplejší, drsnejší povrch. Veľké štúdiové svetelné plochy vytvárajú mäkké odlesky. Kontaktný tieň vychádza zo skutočného tvaru modelu. Priblíženie používa rozmery zuba, aby mobil umožnil rovnakú detailnú kontrolu ako počítač.

## Kvalita a hranice tejto verzie

Toto je anatomická vzdelávacia rekonštrukcia podľa CT, **nie neupravený mikro-CT sken ani klinicky overený digitálny odtlačok**. Pôvodné 4K mapy sú výtvarne vytvorené. Drsnosť, farebné doplnenia a priesvitnosť sú vizuálne úpravy; zdroj neposkytuje meranú optiku ani oddelené vrstvy skloviny a dentínu. Jednotná mierka v GLB predstavuje ilustratívnu výšku 21 mm, nie meranie pôvodného zuba.

**Zatiaľ ju nepovažujeme za finálnu profesionálnu fotorealistickú medicínsku vizualizáciu.** Pri extrémnom zoome zostáva viditeľné zjednodušenie jemných fisúr a mikropovrchu. Na vyššiu úroveň treba detailnejší povrchový alebo mikro-CT sken hornej šestky, fotografické referencie pre PBR textúry, samostatnú vrstvu skloviny nad dentínom a kontrolu anatómie stomatológom. Presvitanie jedného povrchu vo WebGL zostáva aproximáciou.

## Lokálne spustenie

Node.js 22.12+ a pnpm 10:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Produkčná zostava: `pnpm build`. Náhľad: `pnpm preview`. Všetky zdroje aj GLB sú z rovnakej domény, bez CDN a analytiky. GitHub Actions pri zmene vetvy `main` publikuje demo na GitHub Pages; bežný build nepotrebuje Blender ani Python.

## Reprodukcia modelu a kontrola

Neupravené zdrojové glTF, binárny buffer a textúry spolu s kontrolnými súčtami sú v `assets/source/`. Výsledný GLB má približne 5,7 MB a vloží textúry a materiály do jedného súboru. Presné nastavenia a zmeny zaznamenáva `public/models/provenance.json`.

```sh
python -m pip install -r scripts/requirements-model.txt
python scripts/prepare_model.py
node scripts/validate-model.mjs
pnpm build
```

Khronos glTF Validator: 0 chýb, 0 varovaní. Produkčná zostava prešla. V prehliadači sme overili načítanie, detail žuvacej plochy, tri korene, rotáciu myšou a klávesnicou, zoom, presný reset pohľadu a rozloženie 390 × 844 bez vodorovného pretečenia. WebGL kontrola nehlási chyby. Mobilný rozmer je emulovaný na počítači; fyzický telefón nebol testovaný.

## Rozsah

Len fáza 1: jeden molár a prehliadač. Ďalšia práca sa začne až po hodnotení vzhľadu používateľom.
