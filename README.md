# ZUB — Čo sa deje medzi zubami

**[Otvoriť interaktívnu prezentáciu](https://martinfabian-pixel.github.io/zub-3d/)**

Začnite pri dolnej ľavej šestke **FDI 36 s dvoma koreňmi**. Scéna ukáže povlak a príklad kazovej dutiny. Kliknutie na kaz otvorí krátku animovanú ilustráciu. Nasleduje samostatný príklad preventívneho čistenia na zdravom zube; povlak ubúda iba v dosahu štetín. Vzniknutú dutinu kefka neopraví a treba ju odborne ošetriť.

Sedem kapitol **Zub / Priestor / Povlak / Kaz / Čistenie / Výsledok / Chrup** ovláda prirodzený zvislý posun stránky alebo priama navigácia. **Model môžete rovno chytiť a otočiť**, už od prvého zuba. Na mobile vodorovne otáčate a zvislo posúvate príbeh. **Voľné 3D** pozastaví ukážku, umožní obe osi a zoom kolieskom alebo dvoma prstami. **Pokračovať v príbehu** sa plynulo vráti do pripravenej kompozície. Záver má dva pohľady: **Úsmev** na korunky a **Anatómia** na všetky zachované korene.

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

[Aktuálne korunkové finále, pôvod assetu a zábery](docs/CROWN_FINALE.md).

Text, 3D model a popisky patria do jednej plochy na ľadovomodrom pozadí. Sedem navigačných bodiek, šípky a počítadlo kapitoly fungujú na počítači aj mobile. Pri otočení ostávajú popisky pripojené k označeným miestam zubov; zakryté sa skryjú. Podrobné vysvetlenia otvára tlačidlo **Výučbová ukážka · poznámky**. [Snímky všetkých kapitol a kontroly](docs/SHARED_STAGE_QA.md) · [Príbeh a architektúra](docs/DENTAL_STORY.md) · [Geometria dutiny a dráha kefky](docs/PROXIMAL_SITE.md) · [Odborné zdroje a hranice ilustrácie](docs/DENTAL_STORY_SOURCES.md) · [Dolná šestka a jej export](docs/LOWER_HERO.md) · [Pôvod anatomických predlôh](docs/DENTITION_SOURCES.md) · [Licencie a atribúcia](ATTRIBUTION.md).

Geometria vychádza zo 14 odlišných anatomických modelov **University of Dundee, School of Dentistry**, pod licenciou **CC BY 4.0**. Opačné strany používajú zrkadlené predlohy s vlastnými polohami. Horné a dolné zuby majú rozdielnu pôvodnú geometriu. HDR **Studio Small 09**, Sergej Majboroda / Poly Haven: **CC0**. Kód: MIT. Bez platených assetov a služieb.

Ide o výučbovú ilustráciu, nie individuálny pacientsky sken alebo klinicky validovaný návod. Geometrická kontrola tvrdých povrchov neoveruje bezpečnosť dráhy v živých ústach: ďasná a papila nie sú zobrazené. Pred klinickým použitím má scénu posúdiť zubný lekár alebo dentálna hygienička. Materiály a mikropovrch sú vizualizačné aproximácie. Mobilné browser testy používajú emuláciu, nie fyzický iPhone.

Východiskom spoločnej scény je verzia `3f52ac5` pod tagom `backup/before-shared-stage-2026-11-04`. [Predchádzajúca vizuálna úprava](docs/VISUAL_POLISH.md) dokumentuje vznik podrobnejšieho okraja dutiny a vrstvy povlaku.
