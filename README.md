# ZUB — Ľudský chrup v 3D

**[Otvoriť interaktívnu prezentáciu](https://martinfabian-pixel.github.io/zub-3d/)**

Začnite pri dolnej ľavej šestke **FDI 36 s dvoma koreňmi** a postupne odhaľte susedné zuby, dolný oblúk a celý chrup s 28 zubami. Stránka má štyri priame navigačné kroky, krátke anatomické opisy, návod a otáčanie, zoom aj reset v každom kroku. Posun stránky zostáva prirodzený a plne reverzibilný.

## Spustenie

Node.js 22.12+ a pnpm 10, z koreňa repozitára:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Otvorte **http://127.0.0.1:5173/**. Produkčná zostava: `pnpm build`; lokálny náhľad: `pnpm preview`. Stack zostáva Vite + Three.js r186, bez novej frameworkovej vrstvy a bez runtime CDN.

- **Hlavná stránka:** [`/`](https://martinfabian-pixel.github.io/zub-3d/).
- **Rovnaká prezentácia:** [`/experience/`](https://martinfabian-pixel.github.io/zub-3d/experience/).
- **Schválený samostatný horný molár:** [`/prototype/`](https://martinfabian-pixel.github.io/zub-3d/prototype/).
- **Pôvodný hlavný prehliadač:** [`/legacy/`](https://martinfabian-pixel.github.io/zub-3d/legacy/).

## Dokumentácia a zdroje

[Ovládanie, architektúra, zmenené súbory a testy](docs/USABILITY.md) · [Dolná šestka a jej export](docs/LOWER_HERO.md) · [Pôvod všetkých anatomických predlôh](docs/DENTITION_SOURCES.md) · [Licencie a atribúcia](ATTRIBUTION.md).

Geometria vychádza zo 14 odlišných anatomických modelov **University of Dundee, School of Dentistry**, pod licenciou **CC BY 4.0**. Opačné strany používajú zrkadlené predlohy s vlastnými polohami. Horné a dolné zuby majú rozdielnu pôvodnú geometriu. HDR **Studio Small 09**, Sergej Majboroda / Poly Haven: **CC0**. Kód: MIT. Bez platených assetov a služieb.

Ide o výučbové rekonštrukcie, nie individuálny pacientsky sken alebo klinicky validovaný zhryz. Materiály a mikropovrch sú vizualizačné aproximácie; modely sa nevydávajú za nerozoznateľné od fotografie. Mobilné browser testy používajú emuláciu, nie fyzický iPhone.

Pred úpravou rozhrania bol uložený tag `backup/before-usable-lower-molar-2026-11-04`. [Predchádzajúca scrollová verzia](docs/EXPERIENCE.md) a pôvodné geometrické podklady zostávajú zdokumentované.
