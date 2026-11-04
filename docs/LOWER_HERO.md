# Dolná prvá stolička v úvodnom detaile

FDI 36 je skutočná dolná ľavá prvá stolička Dundee s dvoma pôvodnými koreňmi. Nové `hero-36.glb` a `hero-36-mobile.glb` používajú **všetkých 55 184 pôvodných trojuholníkov a 27 741 vrcholov vrátane UV švov**. Mení sa rozlíšenie materiálovej mapy, nie počet trojuholníkov. Lokálna sústava v metroch je presne tá istá ako pri `FDI_36` v atlase: na umiestnenie netreba dodatočnú korekciu. Pravá dolná šestka FDI 46 používa zrkadlený tvar so svojou pôvodnou maticou. Horné šestky FDI 26/16 si ponechávajú schválený samostatný model.

[Originál Mandibular First Molar](https://sketchfab.com/3d-models/mandibular-first-molar-e1c919d6603846eca873154eeededdd6) vytvorila University of Dundee, School of Dentistry; Emily McDougall, Dr. Andrew Mason a Mark Roughley. Zdroj a odvodené modelové dáta sú [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [Úplná atribúcia](../public/dentition-assets/hero-36-credits.txt) a [technický pôvod](../public/dentition-assets/hero-36-provenance.json).

Vstup má normály vrcholov a 4K farebnú mapu, ale žiadnu samostatnú normálovú textúru ani uložené tangenty. Výstup zachováva autorské normály a UV; tangentový rámec je vypočítaný z pôvodných trojuholníkov a UV derivácií. Neutrálna normálová textúra **1 × 1** zachováva spoločné rozhranie materiálov bez predstierania nového snímaného detailu. Vloženej mape RGBA stačí 2048² pixelov na počítači alebo 1024² na mobile: R je maska skloviny, G drsnosť, B lokálna tónová variácia, A geometrická ambientná viditeľnosť. Materiál je nepriehľadný; mikropovrch v prehliadači je autorská aproximácia.

| Profil | Veľkosť 36 GLB | Trojuholníky 36 | Textúry 36 s mipmapami (odhad RGBA8) |
|---|---:|---:|---:|
| Počítač | 2 630 860 B | 55 184 | 21,33 MiB |
| Mobil | 2 076 272 B | 55 184 | 5,33 MiB |

Celý viditeľný chrup s touto plnou geometriou na 36/46 a zachovanou hornou 26/16 má **658 384 trojuholníkov na počítači, 422 384 na mobile**, bez dodatočných tieňových priechodov. Tri použité materiálové sady (atlas, horná šestka a dolná šestka) predstavujú približne 106,7 / 26,7 MiB mipovaných RGBA8 textúr, nie celkovú pamäť prehliadača.

Oba GLB prešli Khronos validáciou bez chýb a varovaní. Na troch samostatných úrovniach apikálnej časti sú dva priečne koreňové obrysy. [Kontrola pôvodnej geometrie](lower-hero-review/geometry-proof.json) potvrdzuje presnú zhodu poradia indexov a UV so zdrojom; najväčšia odchýlka polohy po dohodnutej transformácii je pod 0,000001 mm, zodpovedajúca zaokrúhleniu Float32. [Kontrola všetkých polôh](lower-hero-review/contact-audit.json) na skutočných súboroch oboch profilov nezistila prienik v žiadnej zo 182 dvojíc v rovnakom oblúku a 196 protiľahlých dvojíc, **pri uložených polohách a prezentačnom otvorení 8 mm**. Tento výsledok neposudzuje klinický zhryz.

Reprodukcia z koreňa repozitára (Python s `scripts/requirements-dentition.txt`, Blender 4.5 LTS cez `BLENDER_BIN` alebo `PATH`):

```sh
python scripts/prepare_lower_hero.py
node scripts/validate-lower-hero.mjs
```

Skript vytvára iba dva nové GLB a ich pôvod. Existujúce atlasy, umiestnenie všetkých 28 zubov a schválené pôvodné modely kontroluje podľa hashov a nezapisuje do nich.
