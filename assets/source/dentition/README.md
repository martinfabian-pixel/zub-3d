# Anatomické podklady zostavy 28 zubov

Trinásť súborov GLB v tomto adresári sú nezmenené verejné redistribúcie konkrétnych ľavých zubov **University of Dundee, School of Dentistry**, získané cez TeethAtlas. Štrnásty anatomický typ je už v projekte: pri FDI 26 a 16 sa používa existujúci schválený prvý horný molár z `public/prototype-assets/`. Nie je nahradený variantom s Carabelliho hrbolčekom. Všetky typy modelu majú licenciu [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [Kredity s odkazmi na jednotlivé originály](../../../public/dentition-assets/credits.txt).

- `sources.json`: presný vstupný súbor, jeho kontrolný súčet, URL redistribúcie, originálu a zodpovedajúce FDI. `license-evidence.json` uchováva pôvodné vložené licenčné údaje aj nezávisle načítané metadáta autora zo Sketchfab.
- `placement-28.json`: registrácia každého typu do skutočnej polohy v autorskej zostave [Permanent Dentition](https://sketchfab.com/3d-models/permanent-dentition-2f69d7b59c3e4a6a8bcae041bd8e591b). Pravé zuby používajú **zrkadlený ľavý tvar**, no ich natočenie a poloha sa prispôsobili príslušným pravým zubom v tejto zostave. RMS odchýlka registrácie vzorkovaných povrchov bola približne 0,060–0,092 mm v ilustračnej mierke. Nejde o klinický záznam oklúzie.
- `presentation-clearance.json`: malé horizontálne prezentačné posuny na odstránenie prekrytia medzi susedmi. Pôvodné natočenia ani tvar sa nemenia. V odovzdanom `manifest.json` sú posuny už zahrnuté v `matrix`; nepoužívajte ich druhýkrát. `sourceMatrix` zostáva samostatne pre kontrolu.
- `mesh-audit.json` a `final-lod-contact-audit.json`: výsledky kontrol skutočných výstupov. Obe verzie všetkých trinástich typov sú po spojení UV švov uzavreté, konzistentne orientované a majú jeden súvislý vonkajší povrch. Na presných uložených verziách oboch atlasov a hrdinského molára nebol zistený prienik pri 182 dvojiciach v rovnakom oblúku a 196 protiľahlých dvojiciach; protiľahlé oblúky boli otvorené o +0,32 / −0,48 cm. Najväčší posun bol 0,966 mm pri 47. Audit je viazaný na zaznamenané kontrolné súčty, mierku a otvorenie.

Matice v **vstupnom** `placement-28.json` sú zapísané ako riadky a používajú stĺpcové vektory. Matice vo **výstupnom** `public/dentition-assets/manifest.json` sú 16-prvkové polia **column-major**, priamo pre `THREE.Matrix4.fromArray()`. Mapujú lokálne metre GLB do svetových centimetrov: +X je ľavá strana pacienta, +Y smer nahor, +Z smer dopredu. Pravá strana už obsahuje záporný determinant. Nepoužívajte ďalšie zrkadlenie. `cervicalRing` uvádza 16 lokálnych bodov v metroch, odvodených z pôvodnej farby krčka; nejde o segmentované ďasno. Referenčný horný prvý molár definuje nominálnu výšku 21 mm; mierka nepredstavuje pôvodné meranie vzorky.

Pri 31/32 sa dva verejné názvy zdrojov rozchádzajú s vnútorným LL1/LL2 aj s tvarom a polohou v zdrojovej zostave. Mapovanie v tomto projekte je overené porovnaním oboch kandidátov so zdrojovým LL1 a LL2. Súbor s pôvodným názvom *mandibular_left_lateral_incisor* je tvar LL1 (31/41); *mandibular_left_central_incisor* je LL2 (32/42). Nezmenené pôvodné názvy a kontrolné súčty sú zachované.

Reprodukcia z koreňa repozitára: Python s balíkmi z `scripts/requirements-dentition.txt` a Blender 4.5 LTS (overené na 4.5.14). Nastavte `BLENDER_BIN` na spustiteľný súbor Blenderu alebo ho pridajte do `PATH`.

```text
python scripts/prepare_dentition.py
node scripts/validate-dentition.mjs
```

Výstupy sú výlučne v `public/dentition-assets/`. Blender prenesie UV pri redukcii geometrie. Malá uzavretá vnútorná dutina pri 33/43 sa vo vonkajšom modeli nepoužíva. Každý atlas má jeden spoločný materiál a dve vložené textúry: pôvodnú zmenšenú normálovú mapu a mapu **R = sklovina, G = drsnosť, B = lokálna tónová variácia, A = geometrická ambientná viditeľnosť**. Nový webový balík nepotrebuje Draco dekodér; ten sa používa iba pri príprave pôvodných súborov. Pri zmene geometrie alebo polôh zopakujte kontaktný audit, nestačí znovu použiť jeho pôvodný výsledok.
