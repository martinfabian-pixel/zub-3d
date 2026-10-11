# Editovateľný model s tkanivovými vrstvami

`molar-professional.blend` obsahuje zabalené textúry, materiály a dve kolekcie: viditeľnú HD anatómiu a skrytý mobilný variant. Model má nominálnu výšku 21 mm; táto mierka nie je meraním pôvodnej vzorky. Objekty sú uložené v metroch.

- **Enamel** je uzavretý obal skloviny s vonkajším povrchom, vnútorným rozhraním `EnamelInner` a tenkým krčkovým uzáverom.
- **Dentin** je samostatné uzavreté jadro. V Blenderi používa aj podpovrchový rozptyl; glTF túto Cycles vlastnosť neprenáša.
- **Cementum** je nepriehľadný vonkajší povrch koreňov. Netvorí samostatný uzavretý biologický objem.

Hrúbky a rozdelenie tkanív sú autorskou ilustráciou, nie segmentáciou nameraných tkanív. Zachovaná je anatómia Dundee modelu vrátane troch pôvodných koreňov a UV mapovania. Existujúce konkávne okluzálne ryhy sú miestne prehĺbené najviac o 0,14 mm, doplnené jemným reliéfom integrovaným z pôvodnej normálovej mapy. Bezpečnostné obmedzenia znižujú prehĺbenie aj vnútorný posun tam, kde by sa vrstvy pretínali. Nevznikajú nové generické dráhy fisúr.

Mapy `*-color.png` používajú sRGB. Mapy `*-roughness.png` sú dátové: **R = lokálna ambientná oklúzia, G = drsnosť, B = 0**. Oklúzia je vypočítaná z vonkajšej geometrie s dosahom 0,65 mm a 32 vzorkami; nejde o pigment ani kaz. Zelený kanál `enamel-thickness.png` násobený `0.0016 m` opisuje ilustračnú vzdialenosť medzi korešpondujúcimi bodmi obalu. Pôvodná 4K normálová mapa zostáva nezmenená v adresári Dundee; web používa jej 2K, respektíve mobilnú 1K verziu.

`layers-high.npz` a `layers-mobile.npz` sú generované medzivýsledky geometrie v milimetroch. `layer-diagnostics.json` zaznamenáva spracovanie; `occlusion-bake.json` parametre výpočtu oklúzie. Webové GLB sú v `public/models/`, majú 388 032 a 140 692 trojuholníkov. Úplný pôvod, parametre, obmedzenia a kontrolné súčty obsahuje `public/models/provenance.json`.

Z koreňa repozitára možno model znovu vytvoriť pomocou Pythonu s balíkmi v `scripts/requirements-model.txt` a Blenderu 4.5 LTS (použitá verzia 4.5.14). Blender musí byť v `PATH`, prípadne nastavte premennú `BLENDER_BIN` na jeho spustiteľný súbor.

```text
python scripts/professional_model.py --prepare
blender --background --factory-startup --python scripts/professional_model.py
python scripts/professional_model.py --metadata
```

Druhý krok automaticky overí geometriu, vypočíta oklúziu, uloží oba GLB a editovateľný Blender súbor. Nezávislý audit poskytuje `scripts/audit_layer_geometry.py`. Kontroly technickej geometrie nepredstavujú klinické overenie.

Pôvod: [Maxillary First Molar — University of Dundee, School of Dentistry](https://sketchfab.com/3d-models/maxillary-first-molar-e719a474ef7e4bd7abec508f85f1e984). Autorka Emily McDougall; odborný obsah Dr. Andrew Mason; počiatočná 3D príprava Mark Roughley. Licencia [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), vrátane tejto adaptácie. Pôvodné súbory a doklady sú v [adresári Dundee](../dundee/). Ide o vzdelávaciu rekonštrukciu vytvorenú v ZBrush podľa CT dát, nie o nespracovaný mikroCT sken. Detail fisúr a optická vernosť zostávajú limitované zdrojom a webovým zobrazovaním.
