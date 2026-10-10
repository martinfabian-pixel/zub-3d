# PROJEKT ZUB — fáza 1

[Otvoriť 3D demo](https://martinfabian-pixel.github.io/zub-3d/)

Jeden ľudský molár bez ďasien, biele pozadie a štúdiové osvetlenie. Three.js načítava samostatný GLB model. Ťahanie myšou alebo jedným prstom otáča pohľad; koliesko, gesto dvoma prstami alebo tlačidlá +/− menia priblíženie. Tlačidlo so šípkou obnoví pohľad. Pre klávesnicu: šípky, +/− a Home.

## Model a licencia

Použitý je **D46, prvá dolná pravá stolička**, zo skenových dát publikovaných Cristianom Diazom, Carlosom Andresom Ferro Sanchezom a Oscarom Campom (2024): [Mendeley Data, V1, DOI 10.17632/97c3pf8h2h.1](https://data.mendeley.com/datasets/97c3pf8h2h/1).

Model a jeho upravená verzia: **[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)**. Kód prehliadača: MIT. Podrobnosti v [ATTRIBUTION.md](ATTRIBUTION.md), údaje o exporte vedľa modelu v `public/models/`.

## Kvalita a hranice tejto verzie

Tvar vychádza z reálneho skenovania, s prirodzenou asymetriou a dvoma koreňmi. Pôvodný povrch bol autormi datasetu remeshovaný pri 0,25 mm. Farebnosť, drsnosť, lesk, priesvitnosť a rozhranie skloviny a koreňov sú výtvarne vytvorené; zdroj ich nemeral.

**Táto verzia ešte nie je finálna profesionálna fotorealistická medicínska vizualizácia.** Limity sú najmä rozlíšenie fisúr, drobné rekonštrukčné nerovnosti korunky a chýbajúce fotografické PBR textúry. Vyhladenie nedokáže obnoviť detaily, ktoré zdroj neobsahuje. Pre vyššiu kvalitu odporúčame detailnejší mikro-CT alebo povrchový sken, kontrolu anatómie stomatológom a úpravu v Blenderi: retopológiu, anatomicky presné rozhranie skloviny, UV mapy a textúry vytvorené podľa fotografií. Materiálové presvitanie vo WebGL je aproximácia.

## Lokálne spustenie

Vyžaduje Node.js 22.12+ a pnpm 10.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Produkčný zostavovací príkaz: `pnpm build`. Náhľad zostavy: `pnpm preview`. Výstup je v `dist/`; všetky zdroje prehliadača a GLB sa poskytujú z rovnakej domény, bez CDN a bez analytiky.

GitHub Actions pri zmene vetvy `main` zostaví a publikuje demo na GitHub Pages. Model je uložený v repozitári; bežný build nepotrebuje Blender ani Python.

## Reprodukcia modelu a kontrola

GLB obsahuje 183 296 trojuholníkov, štyri vložené textúry 1024 × 1024 a má približne 7,7 MB. Dve iterácie interpolácie Loop vyhladzujú pôvodných 11 456 trojuholníkov; nezvyšujú rozlíšenie merania. Neupravený zdroj a kontrolný súčet zostávajú v repozitári.

```sh
python -m pip install -r scripts/requirements-model.txt
python scripts/prepare_model.py
node scripts/validate-model.mjs
```

Khronos glTF Validator: 0 chýb, 0 varovaní. V prehliadači boli overené načítanie, rotácia myšou a klávesnicou, zoom, reset a rozloženie 390 × 844 bez vodorovného pretečenia. Mobilný rozmer bol emulovaný na desktope; fyzický telefón nebol testovaný.

## Rozsah

Len fáza 1: jeden molár a prehliadač. Ďalšie fázy sa začnú až po hodnotení používateľa.
