# ZUB — Čo sa deje medzi zubami

**[Otvoriť interaktívnu prezentáciu](https://martinfabian-pixel.github.io/zub-3d/)**

Začnite pri dolnej ľavej šestke **FDI 36 s dvoma koreňmi**. Jedna súvislá 3D scéna potom ukáže susedov 35 a 37, povlak v priestore 36–37, vznik priestorovej dutiny a bočné použitie medzizubnej kefky. Povlak ubúda iba v dosahu štetín; dutina zostáva aj pri záverečnom oddialení na 28 zubov.

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

[Aktuálne ovládanie, kamera a úsmev](docs/CONTROLS_AND_SMILE.md) · [Príbeh a architektúra](docs/DENTAL_STORY.md) · [Geometria dutiny a dráha kefky](docs/PROXIMAL_SITE.md) · [Odborné zdroje a hranice ilustrácie](docs/DENTAL_STORY_SOURCES.md) · [Dolná šestka a jej export](docs/LOWER_HERO.md) · [Pôvod anatomických predlôh](docs/DENTITION_SOURCES.md) · [Licencie a atribúcia](ATTRIBUTION.md).

Geometria vychádza zo 14 odlišných anatomických modelov **University of Dundee, School of Dentistry**, pod licenciou **CC BY 4.0**. Opačné strany používajú zrkadlené predlohy s vlastnými polohami. Horné a dolné zuby majú rozdielnu pôvodnú geometriu. HDR **Studio Small 09**, Sergej Majboroda / Poly Haven: **CC0**. Kód: MIT. Bez platených assetov a služieb.

Ide o výučbovú ilustráciu, nie individuálny pacientsky sken alebo klinicky validovaný návod. Geometrická kontrola tvrdých povrchov neoveruje bezpečnosť dráhy v živých ústach: ďasná a papila nie sú zobrazené. Pred klinickým použitím má scénu posúdiť zubný lekár alebo dentálna hygienička. Materiály a mikropovrch sú vizualizačné aproximácie. Mobilné browser testy používajú emuláciu, nie fyzický iPhone.

Pred úpravou ovládania bol uložený tag `backup/before-controls-smile-2026-11-04` na funkčnej verzii `f3257d1`. Staršiu verziu pred príbehom uchováva `backup/before-interdental-story-2026-11-04` na `333c359`. [Predchádzajúce štyri kroky](docs/USABILITY.md) a [prvá scrollová verzia](docs/EXPERIENCE.md) zostávajú zdokumentované; `/prototype/` a `/legacy/` sa nemenia.
